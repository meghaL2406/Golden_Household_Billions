from datetime import date, datetime, time, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_officer, OFFICER_ROLES
from app.models import (Family, FamilyMember, Document, ExternalRecord, LifeEvent, VerificationCase, User)
from app.schemas.inputs import CaseAction
from app.services.common import audit, notify, utcnow, generate_family_code
from app.services.eligibility import recalculate_family
from app.services.life_events import apply_life_event, merge_families
from .deps import serialize
from .families import family_detail, _member_payload

router = APIRouter(prefix="/verification", tags=["verification"])

OPEN_STATUSES = ("OPEN", "ASSIGNED", "INFO_REQUESTED")
DUPLICATE_TYPES = ("DUPLICATE_PERSON", "DUPLICATE_FAMILY")
COMPARISON_FIELDS = (
    ("name", "name"), ("date_of_birth", "date_of_birth"), ("gender", "gender"), ("father_or_husband_name", "father_name"),
)


def _load_case(db: Session, case_id) -> VerificationCase:
    case = db.get(VerificationCase, case_id)
    if case is None:
        raise HTTPException(404, "Verification case not found")
    return case


def _case_row(db: Session, case: VerificationCase, families: dict, members: dict, officers: dict) -> dict:
    d = serialize(case)
    fam = families.get(case.family_id)
    head = None
    if fam is not None:
        head = next((m for m in fam.members if m.is_head), None)
    d["family_code"] = fam.family_code if fam else None
    d["head_name"] = head.name if head else None
    d["district"] = fam.district if fam else None
    member = members.get(case.member_id)
    d["member_name"] = member.name if member else None
    officer = officers.get(case.assigned_officer_id)
    d["assigned_officer_name"] = officer.name if officer else None
    return d


@router.get("/cases")
def list_cases(status: Optional[str] = None, case_type: Optional[str] = None, district: Optional[str] = None,
               priority: Optional[str] = None, assigned: Optional[str] = None, page: int = 1, size: int = 25,
               db: Session = Depends(get_db), user: User = Depends(require_officer)):
    query = db.query(VerificationCase)
    if status:
        statuses = [s.strip().upper() for s in status.split(",") if s.strip()]
        query = query.filter(VerificationCase.case_status.in_(statuses))
    if case_type:
        query = query.filter(VerificationCase.case_type == case_type.upper())
    if priority:
        query = query.filter(VerificationCase.priority == priority.upper())
    if district:
        fam_ids = [r[0] for r in db.query(Family.family_id).filter(Family.district == district).all()]
        query = query.filter(VerificationCase.family_id.in_(fam_ids)) if fam_ids else query.filter(False)
    if assigned == "me":
        query = query.filter(VerificationCase.assigned_officer_id == user.user_id)
    elif assigned == "none":
        query = query.filter(VerificationCase.assigned_officer_id.is_(None))
    total = query.count()
    rows = query.order_by(VerificationCase.created_at.desc()).offset((page - 1) * size).limit(max(size, 1)).all()
    fam_ids = {c.family_id for c in rows if c.family_id}
    member_ids = {c.member_id for c in rows if c.member_id}
    officer_ids = {c.assigned_officer_id for c in rows if c.assigned_officer_id}
    families = {f.family_id: f for f in db.query(Family).filter(Family.family_id.in_(fam_ids)).all()} if fam_ids else {}
    members = {m.member_id: m for m in db.query(FamilyMember).filter(FamilyMember.member_id.in_(member_ids)).all()} if member_ids else {}
    officers = {u.user_id: u for u in db.query(User).filter(User.user_id.in_(officer_ids)).all()} if officer_ids else {}
    return {"total": total, "items": [_case_row(db, c, families, members, officers) for c in rows], "page": page, "size": size}


@router.get("/officers")
def list_officers(db: Session = Depends(get_db), user: User = Depends(require_officer)):
    rows = db.query(User).filter(User.role.in_(OFFICER_ROLES), User.status == "ACTIVE").order_by(User.name).all()
    return [{"user_id": str(u.user_id), "name": u.name, "role": u.role, "district": u.district} for u in rows]


