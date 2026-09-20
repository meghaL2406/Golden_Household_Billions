from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_admin, ROLES
from app.models import AuditLog, User
from app.schemas.inputs import UserIn
from app.services.common import audit, DISTRICT_CODES
from .deps import serialize, my_family

router = APIRouter(prefix="/audit", tags=["audit"])
users_router = APIRouter(prefix="/users", tags=["users"])
meta_router = APIRouter(prefix="/meta", tags=["meta"])
extra_routers = [users_router, meta_router]

DOCUMENT_TYPES = ["BIRTH_CERTIFICATE", "MARRIAGE_CERTIFICATE", "DEATH_CERTIFICATE", "INCOME_CERTIFICATE", "ADDRESS_PROOF",
                  "DISABILITY_CERTIFICATE", "RATION_CARD", "EDUCATION_RECORD", "COURT_ORDER", "ADOPTION_ORDER",
                  "CASTE_CERTIFICATE", "BANK_PASSBOOK", "OTHER"]
RELATIONSHIP_TYPES = ["SPOUSE", "FATHER", "MOTHER", "SON", "DAUGHTER", "BROTHER", "SISTER", "GUARDIAN", "WARD",
                      "GRANDFATHER", "GRANDMOTHER", "GRANDSON", "GRANDDAUGHTER", "OTHER"]
EVENT_TYPES = ["BIRTH", "MARRIAGE", "DEATH", "DIVORCE", "SEPARATION", "ADOPTION", "GUARDIANSHIP", "ADDRESS_CHANGE",
               "MIGRATION", "SPLIT"]
GRIEVANCE_CATEGORIES = ["BENEFIT_NOT_RECEIVED", "WRONG_AMOUNT", "APPLICATION_DELAY", "WRONG_REJECTION", "DATA_ERROR",
                        "VERIFICATION_DELAY", "OTHER"]
SCHEME_CATEGORIES = ["EDUCATION", "CHILD", "SENIOR", "DISABILITY", "HOUSING", "HEALTH", "FOOD", "WOMEN", "FINANCIAL"]
DEPARTMENTS = ["Education", "Women and Child Development", "Social Justice and Empowerment", "Health and Family Welfare",
               "Food and Civil Supplies", "Housing and Urban Development", "Rural Development", "Labour and Employment"]
CASE_TYPES = ["DUPLICATE_PERSON", "DUPLICATE_FAMILY", "AADHAAR_MISMATCH", "RELATIONSHIP_MISMATCH", "INVALID_DOCUMENT",
              "ADDRESS_CONFLICT", "EXISTING_BENEFIT", "LIFE_EVENT", "FAMILY_VERIFICATION", "MERGE_REQUEST", "MANUAL_REVIEW"]


# ------------------------------------------------------------------ audit
@router.get("")
def list_audit(family_id: Optional[UUID] = None, action: Optional[str] = None, entity_type: Optional[str] = None,
               actor: Optional[str] = None, page: int = 1, size: int = 25,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "CITIZEN":
        mine = my_family(db, user)
        if mine is None:
            return {"total": 0, "items": [], "page": page, "size": size}
        if family_id is not None and family_id != mine.family_id:
            raise HTTPException(403, "You can only view the audit trail of your own family")
        family_id = mine.family_id
    query = db.query(AuditLog)
    if family_id is not None:
        query = query.filter(AuditLog.family_id == family_id)
    if action:
        query = query.filter(AuditLog.action == action.upper())
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type.upper())
    if actor:
        try:
            query = query.filter(AuditLog.actor_user_id == UUID(actor))
        except ValueError:
            query = query.filter(AuditLog.actor_label.ilike(f"%{actor}%"))
    total = query.count()
    rows = query.order_by(AuditLog.timestamp.desc()).offset((page - 1) * size).limit(max(size, 1)).all()
    return {"total": total, "items": serialize(rows), "page": page, "size": size}


