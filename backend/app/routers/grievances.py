"""Grievance router (/grievances)."""
from datetime import timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_officer
from app.models import Family, FamilyMember, Scheme, BenefitApplication, BenefitRecord, Grievance, User
from app.schemas.inputs import GrievanceIn, GrievanceAction
from app.services.common import audit, notify, utcnow, generate_number
from .deps import serialize, my_family, load_family, is_officer
from .families import family_detail

router = APIRouter(prefix="/grievances", tags=["grievances"])

CATEGORIES = ("BENEFIT_NOT_RECEIVED", "WRONG_AMOUNT", "APPLICATION_DELAY", "WRONG_REJECTION", "DATA_ERROR", "VERIFICATION_DELAY", "OTHER")
CLOSED = ("RESOLVED", "CLOSED")
OFFICER_ACTIONS = ("ASSIGN", "IN_PROGRESS", "ESCALATE", "RESOLVE", "CLOSE")
CITIZEN_ACTIONS = ("REOPEN", "RATE")


def _entry(action: str, user: User, note: Optional[str], **extra) -> dict:
    return {"action": action, "at": utcnow().isoformat(), "by": user.name, "by_user_id": str(user.user_id), "note": note, **extra}


def _is_overdue(g: Grievance) -> bool:
    return bool(g.due_at and g.due_at < utcnow() and g.status not in CLOSED)


def grievance_payload(g: Grievance, scheme: Scheme | None = None, fam: Family | None = None, officer: User | None = None) -> dict:
    d = serialize(g)
    d["scheme_name"] = scheme.scheme_name if scheme else None
    d["overdue"] = _is_overdue(g)
    if fam is not None:
        d["family_code"] = fam.family_code
        d["district"] = fam.district
        head = next((m for m in fam.members if m.is_head), None)
        d["head_name"] = head.name if head else None
    d["assigned_officer_name"] = officer.name if officer else None
    return d


def _scheme_map(db: Session, rows: list[Grievance]) -> dict:
    ids = [g.scheme_id for g in rows if g.scheme_id]
    return {s.scheme_id: s for s in db.query(Scheme).filter(Scheme.scheme_id.in_(ids)).all()} if ids else {}


