"""Schemes and eligibility routers (/schemes, /eligibility)."""
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_officer, require_roles
from app.models import (Family, FamilyMember, Scheme, SchemeEligibility, BenefitApplication, BenefitRecord, User)
from app.schemas.inputs import SchemeIn
from app.services.common import audit, utcnow
from app.services.eligibility import FIELD_LABELS, evaluate, recalculate_family
from .deps import serialize, my_family, load_family

router = APIRouter(prefix="/schemes", tags=["schemes"])
eligibility_router = APIRouter(prefix="/eligibility", tags=["eligibility"])
extra_routers = [eligibility_router]

require_scheme_manager = require_roles("DEPARTMENT_OFFICER", "ADMIN")

NUMBER_FIELDS = {"age", "annual_income", "family_size", "disability_percentage", "children_count", "seniors_count"}
OPS_BY_TYPE = {
    "number": ["==", "!=", ">", ">=", "<", "<=", "between"],
    "boolean": ["is_true", "is_false"],
    "string": ["==", "!=", "in", "not_in", "contains", "exists"],
}


def field_type(field: str) -> str:
    if field in NUMBER_FIELDS:
        return "number"
    if field.startswith("is_") or field.startswith("has_") or field in ("family_verified", "member_verified", "bank_linked"):
        return "boolean"
    return "string"


def validate_rules(rules: list[dict[str, Any]]) -> None:
    for i, rule in enumerate(rules or []):
        field = rule.get("field")
        op = rule.get("op")
        if field not in FIELD_LABELS:
            raise HTTPException(400, f"Rule {i + 1} uses an unknown field '{field}'. Use GET /schemes/rule-fields for the supported fields.")
        allowed = OPS_BY_TYPE[field_type(field)]
        if op not in allowed:
            raise HTTPException(400, f"Rule {i + 1}: operator '{op}' is not supported for {FIELD_LABELS[field]}. Allowed operators: {', '.join(allowed)}.")
        if op == "between" and not (isinstance(rule.get("value"), (list, tuple)) and len(rule["value"]) == 2):
            raise HTTPException(400, f"Rule {i + 1}: 'between' requires a two-item list as value.")
        if op in ("in", "not_in") and not isinstance(rule.get("value"), (list, tuple)):
            raise HTTPException(400, f"Rule {i + 1}: '{op}' requires a list as value.")
        if op not in ("exists", "is_true", "is_false") and rule.get("value") is None:
            raise HTTPException(400, f"Rule {i + 1}: a value is required for operator '{op}'.")


def scheme_summary(s: Scheme) -> dict:
    return {
        "scheme_id": str(s.scheme_id), "scheme_code": s.scheme_code, "scheme_name": s.scheme_name,
        "department": s.department, "category": s.category, "benefit_type": s.benefit_type,
        "benefit_amount": float(s.benefit_amount) if s.benefit_amount is not None else None,
        "benefit_frequency": s.benefit_frequency, "description": s.description,
        "required_documents": s.required_documents or [],
    }


# ------------------------------------------------------------------ schemes
@router.get("")
def list_schemes(status: Optional[str] = None, department: Optional[str] = None, category: Optional[str] = None,
                 db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Scheme)
    if status:
        q = q.filter(Scheme.status == status)
    if department:
        q = q.filter(Scheme.department == department)
    if category:
        q = q.filter(Scheme.category == category)
    return serialize(q.order_by(Scheme.scheme_name).all())


@router.get("/rule-fields")
def rule_fields(user: User = Depends(get_current_user)):
    out = []
    for field, label in FIELD_LABELS.items():
        t = field_type(field)
        out.append({"field": field, "label": label, "type": t, "ops": OPS_BY_TYPE[t]})
    return out