# ------------------------------------------------------------------ users (ADMIN)
def _normalise_user_payload(data: dict) -> dict:
    if data.get("mobile"):
        data["mobile"] = "".join(ch for ch in str(data["mobile"]) if ch.isdigit())
        if not (10 <= len(data["mobile"]) <= 12):
            raise HTTPException(400, "Enter a valid mobile number")
    if data.get("email"):
        data["email"] = str(data["email"]).strip().lower()
    if data.get("role") and data["role"] not in ROLES:
        raise HTTPException(400, f"Unknown role. Allowed roles: {', '.join(ROLES)}")
    if data.get("status") and data["status"] not in ("ACTIVE", "INACTIVE", "SUSPENDED"):
        raise HTTPException(400, "status must be ACTIVE, INACTIVE or SUSPENDED")
    return data


def _check_unique(db: Session, data: dict, exclude_id=None):
    if data.get("mobile"):
        q = db.query(User).filter(User.mobile == data["mobile"])
        if exclude_id is not None:
            q = q.filter(User.user_id != exclude_id)
        if q.first():
            raise HTTPException(409, "A user with this mobile number already exists")
    if data.get("email"):
        q = db.query(User).filter(User.email == data["email"])
        if exclude_id is not None:
            q = q.filter(User.user_id != exclude_id)
        if q.first():
            raise HTTPException(409, "A user with this email address already exists")


@users_router.get("")
def list_users(role: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None,
               db: Session = Depends(get_db), user: User = Depends(require_admin)):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role.upper())
    if status:
        query = query.filter(User.status == status.upper())
    if q:
        like = f"%{q}%"
        query = query.filter((User.name.ilike(like)) | (User.mobile.ilike(like)) | (User.email.ilike(like)))
    return serialize(query.order_by(User.created_at.desc()).limit(500).all())


@users_router.post("", status_code=201)
def create_user(body: UserIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    data = _normalise_user_payload(body.model_dump())
    if not data.get("mobile") and not data.get("email"):
        raise HTTPException(400, "Provide a mobile number or an email address for the user")
    _check_unique(db, data)
    u = User(**data)
    db.add(u); db.flush()
    audit(db, user, "USER_CREATED", "USER", u.user_id, new_value={"name": u.name, "role": u.role, "district": u.district})
    db.commit()
    return serialize(u)


@users_router.patch("/{user_id}")
def update_user(user_id: UUID, body: dict, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "User not found")
    allowed = {"name", "mobile", "email", "role", "department", "district", "status"}
    changes = {k: v for k, v in body.items() if k in allowed}
    if not changes:
        raise HTTPException(400, "No editable fields were provided")
    changes = _normalise_user_payload(changes)
    if u.user_id == user.user_id and (changes.get("role") not in (None, "ADMIN") or changes.get("status") not in (None, "ACTIVE")):
        raise HTTPException(400, "You cannot change your own role or deactivate your own account")
    _check_unique(db, changes, exclude_id=u.user_id)
    old = {k: getattr(u, k) for k in changes}
    for k, v in changes.items():
        setattr(u, k, v)
    audit(db, user, "USER_UPDATED", "USER", u.user_id, old_value=old, new_value=changes)
    db.commit()
    return serialize(u)


# ------------------------------------------------------------------ meta
@meta_router.get("/enums")
def enums():
    return {
        "document_types": DOCUMENT_TYPES,
        "relationship_types": RELATIONSHIP_TYPES,
        "event_types": EVENT_TYPES,
        "grievance_categories": GRIEVANCE_CATEGORIES,
        "districts": list(DISTRICT_CODES.keys()),
        "scheme_categories": SCHEME_CATEGORIES,
        "departments": DEPARTMENTS,
        "case_types": CASE_TYPES,
        "roles": list(ROLES),
        "family_types": ["NUCLEAR", "JOINT", "SINGLE", "GUARDIAN"],
        "income_categories": ["BPL", "APL", "AAY", "UNKNOWN"],
        "genders": ["MALE", "FEMALE", "OTHER"],
        "marital_statuses": ["SINGLE", "MARRIED", "WIDOWED", "DIVORCED", "SEPARATED"],
    }
