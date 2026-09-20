from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Family, FamilyMember, Relationship, LifeEvent, Document, User
from app.schemas.inputs import LifeEventIn, MemberIn
from app.services.common import audit, notify
from app.services.duplicates import open_case
from app.services.eligibility import recalculate_family
from .deps import serialize, my_family, load_family, is_officer
from .families import _new_member, _member_payload

router = APIRouter(prefix="/life-events", tags=["life-events"])

EVENT_TYPES = ("BIRTH", "MARRIAGE", "DEATH", "DIVORCE", "SEPARATION", "ADOPTION", "GUARDIANSHIP",
               "ADDRESS_CHANGE", "MIGRATION", "SPLIT")
MEMBER_REQUIRED = ("DEATH", "DIVORCE", "SEPARATION", "ADOPTION", "GUARDIANSHIP", "SPLIT", "MARRIAGE")


def _resolve_family(db: Session, user: User, body: LifeEventIn) -> Family:
    if is_officer(user):
        family_id = body.details.get("family_id") if body.details else None
        if not family_id:
            raise HTTPException(400, "Officers must pass details.family_id to report a life event for a family")
        try:
            family_id = UUID(str(family_id))
        except ValueError:
            raise HTTPException(400, "details.family_id is not a valid identifier")
        return load_family(db, user, family_id)
    fam = my_family(db, user)
    if fam is None:
        raise HTTPException(400, "You are not enrolled in a family yet. Create your family profile first.")
    return fam


def _member_of(db: Session, fam: Family, member_id, label: str) -> FamilyMember:
    m = db.get(FamilyMember, member_id)
    if m is None or m.family_id != fam.family_id:
        raise HTTPException(404, f"{label} not found in this family")
    return m


def _link_parent(db: Session, parent: FamilyMember, child: FamilyMember, user, document_id=None, start=None) -> Relationship:
    """Record parent -> child and child -> parent relationships. Types are chosen from each person's own gender."""
    parent_type = "MOTHER" if parent.gender == "FEMALE" else "FATHER"
    child_type = "DAUGHTER" if child.gender == "FEMALE" else "SON"
    status = "VERIFIED" if document_id else "UNVERIFIED"
    r1 = Relationship(member_id=parent.member_id, related_member_id=child.member_id, relationship_type=parent_type,
                      start_date=start, evidence_document_id=document_id, verification_status=status)
    r2 = Relationship(member_id=child.member_id, related_member_id=parent.member_id, relationship_type=child_type,
                      start_date=start, evidence_document_id=document_id, verification_status=status)
    db.add_all([r1, r2]); db.flush()
    audit(db, user, "RELATIONSHIP_CHANGED", "RELATIONSHIP", r1.relationship_id, parent.family_id,
          new_value={"member": parent.name, "type": parent_type, "related": child.name})
    return r1