@router.post("", status_code=201)
def create_scheme(body: SchemeIn, db: Session = Depends(get_db), user: User = Depends(require_scheme_manager)):
    validate_rules(body.eligibility_rules)
    if db.query(Scheme).filter(Scheme.scheme_code == body.scheme_code).first():
        raise HTTPException(409, f"A scheme with code {body.scheme_code} already exists")
    s = Scheme(**body.model_dump())
    db.add(s); db.flush()
    audit(db, user, "SCHEME_CREATED", "SCHEME", s.scheme_id, new_value=body.model_dump())
    db.commit()
    return serialize(s)


class SchemePatch(BaseModel):
    scheme_code: Optional[str] = None
    scheme_name: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    target_type: Optional[str] = None
    benefit_type: Optional[str] = None
    benefit_amount: Optional[float] = None
    benefit_frequency: Optional[str] = None
    eligibility_rules: Optional[list[dict[str, Any]]] = None
    required_documents: Optional[list[str]] = None
    exclusive_with: Optional[list[str]] = None
    status: Optional[str] = None


def _get_scheme(db: Session, scheme_id: UUID) -> Scheme:
    s = db.get(Scheme, scheme_id)
    if s is None:
        raise HTTPException(404, "Scheme not found")
    return s


@router.patch("/{scheme_id}")
def update_scheme(scheme_id: UUID, body: SchemePatch, db: Session = Depends(get_db), user: User = Depends(require_scheme_manager)):
    s = _get_scheme(db, scheme_id)
    changes = body.model_dump(exclude_none=True)
    if "eligibility_rules" in changes:
        validate_rules(changes["eligibility_rules"])
    if "scheme_code" in changes and changes["scheme_code"] != s.scheme_code:
        if db.query(Scheme).filter(Scheme.scheme_code == changes["scheme_code"]).first():
            raise HTTPException(409, f"A scheme with code {changes['scheme_code']} already exists")
    old = {k: getattr(s, k) for k in changes}
    for k, v in changes.items():
        setattr(s, k, v)
    audit(db, user, "SCHEME_UPDATED", "SCHEME", s.scheme_id, old_value=old, new_value=changes)
    db.commit()
    return serialize(s)


@router.post("/{scheme_id}/toggle")
def toggle_scheme(scheme_id: UUID, db: Session = Depends(get_db), user: User = Depends(require_scheme_manager)):
    s = _get_scheme(db, scheme_id)
    old = s.status
    s.status = "INACTIVE" if s.status == "ACTIVE" else "ACTIVE"
    audit(db, user, "SCHEME_UPDATED", "SCHEME", s.scheme_id, old_value={"status": old}, new_value={"status": s.status})
    db.commit()
    return serialize(s)


