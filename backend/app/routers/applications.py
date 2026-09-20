"""Benefit applications router (/applications)."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_officer
from app.models import (Family, FamilyMember, Address, Document, Scheme, SchemeEligibility, BenefitApplication,
                        BenefitRecord, User)
from app.schemas.inputs import ApplicationIn, ApplicationAction
from app.services.common import audit, notify, utcnow, generate_number
from app.services.eligibility import recalculate_family
from .deps import serialize, my_family, load_family, is_officer
from .families import family_detail

router = APIRouter(prefix="/applications", tags=["applications"])

OPEN_STATUSES = ("SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED")
TRANSITIONS = {
    "UNDER_REVIEW": {"from": ("SUBMITTED", "INFO_REQUESTED"), "to": "UNDER_REVIEW"},
    "REQUEST_INFO": {"from": ("SUBMITTED", "UNDER_REVIEW"), "to": "INFO_REQUESTED"},
    "APPROVE": {"from": OPEN_STATUSES, "to": "APPROVED"},
    "REJECT": {"from": OPEN_STATUSES, "to": "REJECTED"},
    "WITHDRAW": {"from": OPEN_STATUSES, "to": "WITHDRAWN"},
}


def _history_entry(status: str, user: User, note: Optional[str]) -> dict:
    return {"status": status, "at": utcnow().isoformat(), "by": user.name, "by_user_id": str(user.user_id), "note": note}


def _prefill(db: Session, fam: Family, member: Optional[FamilyMember]) -> dict:
    addr = db.query(Address).filter(Address.family_id == fam.family_id, Address.is_current.is_(True)).order_by(Address.valid_from.desc()).first()
    head = next((m for m in fam.members if m.is_head), None)
    person = member or head
    return {
        "family_code": fam.family_code, "family_status": fam.family_status,
        "name": person.name if person else None, "date_of_birth": person.date_of_birth.isoformat() if person and person.date_of_birth else None,
        "gender": person.gender if person else None, "head_name": head.name if head else None,
        "address": addr.address_line if addr else None, "village": fam.village, "taluka": fam.taluka, "district": fam.district,
        "pincode": fam.pincode, "income": float(fam.annual_income) if fam.annual_income is not None else None,
        "income_category": fam.income_category, "aadhaar_linked": bool(person.aadhaar_reference) if person else False,
        "member_verified": (person.verification_status == "VERIFIED") if person else False,
        "snapshot_at": utcnow().isoformat(),
    }


def _app_extras(db: Session, a: BenefitApplication, scheme: Scheme | None, fam: Family | None, member: FamilyMember | None) -> dict:
    d = serialize(a)
    d["scheme_name"] = scheme.scheme_name if scheme else None
    d["scheme_code"] = scheme.scheme_code if scheme else None
    d["department"] = scheme.department if scheme else None
    d["benefit_type"] = scheme.benefit_type if scheme else None
    d["member_name"] = member.name if member else None
    d["family_code"] = fam.family_code if fam else None
    d["district"] = fam.district if fam else None
    head = next((m for m in fam.members if m.is_head), None) if fam else None
    d["head_name"] = head.name if head else None
    return d


def _load_app(db: Session, user: User, application_id: UUID) -> BenefitApplication:
    a = db.get(BenefitApplication, application_id)
    if a is None:
        raise HTTPException(404, "Application not found")
    load_family(db, user, a.family_id)  # enforces citizen ownership
    return a


# ------------------------------------------------------------------ create
@router.post("", status_code=201)
def create_application(body: ApplicationIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    scheme = db.get(Scheme, body.scheme_id)
    if scheme is None:
        raise HTTPException(404, "Scheme not found")
    if scheme.status != "ACTIVE":
        raise HTTPException(400, "This scheme is not currently accepting applications")
    if user.role == "CITIZEN":
        fam = my_family(db, user)
        if fam is None:
            raise HTTPException(400, "Create your family profile before applying for a scheme")
    else:
        fid = body.extra.get("family_id")
        if not fid:
            raise HTTPException(400, "Officers must provide extra.family_id to apply on behalf of a family")
        fam = load_family(db, user, UUID(str(fid)))
    member = None
    if scheme.target_type == "MEMBER":
        if body.member_id is None:
            member = next((m for m in fam.members if m.is_head), None)
        else:
            member = db.get(FamilyMember, body.member_id)
        if member is None or member.family_id != fam.family_id:
            raise HTTPException(404, "Member not found in this family")
        if member.member_status not in ("ACTIVE", "PROVISIONAL"):
            raise HTTPException(400, "Applications can only be made for active members")
    member_id = member.member_id if member else None

    elig = db.query(SchemeEligibility).filter(SchemeEligibility.scheme_id == scheme.scheme_id,
                                              SchemeEligibility.family_id == fam.family_id,
                                              SchemeEligibility.member_id == member_id).first()
    if elig is None:
        recalculate_family(db, fam, user)
        elig = db.query(SchemeEligibility).filter(SchemeEligibility.scheme_id == scheme.scheme_id,
                                                  SchemeEligibility.family_id == fam.family_id,
                                                  SchemeEligibility.member_id == member_id).first()
    if elig is None:
        raise HTTPException(400, "Eligibility for this scheme has not been assessed for this family yet")
    reqs = elig.missing_requirement or []
    if elig.eligibility_status == "ELIGIBLE":
        pass
    elif elig.eligibility_status == "NEEDS_DOCUMENT":
        missing = [r for r in reqs if not str(r).startswith("VERIFY:")]
        attached = db.query(Document).filter(Document.document_id.in_(body.attached_document_ids)).all() if body.attached_document_ids else []
        attached = [d for d in attached if d.family_id == fam.family_id or (member and d.member_id == member.member_id) or d.member_id in {m.member_id for m in fam.members}]
        types = {d.document_type for d in attached if d.verification_status != "REJECTED"}
        still = [m for m in missing if m not in types]
        if still:
            raise HTTPException(400, f"{elig.eligibility_reason} Attach the following document types to apply: {', '.join(s.replace('_', ' ').title() for s in still)}.")
    elif elig.eligibility_status == "UNDER_REVIEW" and reqs and all(str(r).startswith("VERIFY:") for r in reqs):
        pass  # awaiting document verification only; application may proceed and wait for officer review
    else:
        raise HTTPException(400, elig.eligibility_reason or "The family is not eligible for this scheme")

    dup = db.query(BenefitApplication).filter(BenefitApplication.scheme_id == scheme.scheme_id, BenefitApplication.family_id == fam.family_id,
                                              BenefitApplication.member_id == member_id,
                                              BenefitApplication.application_status.notin_(["REJECTED", "WITHDRAWN"])).first()
    if dup:
        raise HTTPException(409, f"An application ({dup.application_number}) for this scheme already exists with status {dup.application_status.lower().replace('_', ' ')}")

    extra = {k: v for k, v in (body.extra or {}).items() if k != "family_id"}
    a = BenefitApplication(
        application_number=generate_number(db, "APP"), family_id=fam.family_id, member_id=member_id, scheme_id=scheme.scheme_id,
        application_status="SUBMITTED", prefilled_data={**_prefill(db, fam, member), "extra": extra, "eligibility_status": elig.eligibility_status},
        attached_document_ids=[str(d) for d in body.attached_document_ids], submitted_at=utcnow(),
        status_history=[_history_entry("SUBMITTED", user, "Application submitted")],
    )
    db.add(a); db.flush()
    audit(db, user, "APPLICATION_SUBMITTED", "APPLICATION", a.application_id, fam.family_id,
          new_value={"application_number": a.application_number, "scheme": scheme.scheme_name, "member": member.name if member else None})
    notify(db, "APPLICATION_SUBMITTED", f"Your application {a.application_number} for {scheme.scheme_name} has been submitted.",
           family_id=fam.family_id, member_id=member_id, link="/applications")
    db.commit()
    return _app_extras(db, a, scheme, fam, member)


# ------------------------------------------------------------------ lists
@router.get("/mine")
def my_applications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = my_family(db, user)
    if fam is None:
        return []
    apps = db.query(BenefitApplication).filter(BenefitApplication.family_id == fam.family_id).order_by(BenefitApplication.created_at.desc()).all()
    schemes = {s.scheme_id: s for s in db.query(Scheme).filter(Scheme.scheme_id.in_([a.scheme_id for a in apps])).all()} if apps else {}
    members = {m.member_id: m for m in fam.members}
    benefits = {b.application_id: b for b in db.query(BenefitRecord).filter(BenefitRecord.family_id == fam.family_id).all()}
    out = []
    for a in apps:
        d = _app_extras(db, a, schemes.get(a.scheme_id), fam, members.get(a.member_id))
        b = benefits.get(a.application_id)
        d["benefit"] = serialize(b) if b else None
        out.append(d)
    return out


@router.get("")
def list_applications(status: Optional[str] = None, scheme_id: Optional[UUID] = None, district: Optional[str] = None,
                      department: Optional[str] = None, page: int = 1, size: int = 25,
                      db: Session = Depends(get_db), user: User = Depends(require_officer)):
    q = (db.query(BenefitApplication, Scheme, Family)
         .join(Scheme, Scheme.scheme_id == BenefitApplication.scheme_id)
         .join(Family, Family.family_id == BenefitApplication.family_id))
    if status:
        q = q.filter(BenefitApplication.application_status == status)
    if scheme_id:
        q = q.filter(BenefitApplication.scheme_id == scheme_id)
    if district:
        q = q.filter(Family.district == district)
    if department:
        q = q.filter(Scheme.department == department)
    total = q.count()
    rows = q.order_by(BenefitApplication.created_at.desc()).offset((page - 1) * size).limit(size).all()
    member_ids = [a.member_id for a, _, _ in rows if a.member_id]
    members = {m.member_id: m for m in db.query(FamilyMember).filter(FamilyMember.member_id.in_(member_ids)).all()} if member_ids else {}
    items = [_app_extras(db, a, s, f, members.get(a.member_id)) for a, s, f in rows]
    return {"total": total, "items": items, "page": page, "size": size}


@router.get("/{application_id}")
def get_application(application_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = _load_app(db, user, application_id)
    fam = db.get(Family, a.family_id)
    scheme = db.get(Scheme, a.scheme_id)
    member = db.get(FamilyMember, a.member_id) if a.member_id else None
    doc_ids = [UUID(str(d)) for d in (a.attached_document_ids or [])]
    docs = db.query(Document).filter(Document.document_id.in_(doc_ids)).all() if doc_ids else []
    elig = db.query(SchemeEligibility).filter(SchemeEligibility.scheme_id == a.scheme_id, SchemeEligibility.family_id == a.family_id,
                                              SchemeEligibility.member_id == a.member_id).first()
    benefit = db.query(BenefitRecord).filter(BenefitRecord.application_id == a.application_id).first()
    return {
        "application": _app_extras(db, a, scheme, fam, member), "scheme": serialize(scheme), "family": family_detail(db, fam),
        "documents": serialize(docs), "eligibility": serialize(elig), "benefit": serialize(benefit),
    }


# ------------------------------------------------------------------ actions
@router.post("/{application_id}/action")
def act_on_application(application_id: UUID, body: ApplicationAction, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = _load_app(db, user, application_id)
    fam = db.get(Family, a.family_id)
    scheme = db.get(Scheme, a.scheme_id)
    member = db.get(FamilyMember, a.member_id) if a.member_id else None
    action = body.action
    if action == "WITHDRAW":
        if user.role != "CITIZEN":
            raise HTTPException(403, "Only the citizen can withdraw an application")
    elif not is_officer(user):
        raise HTTPException(403, "Only officers can review applications")
    rule = TRANSITIONS[action]
    if a.application_status not in rule["from"]:
        raise HTTPException(400, f"Cannot {action.lower().replace('_', ' ')} an application that is {a.application_status.lower().replace('_', ' ')}")
    old_status = a.application_status
    new_status = rule["to"]
    a.application_status = new_status
    a.status_history = list(a.status_history or []) + [_history_entry(new_status, user, body.remarks)]
    if body.remarks:
        a.officer_remarks = body.remarks if is_officer(user) else a.officer_remarks
    benefit = None
    if action in ("UNDER_REVIEW", "REQUEST_INFO", "APPROVE", "REJECT"):
        a.reviewed_by_user_id = user.user_id
    if action == "REQUEST_INFO":
        notify(db, "DOCUMENT_REQUIRED", f"More information is needed for application {a.application_number}: {body.remarks or 'please contact the department.'}",
               family_id=fam.family_id, member_id=a.member_id, link="/applications")
    elif action == "REJECT":
        a.rejected_at = utcnow()
        a.rejection_reason = body.remarks or "Rejected by the reviewing officer"
        notify(db, "APPLICATION_REJECTED", f"Application {a.application_number} for {scheme.scheme_name} was rejected. Reason: {a.rejection_reason}",
               family_id=fam.family_id, member_id=a.member_id, link="/applications")
    elif action == "APPROVE":
        a.approved_at = utcnow()
        amount = body.benefit_amount if body.benefit_amount is not None else scheme.benefit_amount
        now = utcnow()
        benefit = BenefitRecord(
            family_id=fam.family_id, member_id=a.member_id, scheme_id=scheme.scheme_id, application_id=a.application_id,
            benefit_status="ACTIVE", delivery_status="SANCTIONED", benefit_amount=amount, last_delivery_at=now,
            delivery_log=[{"status": "SANCTIONED", "at": now.isoformat(), "by": user.name, "note": body.remarks or "Benefit sanctioned on approval", "reference": None}],
        )
        db.add(benefit); db.flush()
        audit(db, user, "BENEFIT_APPROVED", "BENEFIT", benefit.benefit_id, fam.family_id,
              new_value={"application_number": a.application_number, "scheme": scheme.scheme_name, "amount": float(amount) if amount is not None else None})
        notify(db, "APPLICATION_APPROVED", f"Application {a.application_number} for {scheme.scheme_name} has been approved.",
               family_id=fam.family_id, member_id=a.member_id, link="/benefits")
        notify(db, "BENEFIT_STATUS", f"Your {scheme.scheme_name} benefit has been sanctioned.", title="Benefit sanctioned",
               family_id=fam.family_id, member_id=a.member_id, link="/benefits")
    elif action == "WITHDRAW":
        notify(db, "APPLICATION_WITHDRAWN", f"Application {a.application_number} was withdrawn.", family_id=fam.family_id, member_id=a.member_id, link="/applications")
    audit(db, user, "APPLICATION_REVIEWED", "APPLICATION", a.application_id, fam.family_id,
          old_value={"status": old_status}, new_value={"status": new_status, "action": action, "remarks": body.remarks})
    db.commit()
    if action == "APPROVE":
        db.refresh(fam)
        recalculate_family(db, fam, user)
        db.commit()
    out = _app_extras(db, a, scheme, fam, member)
    out["benefit"] = serialize(benefit) if benefit else None
    return out
