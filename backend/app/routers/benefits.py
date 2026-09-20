"""Benefit records and delivery tracking router (/benefits)."""
from datetime import timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_officer
from app.models import Family, FamilyMember, Scheme, BenefitRecord, Grievance, User
from app.schemas.inputs import DeliveryUpdate
from app.services.common import audit, notify, utcnow, generate_number
from .deps import serialize, my_family, load_family, is_officer

router = APIRouter(prefix="/benefits", tags=["benefits"])

OFFICER_STATUSES = ("SANCTIONED", "DISBURSED", "DELIVERED")
CITIZEN_STATUSES = ("RECEIVED_CONFIRMED", "NOT_RECEIVED")
STATUS_WORDS = {"SANCTIONED": "sanctioned", "DISBURSED": "disbursed", "DELIVERED": "delivered",
                "RECEIVED_CONFIRMED": "confirmed as received", "NOT_RECEIVED": "reported as not received", "DISPUTED": "under dispute"}


def benefit_payload(b: BenefitRecord, scheme: Scheme | None, fam: Family | None, member: FamilyMember | None) -> dict:
    d = serialize(b)
    d["scheme_name"] = scheme.scheme_name if scheme else None
    d["scheme_code"] = scheme.scheme_code if scheme else None
    d["department"] = scheme.department if scheme else None
    d["benefit_type"] = scheme.benefit_type if scheme else None
    d["benefit_frequency"] = scheme.benefit_frequency if scheme else None
    d["member_name"] = member.name if member else None
    d["family_code"] = fam.family_code if fam else None
    d["district"] = fam.district if fam else None
    head = next((m for m in fam.members if m.is_head), None) if fam else None
    d["head_name"] = head.name if head else None
    return d