@router.get("/{scheme_id}")
def get_scheme(scheme_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return serialize(_get_scheme(db, scheme_id))


@router.get("/{scheme_id}/eligible-families")
def eligible_families(scheme_id: UUID, status: Optional[str] = None, district: Optional[str] = None, page: int = 1, size: int = 25,
                      db: Session = Depends(get_db), user: User = Depends(require_officer)):
    s = _get_scheme(db, scheme_id)
    q = (db.query(SchemeEligibility, Family, FamilyMember)
         .join(Family, Family.family_id == SchemeEligibility.family_id)
         .outerjoin(FamilyMember, FamilyMember.member_id == SchemeEligibility.member_id)
         .filter(SchemeEligibility.scheme_id == s.scheme_id))
    if status:
        q = q.filter(SchemeEligibility.eligibility_status == status)
    if district:
        q = q.filter(Family.district == district)
    total = q.count()
    rows = q.order_by(SchemeEligibility.checked_at.desc()).offset((page - 1) * size).limit(size).all()
    fam_ids = {f.family_id for _, f, _ in rows}
    heads = {}
    if fam_ids:
        for m in db.query(FamilyMember).filter(FamilyMember.family_id.in_(list(fam_ids)), FamilyMember.is_head.is_(True)).all():
            heads[m.family_id] = m.name
    items = []
    for e, f, m in rows:
        items.append({
            "eligibility_id": str(e.eligibility_id), "family_id": str(f.family_id), "family_code": f.family_code,
            "head_name": heads.get(f.family_id), "district": f.district,
            "member_id": str(m.member_id) if m else None, "member_name": m.name if m else None,
            "eligibility_status": e.eligibility_status, "eligibility_reason": e.eligibility_reason,
            "checked_at": e.checked_at.isoformat() if e.checked_at else None,
        })
    return {"total": total, "items": items, "page": page, "size": size}


class PreviewIn(BaseModel):
    family_id: UUID
    member_id: Optional[UUID] = None


@router.post("/{scheme_id}/preview")
def preview_scheme(scheme_id: UUID, body: PreviewIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    s = _get_scheme(db, scheme_id)
    fam = load_family(db, user, body.family_id)
    member = None
    if body.member_id:
        member = db.get(FamilyMember, body.member_id)
        if member is None or member.family_id != fam.family_id:
            raise HTTPException(404, "Member not found in this family")
    elif s.target_type == "MEMBER":
        member = next((m for m in fam.members if m.is_head), None)
    return serialize(evaluate(db, s, fam, member))


# ------------------------------------------------------------------ eligibility
def eligibility_payload(db: Session, fam: Family) -> dict:
    rows = db.query(SchemeEligibility).filter(SchemeEligibility.family_id == fam.family_id).order_by(SchemeEligibility.checked_at.desc()).all()
    scheme_ids = list({r.scheme_id for r in rows})
    schemes = {s.scheme_id: s for s in db.query(Scheme).filter(Scheme.scheme_id.in_(scheme_ids)).all()} if scheme_ids else {}
    names = {m.member_id: m.name for m in fam.members}
    apps = db.query(BenefitApplication).filter(BenefitApplication.family_id == fam.family_id,
                                               BenefitApplication.application_status != "WITHDRAWN").order_by(BenefitApplication.created_at.desc()).all()
    latest_app: dict = {}
    for a in apps:
        latest_app.setdefault((a.scheme_id, a.member_id), a)
    benefits = db.query(BenefitRecord).filter(BenefitRecord.family_id == fam.family_id, BenefitRecord.benefit_status == "ACTIVE").order_by(BenefitRecord.created_at.desc()).all()
    active_benefit: dict = {}
    for b in benefits:
        active_benefit.setdefault((b.scheme_id, b.member_id), b)
    order = {"ELIGIBLE": 0, "NEEDS_DOCUMENT": 1, "UNDER_REVIEW": 2, "NOT_ELIGIBLE": 3}
    items = []
    for r in sorted(rows, key=lambda r: (order.get(r.eligibility_status, 9), schemes.get(r.scheme_id).scheme_name if r.scheme_id in schemes else "")):
        s = schemes.get(r.scheme_id)
        d = serialize(r)
        d["scheme"] = scheme_summary(s) if s else None
        d["member_name"] = names.get(r.member_id)
        a = latest_app.get((r.scheme_id, r.member_id))
        d["application"] = {"application_id": str(a.application_id), "application_number": a.application_number,
                            "application_status": a.application_status} if a else None
        b = active_benefit.get((r.scheme_id, r.member_id))
        d["benefit"] = {"benefit_id": str(b.benefit_id), "delivery_status": b.delivery_status} if b else None
        items.append(d)
    checked = max((r.checked_at for r in rows if r.checked_at), default=None)
    return {"family_id": str(fam.family_id), "checked_at": checked.isoformat() if checked else None, "items": items}


@eligibility_router.get("/mine")
def my_eligibility(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = my_family(db, user)
    if fam is None:
        return {"family_id": None, "checked_at": None, "items": []}
    return eligibility_payload(db, fam)


@eligibility_router.get("/family/{family_id}")
def family_eligibility(family_id: UUID, db: Session = Depends(get_db), user: User = Depends(require_officer)):
    fam = load_family(db, user, family_id)
    return eligibility_payload(db, fam)


@eligibility_router.post("/recalculate/{family_id}")
def recalculate(family_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = load_family(db, user, family_id)
    recalculate_family(db, fam, user)
    db.commit()
    db.refresh(fam)
    return eligibility_payload(db, fam)