@router.post("", status_code=201)
def create_grievance(body: GrievanceIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if body.category not in CATEGORIES:
        raise HTTPException(400, f"Unknown grievance category. Use one of: {', '.join(CATEGORIES)}")
    if not body.description.strip():
        raise HTTPException(400, "Describe the grievance before submitting")
    fam = None
    app_row = db.get(BenefitApplication, body.application_id) if body.application_id else None
    ben = db.get(BenefitRecord, body.benefit_id) if body.benefit_id else None
    if body.application_id and app_row is None:
        raise HTTPException(404, "Application not found")
    if body.benefit_id and ben is None:
        raise HTTPException(404, "Benefit not found")
    if user.role == "CITIZEN":
        fam = my_family(db, user)
        if fam is None:
            raise HTTPException(400, "Create your family profile before raising a grievance")
        for linked in (app_row, ben):
            if linked is not None and linked.family_id != fam.family_id:
                raise HTTPException(403, "The referenced record does not belong to your family")
    else:
        fid = (app_row.family_id if app_row else None) or (ben.family_id if ben else None)
        if fid is None and body.member_id:
            m = db.get(FamilyMember, body.member_id)
            fid = m.family_id if m else None
        if fid is None:
            raise HTTPException(400, "Officers must reference an application, benefit or member so the family can be identified")
        fam = load_family(db, user, fid)
    member_id = body.member_id or (app_row.member_id if app_row else None) or (ben.member_id if ben else None)
    if member_id and member_id not in {m.member_id for m in fam.members}:
        raise HTTPException(404, "Member not found in this family")
    scheme_id = body.scheme_id or (app_row.scheme_id if app_row else None) or (ben.scheme_id if ben else None)
    scheme = db.get(Scheme, scheme_id) if scheme_id else None
    now = utcnow()
    g = Grievance(
        grievance_number=generate_number(db, "GRV"), family_id=fam.family_id, member_id=member_id,
        application_id=body.application_id, benefit_id=body.benefit_id, scheme_id=scheme_id, category=body.category,
        description=body.description.strip(), status="OPEN", priority="HIGH" if body.category in ("BENEFIT_NOT_RECEIVED", "WRONG_REJECTION") else "NORMAL",
        department=scheme.department if scheme else None, due_at=now + timedelta(days=7),
        history=[_entry("CREATED", user, "Grievance raised")],
    )
    db.add(g); db.flush()
    audit(db, user, "GRIEVANCE_CREATED", "GRIEVANCE", g.grievance_id, fam.family_id,
          new_value={"grievance_number": g.grievance_number, "category": g.category})
    notify(db, "GRIEVANCE_CREATED", f"Grievance {g.grievance_number} has been registered. You will receive a response within 7 days.",
           family_id=fam.family_id, member_id=member_id, link="/grievances")
    db.commit()
    return grievance_payload(g, scheme, fam)


@router.get("/mine")
def my_grievances(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = my_family(db, user)
    if fam is None:
        return []
    rows = db.query(Grievance).filter(Grievance.family_id == fam.family_id).order_by(Grievance.created_at.desc()).all()
    schemes = _scheme_map(db, rows)
    return [grievance_payload(g, schemes.get(g.scheme_id)) for g in rows]


@router.get("")
def list_grievances(status: Optional[str] = None, category: Optional[str] = None, district: Optional[str] = None,
                    page: int = 1, size: int = 25, db: Session = Depends(get_db), user: User = Depends(require_officer)):
    q = db.query(Grievance, Family).join(Family, Family.family_id == Grievance.family_id)
    if status:
        q = q.filter(Grievance.status == status)
    if category:
        q = q.filter(Grievance.category == category)
    if district:
        q = q.filter(Family.district == district)
    total = q.count()
    rows = q.order_by(Grievance.created_at.desc()).offset((page - 1) * size).limit(size).all()
    schemes = _scheme_map(db, [g for g, _ in rows])
    officer_ids = [g.assigned_officer_id for g, _ in rows if g.assigned_officer_id]
    officers = {u.user_id: u for u in db.query(User).filter(User.user_id.in_(officer_ids)).all()} if officer_ids else {}
    items = [grievance_payload(g, schemes.get(g.scheme_id), f, officers.get(g.assigned_officer_id)) for g, f in rows]
    return {"total": total, "items": items, "page": page, "size": size}


@router.get("/{grievance_id}")
def get_grievance(grievance_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    g = db.get(Grievance, grievance_id)
    if g is None:
        raise HTTPException(404, "Grievance not found")
    fam = load_family(db, user, g.family_id)
    scheme = db.get(Scheme, g.scheme_id) if g.scheme_id else None
    officer = db.get(User, g.assigned_officer_id) if g.assigned_officer_id else None
    return {
        "grievance": grievance_payload(g, scheme, fam, officer), "family": family_detail(db, fam),
        "application": serialize(db.get(BenefitApplication, g.application_id)) if g.application_id else None,
        "benefit": serialize(db.get(BenefitRecord, g.benefit_id)) if g.benefit_id else None,
        "scheme": serialize(scheme),
    }


@router.post("/{grievance_id}/action")
def act_on_grievance(grievance_id: UUID, body: GrievanceAction, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    g = db.get(Grievance, grievance_id)
    if g is None:
        raise HTTPException(404, "Grievance not found")
    fam = load_family(db, user, g.family_id)
    action = body.action
    officer = is_officer(user)
    if action in OFFICER_ACTIONS and not officer:
        raise HTTPException(403, "Only officers can perform this action")
    if action in CITIZEN_ACTIONS and officer:
        raise HTTPException(403, "Only the citizen who raised the grievance can perform this action")
    old = {"status": g.status, "priority": g.priority, "escalation_level": g.escalation_level, "assigned_officer_id": g.assigned_officer_id}
    now = utcnow()
    extra = {}
    if action == "ASSIGN":
        target = db.get(User, body.assign_to_user_id) if body.assign_to_user_id else user
        if target is None or not is_officer(target):
            raise HTTPException(400, "Assign the grievance to an officer account")
        if g.status in CLOSED:
            raise HTTPException(400, "A resolved or closed grievance cannot be assigned")
        g.assigned_officer_id = target.user_id
        if g.status in ("OPEN", "REOPENED"):
            g.status = "IN_PROGRESS"
        extra["assigned_to"] = target.name
    elif action == "IN_PROGRESS":
        if g.status in CLOSED:
            raise HTTPException(400, "A resolved or closed grievance cannot be moved to in progress")
        g.status = "IN_PROGRESS"
        if g.assigned_officer_id is None:
            g.assigned_officer_id = user.user_id
    elif action == "ESCALATE":
        if g.status in CLOSED:
            raise HTTPException(400, "A resolved or closed grievance cannot be escalated")
        g.escalation_level = (g.escalation_level or 0) + 1
        g.priority = "HIGH"
        g.status = "ESCALATED"
        extra["escalation_level"] = g.escalation_level
    elif action == "RESOLVE":
        if g.status in CLOSED:
            raise HTTPException(400, "This grievance is already resolved")
        if not body.note:
            raise HTTPException(400, "Describe the resolution in the note")
        g.status = "RESOLVED"
        g.resolution = body.note
        g.resolved_at = now
        notify(db, "GRIEVANCE_RESOLVED", f"Grievance {g.grievance_number} has been resolved: {body.note}",
               family_id=fam.family_id, member_id=g.member_id, link="/grievances")
    elif action == "CLOSE":
        if g.status == "CLOSED":
            raise HTTPException(400, "This grievance is already closed")
        g.status = "CLOSED"
        if g.resolved_at is None:
            g.resolved_at = now
        if body.note and not g.resolution:
            g.resolution = body.note
        notify(db, "GRIEVANCE_UPDATED", f"Grievance {g.grievance_number} has been closed.", family_id=fam.family_id, member_id=g.member_id, link="/grievances")
    elif action == "REOPEN":
        if g.status not in CLOSED:
            raise HTTPException(400, "Only a resolved or closed grievance can be reopened")
        g.status = "REOPENED"
        g.resolved_at = None
        g.due_at = now + timedelta(days=7)
        g.priority = "HIGH"
    elif action == "RATE":
        if g.status not in CLOSED:
            raise HTTPException(400, "A grievance can be rated only after it is resolved")
        if body.rating is None:
            raise HTTPException(400, "Provide a rating between 1 and 5")
        g.citizen_rating = body.rating
        extra["rating"] = body.rating
    g.history = list(g.history or []) + [_entry(action, user, body.note, **extra)]
    audit(db, user, "GRIEVANCE_UPDATED", "GRIEVANCE", g.grievance_id, fam.family_id, old_value=old,
          new_value={"action": action, "status": g.status, "priority": g.priority, "escalation_level": g.escalation_level,
                     "assigned_officer_id": g.assigned_officer_id, "note": body.note, **extra})
    db.commit()
    scheme = db.get(Scheme, g.scheme_id) if g.scheme_id else None
    assigned = db.get(User, g.assigned_officer_id) if g.assigned_officer_id else None
    return grievance_payload(g, scheme, fam, assigned)