@router.get("/mine")
def my_benefits(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = my_family(db, user)
    if fam is None:
        return []
    rows = db.query(BenefitRecord).filter(BenefitRecord.family_id == fam.family_id).order_by(BenefitRecord.created_at.desc()).all()
    schemes = {s.scheme_id: s for s in db.query(Scheme).filter(Scheme.scheme_id.in_([b.scheme_id for b in rows])).all()} if rows else {}
    members = {m.member_id: m for m in fam.members}
    return [benefit_payload(b, schemes.get(b.scheme_id), fam, members.get(b.member_id)) for b in rows]


@router.get("")
def list_benefits(status: Optional[str] = None, delivery_status: Optional[str] = None, scheme_id: Optional[UUID] = None,
                  district: Optional[str] = None, page: int = 1, size: int = 25,
                  db: Session = Depends(get_db), user: User = Depends(require_officer)):
    q = (db.query(BenefitRecord, Scheme, Family)
         .join(Scheme, Scheme.scheme_id == BenefitRecord.scheme_id)
         .join(Family, Family.family_id == BenefitRecord.family_id))
    if status:
        q = q.filter(BenefitRecord.benefit_status == status)
    if delivery_status:
        q = q.filter(BenefitRecord.delivery_status == delivery_status)
    if scheme_id:
        q = q.filter(BenefitRecord.scheme_id == scheme_id)
    if district:
        q = q.filter(Family.district == district)
    total = q.count()
    rows = q.order_by(BenefitRecord.created_at.desc()).offset((page - 1) * size).limit(size).all()
    member_ids = [b.member_id for b, _, _ in rows if b.member_id]
    members = {m.member_id: m for m in db.query(FamilyMember).filter(FamilyMember.member_id.in_(member_ids)).all()} if member_ids else {}
    items = [benefit_payload(b, s, f, members.get(b.member_id)) for b, s, f in rows]
    return {"total": total, "items": items, "page": page, "size": size}


@router.get("/{benefit_id}")
def get_benefit(benefit_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    b = db.get(BenefitRecord, benefit_id)
    if b is None:
        raise HTTPException(404, "Benefit not found")
    fam = load_family(db, user, b.family_id)
    return benefit_payload(b, db.get(Scheme, b.scheme_id), fam, db.get(FamilyMember, b.member_id) if b.member_id else None)


@router.post("/{benefit_id}/delivery")
def update_delivery(benefit_id: UUID, body: DeliveryUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    b = db.get(BenefitRecord, benefit_id)
    if b is None:
        raise HTTPException(404, "Benefit not found")
    fam = load_family(db, user, b.family_id)
    scheme = db.get(Scheme, b.scheme_id)
    member = db.get(FamilyMember, b.member_id) if b.member_id else None
    officer = is_officer(user)
    if officer and body.status not in OFFICER_STATUSES:
        raise HTTPException(403, "Officers may only record sanctioned, disbursed or delivered status")
    if not officer and body.status not in CITIZEN_STATUSES:
        raise HTTPException(403, "Citizens may only confirm receipt or report a benefit as not received")
    if not officer and b.delivery_status == "RECEIVED_CONFIRMED":
        raise HTTPException(400, "This benefit has already been confirmed as received")
    if not officer and b.delivery_status == "SANCTIONED" and body.status == "RECEIVED_CONFIRMED":
        raise HTTPException(400, "This benefit has not been disbursed yet, so it cannot be confirmed as received")
    now = utcnow()
    old_status = b.delivery_status
    new_status = "DISPUTED" if body.status == "NOT_RECEIVED" else body.status
    entry = {"status": body.status, "at": now.isoformat(), "by": user.name, "by_user_id": str(user.user_id),
             "note": body.note, "reference": body.reference}
    b.delivery_log = list(b.delivery_log or []) + [entry]
    b.delivery_status = new_status
    grievance = None
    if officer:
        b.last_delivery_at = now
    elif body.status == "RECEIVED_CONFIRMED":
        b.citizen_confirmed_at = now
    else:  # NOT_RECEIVED
        grievance = Grievance(
            grievance_number=generate_number(db, "GRV"), family_id=fam.family_id, member_id=b.member_id, benefit_id=b.benefit_id,
            application_id=b.application_id, scheme_id=b.scheme_id, category="BENEFIT_NOT_RECEIVED",
            description=body.note or f"Benefit under {scheme.scheme_name if scheme else 'the scheme'} was recorded as {STATUS_WORDS.get(old_status, old_status.lower())} but has not been received.",
            status="OPEN", priority="HIGH", department=scheme.department if scheme else None, due_at=now + timedelta(days=7),
            history=[{"action": "CREATED", "at": now.isoformat(), "by": user.name, "note": "Raised automatically because the citizen reported the benefit as not received"}],
        )
        db.add(grievance); db.flush()
        audit(db, user, "GRIEVANCE_CREATED", "GRIEVANCE", grievance.grievance_id, fam.family_id,
              new_value={"grievance_number": grievance.grievance_number, "category": grievance.category, "benefit_id": str(b.benefit_id)})
        notify(db, "GRIEVANCE_CREATED", f"Grievance {grievance.grievance_number} has been raised because the {scheme.scheme_name if scheme else ''} benefit was not received. It will be resolved within 7 days.",
               family_id=fam.family_id, member_id=b.member_id, link="/grievances")
    audit(db, user, "BENEFIT_DELIVERY_UPDATED", "BENEFIT", b.benefit_id, fam.family_id,
          old_value={"delivery_status": old_status}, new_value={"delivery_status": new_status, "reference": body.reference, "note": body.note})
    notify(db, "BENEFIT_STATUS", f"Your {scheme.scheme_name if scheme else ''} benefit has been {STATUS_WORDS.get(new_status, new_status.lower())}.",
           title=f"Benefit {STATUS_WORDS.get(new_status, new_status.lower())}", family_id=fam.family_id, member_id=b.member_id, link="/benefits")
    db.commit()
    out = benefit_payload(b, scheme, fam, member)
    out["grievance"] = serialize(grievance) if grievance else None
    return out