@router.get("/summary")
def summary(db: Session = Depends(get_db), user: User = Depends(require_officer)):
    counts = dict(db.query(VerificationCase.case_status, func.count()).group_by(VerificationCase.case_status).all())
    start_of_day = datetime.combine(date.today(), time.min, tzinfo=timezone.utc)
    approved_today = db.query(VerificationCase).filter(VerificationCase.case_status == "APPROVED",
                                                       VerificationCase.resolved_at >= start_of_day).count()
    by_type = dict(db.query(VerificationCase.case_type, func.count()).filter(VerificationCase.case_status.in_(OPEN_STATUSES))
                   .group_by(VerificationCase.case_type).all())
    return {
        "open": int(counts.get("OPEN", 0)), "assigned": int(counts.get("ASSIGNED", 0)),
        "info_requested": int(counts.get("INFO_REQUESTED", 0)), "approved_today": approved_today,
        "assigned_to_me": db.query(VerificationCase).filter(VerificationCase.assigned_officer_id == user.user_id,
                                                            VerificationCase.case_status.in_(OPEN_STATUSES)).count(),
        "by_type": {k: int(v) for k, v in by_type.items()},
    }


def _comparison(db: Session, member: FamilyMember | None) -> dict:
    if member is None:
        return {"fields": [], "source": None}
    rec = (db.query(ExternalRecord).filter(ExternalRecord.member_id == member.member_id)
           .order_by(ExternalRecord.last_verified_at.desc().nullslast(), ExternalRecord.created_at.desc()).first())
    data = (rec.fetched_data or {}) if rec else {}
    fields = []
    for field, source_key in COMPARISON_FIELDS:
        entered = getattr(member, field)
        entered_str = entered.isoformat() if isinstance(entered, date) else entered
        source = data.get(source_key) if rec else None
        if source is None:
            match = None
        else:
            match = str(entered_str or "").strip().lower() == str(source).strip().lower()
        fields.append({"field": field, "entered": entered_str, "source": source, "match": match})
    return {"fields": fields, "source": rec.source_system if rec else None,
            "external_reference_id": rec.external_reference_id if rec else None,
            "match_status": rec.match_status if rec else None}


@router.get("/cases/{case_id}")
def case_detail(case_id: UUID, db: Session = Depends(get_db), user: User = Depends(require_officer)):
    case = _load_case(db, case_id)
    fam = db.get(Family, case.family_id) if case.family_id else None
    related_fam = db.get(Family, case.related_family_id) if case.related_family_id else None
    member = db.get(FamilyMember, case.member_id) if case.member_id else None
    related_member = db.get(FamilyMember, case.related_member_id) if case.related_member_id else None
    documents, external = [], []
    if fam is not None:
        member_ids = [m.member_id for m in fam.members]
        cond = Document.family_id == fam.family_id
        if member_ids:
            cond = cond | Document.member_id.in_(member_ids)
        documents = db.query(Document).filter(cond).order_by(Document.created_at.desc()).all()
        external = db.query(ExternalRecord).filter(ExternalRecord.family_id == fam.family_id).all()
    if member is not None:
        documents = [d for d in documents if d.member_id == member.member_id or d.family_id == fam.family_id] if fam else \
            db.query(Document).filter(Document.member_id == member.member_id).all()
    life_event = db.get(LifeEvent, case.life_event_id) if case.life_event_id else None
    officer = db.get(User, case.assigned_officer_id) if case.assigned_officer_id else None
    out = serialize(case)
    out["assigned_officer_name"] = officer.name if officer else None
    out["family_code"] = fam.family_code if fam else None
    audit(db, user, "CASE_VIEWED", "VERIFICATION_CASE", case.case_id, case.family_id)
    db.commit()
    return {
        "case": out,
        "family": family_detail(db, fam) if fam else None,
        "related_family": family_detail(db, related_fam) if related_fam else None,
        "member": _member_payload(member) if member else None,
        "related_member": _member_payload(related_member) if related_member else None,
        "documents": serialize(documents),
        "external_records": serialize(external),
        "life_event": serialize(life_event) if life_event else None,
        "comparison": _comparison(db, member),
    }


def _has_other_open_duplicate_case(db: Session, member: FamilyMember, exclude_case_id) -> bool:
    return db.query(VerificationCase).filter(
        VerificationCase.member_id == member.member_id, VerificationCase.case_type.in_(DUPLICATE_TYPES),
        VerificationCase.case_status.in_(OPEN_STATUSES), VerificationCase.case_id != exclude_case_id,
    ).first() is not None