@router.post("", status_code=201)
def report_life_event(body: LifeEventIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    event_type = body.event_type.upper()
    if event_type not in EVENT_TYPES:
        raise HTTPException(400, f"Unknown event type. Allowed types: {', '.join(EVENT_TYPES)}")
    fam = _resolve_family(db, user, body)
    if fam.family_status in ("MERGED", "INACTIVE"):
        raise HTTPException(400, "This family is closed. Life events cannot be reported for it.")
    details = dict(body.details or {})
    details.pop("family_id", None)
    if body.event_date and body.event_date > date.today():
        raise HTTPException(400, "The event date cannot be in the future")
    if body.document_id:
        doc = db.get(Document, body.document_id)
        if doc is None:
            raise HTTPException(404, "Supporting document not found")

    member = _member_of(db, fam, body.member_id, "Member") if body.member_id else None
    related = _member_of(db, fam, body.related_member_id, "Related member") if body.related_member_id else None
    if event_type in MEMBER_REQUIRED and member is None:
        raise HTTPException(400, f"member_id is required for a {event_type.replace('_', ' ').lower()} event")
    if event_type in ("DIVORCE", "SEPARATION", "MARRIAGE") and member is not None and related is not None and member.member_id == related.member_id:
        raise HTTPException(400, "A member cannot be related to themself")
    if event_type == "DEATH" and member is not None and member.member_status == "DECEASED":
        raise HTTPException(400, f"{member.name} is already recorded as deceased")
    if event_type in ("ADDRESS_CHANGE", "MIGRATION") and not details.get("address_line"):
        raise HTTPException(400, "details.address_line is required for an address change")

    created_member = None
    reason = f"{event_type.replace('_', ' ').title()} reported"

    if event_type == "BIRTH":
        if body.newborn is None:
            raise HTTPException(400, "Details of the newborn are required for a birth event")
        if member is None and related is None:
            raise HTTPException(400, "At least one parent (member_id or related_member_id) is required for a birth event")
        if member is not None and related is not None and member.member_id == related.member_id:
            raise HTTPException(400, "Both parents cannot be the same member")
        dob = body.newborn.date_of_birth or body.event_date
        newborn_in = body.newborn.model_copy(update={
            "date_of_birth": dob, "aadhaar_reference": None, "identity_source": "BIRTH_CERTIFICATE",
            "relationship_type": None, "related_member_id": None,
        })
        created_member = _new_member(db, fam, newborn_in, user)
        created_member.member_status = "PROVISIONAL"
        created_member.identity_source = "BIRTH_CERTIFICATE"
        created_member.aadhaar_reference = None
        created_member.aadhaar_last4 = None
        created_member.joined_date = dob or date.today()
        parents = [p for p in (member, related) if p is not None]
        for parent in parents:
            _link_parent(db, parent, created_member, user, body.document_id, dob)
        father = next((p for p in parents if p.gender != "FEMALE"), None)
        if father and not created_member.father_or_husband_name:
            created_member.father_or_husband_name = father.name
        names = " and ".join(p.name for p in parents)
        reason = f"Birth of {created_member.name} reported to {names}"
        if fam.declared_member_count:
            fam.declared_member_count += 1

    elif event_type == "MARRIAGE":
        new_spouse = details.pop("new_spouse", None)
        if related is None and new_spouse:
            try:
                spouse_in = MemberIn(**new_spouse)
            except Exception as exc:
                raise HTTPException(400, f"details.new_spouse is not a valid member: {exc}")
            spouse_in = spouse_in.model_copy(update={"marital_status": spouse_in.marital_status or "MARRIED",
                                                     "relationship_type": None, "related_member_id": None})
            created_member = _new_member(db, fam, spouse_in, user)
            related = created_member
            details["new_spouse_member_id"] = str(created_member.member_id)
            if fam.declared_member_count:
                fam.declared_member_count += 1
        if related is None:
            raise HTTPException(400, "Provide related_member_id for the spouse or details.new_spouse to add a new spouse")
        reason = f"Marriage of {member.name} and {related.name} reported"

    elif event_type == "DEATH":
        reason = f"Death of {member.name} reported"
    elif event_type in ("DIVORCE", "SEPARATION"):
        reason = f"{event_type.title()} of {member.name}" + (f" and {related.name}" if related else "") + " reported"
    elif event_type in ("ADOPTION", "GUARDIANSHIP"):
        reason = f"{event_type.title()} of {member.name}" + (f" by {related.name}" if related else "") + " reported"
    elif event_type in ("ADDRESS_CHANGE", "MIGRATION"):
        reason = f"{event_type.replace('_', ' ').title()} to {details.get('village') or details.get('district') or details.get('address_line')} reported"
    elif event_type == "SPLIT":
        reason = f"{member.name} requested to split into a separate family"

    event = LifeEvent(
        family_id=fam.family_id, member_id=member.member_id if member else (created_member.member_id if created_member else None),
        related_member_id=related.member_id if related else None, event_type=event_type, event_date=body.event_date,
        document_id=body.document_id, details=details, verification_status="PENDING", applied=False,
        reported_by_user_id=user.user_id,
    )
    if event_type == "BIRTH":
        event.member_id = created_member.member_id
        event.related_member_id = None
        event.details = {**details, "father_member_id": str(next((p.member_id for p in parents if p.gender != "FEMALE"), "")) or None,
                         "mother_member_id": str(next((p.member_id for p in parents if p.gender == "FEMALE"), "")) or None,
                         "parent_member_ids": [str(p.member_id) for p in parents]}
    db.add(event); db.flush()

    case = open_case(db, "LIFE_EVENT", reason, family_id=fam.family_id, member_id=event.member_id,
                     related_member_id=event.related_member_id, evidence={"event_type": event_type, "details": event.details,
                                                                          "document_id": str(body.document_id) if body.document_id else None},
                     priority="HIGH" if event_type in ("DEATH", "SPLIT") else "NORMAL", life_event_id=event.event_id)
    audit(db, user, "LIFE_EVENT_REPORTED", "LIFE_EVENT", event.event_id, fam.family_id,
          new_value={"event_type": event_type, "reason": reason, "case_number": case.case_number})
    notify(db, "VERIFICATION_PENDING",
           f"{reason}. An officer will verify it before the change takes effect on your family profile.",
           family_id=fam.family_id, link="/family")
    if created_member is not None:
        recalculate_family(db, fam, user)
    db.commit()
    db.refresh(event)
    return {"event": serialize(event), "case": serialize(case),
            "member": _member_payload(created_member) if created_member else None}


@router.get("")
def list_life_events(family_id: Optional[UUID] = None, event_type: Optional[str] = None, status: Optional[str] = None,
                     db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "CITIZEN":
        mine = my_family(db, user)
        if mine is None:
            return []
        if family_id is not None and family_id != mine.family_id:
            raise HTTPException(403, "You can only view life events of your own family")
        family_id = mine.family_id
    query = db.query(LifeEvent)
    if family_id is not None:
        query = query.filter(LifeEvent.family_id == family_id)
    if event_type:
        query = query.filter(LifeEvent.event_type == event_type.upper())
    if status:
        query = query.filter(LifeEvent.verification_status == status.upper())
    rows = query.order_by(LifeEvent.created_at.desc()).limit(200).all()
    member_ids = {r.member_id for r in rows if r.member_id} | {r.related_member_id for r in rows if r.related_member_id}
    names = {m.member_id: m.name for m in db.query(FamilyMember).filter(FamilyMember.member_id.in_(member_ids)).all()} if member_ids else {}
    out = []
    for e in rows:
        d = serialize(e)
        d["member_name"] = names.get(e.member_id)
        d["related_member_name"] = names.get(e.related_member_id)
        out.append(d)
    return out