def _resolve(case: VerificationCase, status: str, user: User, resolution: str | None):
    case.case_status = status
    case.resolution = resolution
    case.resolved_by_user_id = user.user_id
    case.resolved_at = utcnow()


@router.post("/cases/{case_id}/action")
def act_on_case(case_id: UUID, body: CaseAction, db: Session = Depends(get_db), user: User = Depends(require_officer)):
    case = _load_case(db, case_id)
    fam = db.get(Family, case.family_id) if case.family_id else None
    member = db.get(FamilyMember, case.member_id) if case.member_id else None
    action = body.action
    if action != "ASSIGN" and case.case_status not in OPEN_STATUSES:
        raise HTTPException(400, f"This case is already {case.case_status.lower().replace('_', ' ')} and cannot be changed")
    old = {"case_status": case.case_status, "assigned_officer_id": case.assigned_officer_id}

    if action == "ASSIGN":
        target = body.assign_to_user_id or user.user_id
        officer = db.get(User, target)
        if officer is None or officer.role not in OFFICER_ROLES or officer.status != "ACTIVE":
            raise HTTPException(400, "The selected user is not an active officer")
        if case.case_status not in OPEN_STATUSES:
            raise HTTPException(400, "A closed case cannot be assigned")
        case.assigned_officer_id = officer.user_id
        case.case_status = "ASSIGNED"
        audit(db, user, "CASE_ASSIGNED", "VERIFICATION_CASE", case.case_id, case.family_id, old_value=old,
              new_value={"assigned_to": officer.name})
        notify(db, "CASE_ASSIGNED", f"Case {case.case_number} ({case.case_type.replace('_', ' ').title()}) has been assigned to you.",
               user_id=officer.user_id, link=f"/verification/{case.case_id}")

    elif action == "APPROVE":
        if case.case_type == "FAMILY_VERIFICATION":
            if fam is None:
                raise HTTPException(400, "This case is not linked to a family")
            if not fam.family_code:
                fam.family_code = generate_family_code(db, fam.district)
            fam.family_status = "VERIFIED"
            fam.verification_status = "VERIFIED"
            fam.verified_at = utcnow()
            for m in fam.members:
                if m.member_status in ("ACTIVE", "PROVISIONAL") and not _has_other_open_duplicate_case(db, m, case.case_id):
                    m.verification_status = "VERIFIED"
            _resolve(case, "APPROVED", user, body.resolution or "Family profile verified and Family ID issued")
            audit(db, user, "VERIFICATION_APPROVED", "FAMILY", fam.family_id, fam.family_id, old_value=old,
                  new_value={"family_code": fam.family_code, "case_number": case.case_number})
            notify(db, "FAMILY_ID_CREATED", f"Congratulations. Your family has been verified and your Family ID is {fam.family_code}.",
                   title="Family ID issued", family_id=fam.family_id, link="/family")
            recalculate_family(db, fam, user)
        elif case.case_type == "LIFE_EVENT":
            event = db.get(LifeEvent, case.life_event_id) if case.life_event_id else None
            if event is None:
                raise HTTPException(400, "This case is not linked to a life event")
            if event.applied:
                raise HTTPException(400, "This life event has already been applied")
            result = apply_life_event(db, event, user)
            _resolve(case, "APPROVED", user, body.resolution or "; ".join(result.get("changes") or []) or "Life event verified")
            audit(db, user, "VERIFICATION_APPROVED", "LIFE_EVENT", event.event_id, case.family_id, old_value=old, new_value=result)
        else:
            if member is not None:
                member.verification_status = "VERIFIED"
            if case.case_type == "DUPLICATE_FAMILY" and fam is not None and fam.verification_status == "FLAGGED":
                fam.verification_status = "PENDING" if fam.family_status == "PENDING_VERIFICATION" else fam.verification_status
            _resolve(case, "APPROVED", user, body.resolution or "Reviewed by officer and found to be distinct and valid")
            audit(db, user, "VERIFICATION_APPROVED", "VERIFICATION_CASE", case.case_id, case.family_id, old_value=old,
                  new_value={"case_type": case.case_type, "member": member.name if member else None})
            if fam is not None:
                notify(db, "VERIFICATION_COMPLETED", f"The review of case {case.case_number} was completed in your favour.",
                       family_id=fam.family_id, link="/family")
                recalculate_family(db, fam, user)

    elif action == "REJECT":
        if not body.resolution:
            raise HTTPException(400, "A reason is required when rejecting a case")
        if case.case_type == "FAMILY_VERIFICATION" and fam is not None:
            fam.family_status = "REJECTED"
            fam.verification_status = "REJECTED"
            notify(db, "VERIFICATION_REJECTED", f"Your family verification was not approved. Reason: {body.resolution}. Correct the details and submit again.",
                   family_id=fam.family_id, link="/family")
        elif case.case_type == "DUPLICATE_PERSON" and member is not None:
            member.member_status = "LEFT"
            member.left_date = date.today()
            member.verification_status = "FLAGGED"
            note = f"Removed after duplicate review ({case.case_number}): {body.resolution}"
            if fam is not None:
                fam.notes = f"{fam.notes}\n{note}".strip() if fam.notes else note
                notify(db, "VERIFICATION_REJECTED", f"{member.name} was found to already exist in another family and has been removed from your family.",
                       family_id=fam.family_id, link="/family")
        elif case.case_type == "LIFE_EVENT":
            event = db.get(LifeEvent, case.life_event_id) if case.life_event_id else None
            if event is not None:
                event.verification_status = "REJECTED"
            if fam is not None:
                notify(db, "VERIFICATION_REJECTED", f"Your reported life event was not approved. Reason: {body.resolution}",
                       family_id=fam.family_id, link="/family")
        elif fam is not None:
            notify(db, "VERIFICATION_REJECTED", f"Case {case.case_number} was closed against your family. Reason: {body.resolution}",
                   family_id=fam.family_id, link="/family")
        _resolve(case, "REJECTED", user, body.resolution)
        audit(db, user, "VERIFICATION_REJECTED", "VERIFICATION_CASE", case.case_id, case.family_id, old_value=old,
              new_value={"case_type": case.case_type, "resolution": body.resolution})
        if fam is not None:
            recalculate_family(db, fam, user)

    elif action == "REQUEST_INFO":
        case.case_status = "INFO_REQUESTED"
        case.resolution = body.resolution
        if case.assigned_officer_id is None:
            case.assigned_officer_id = user.user_id
        audit(db, user, "INFO_REQUESTED", "VERIFICATION_CASE", case.case_id, case.family_id, old_value=old,
              new_value={"message": body.resolution})
        if fam is not None:
            msg = body.resolution or "An officer needs additional documents to complete verification."
            notify(db, "DOCUMENT_REQUIRED", f"Additional information is required for case {case.case_number}: {msg}",
                   family_id=fam.family_id, link="/documents")

    elif action == "MERGE":
        if fam is None:
            raise HTTPException(400, "This case is not linked to a family")
        target_id = body.merge_into_family_id or case.related_family_id
        if target_id is None:
            raise HTTPException(400, "merge_into_family_id is required to merge families")
        target = db.get(Family, target_id)
        if target is None:
            raise HTTPException(404, "Target family not found")
        if target.family_id == fam.family_id:
            raise HTTPException(400, "A family cannot be merged into itself")
        if target.family_status in ("MERGED", "INACTIVE"):
            raise HTTPException(400, "The target family is closed")
        result = merge_families(db, fam, target, user)
        _resolve(case, "CLOSED", user, body.resolution or f"Merged into family {target.family_code or target.family_id}")
        for other in db.query(VerificationCase).filter(VerificationCase.family_id == fam.family_id,
                                                       VerificationCase.case_status.in_(OPEN_STATUSES),
                                                       VerificationCase.case_id != case.case_id).all():
            _resolve(other, "CLOSED", user, f"Closed because the family was merged into {target.family_code or target.family_id}")
        audit(db, user, "CASE_MERGED", "VERIFICATION_CASE", case.case_id, fam.family_id, old_value=old, new_value=result)

    elif action == "CLOSE":
        _resolve(case, "CLOSED", user, body.resolution or "Closed by officer")
        audit(db, user, "CASE_CLOSED", "VERIFICATION_CASE", case.case_id, case.family_id, old_value=old,
              new_value={"resolution": case.resolution})

    db.commit()
    db.refresh(case)
    out = serialize(case)
    if fam is not None:
        out["family_code"] = fam.family_code
    return out
