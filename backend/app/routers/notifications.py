from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Notification, User
from .deps import serialize, my_family

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _scope(db: Session, user: User):
    """Return the filter expression selecting notifications visible to this user."""
    cond = Notification.user_id == user.user_id
    if user.role == "CITIZEN":
        fam = my_family(db, user)
        if fam is not None:
            cond = cond | (Notification.family_id == fam.family_id)
    return cond


@router.get("")
def list_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cond = _scope(db, user)
    rows = db.query(Notification).filter(cond).order_by(Notification.sent_at.desc()).limit(100).all()
    unread = db.query(Notification).filter(cond, Notification.status == "UNREAD").count()
    return {"unread": unread, "items": serialize(rows)}


@router.post("/read-all")
def read_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.query(Notification).filter(_scope(db, user), Notification.status == "UNREAD").update(
        {Notification.status: "READ"}, synchronize_session=False)
    db.commit()
    return {"ok": True}


@router.post("/{notification_id}/read")
def mark_read(notification_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.query(Notification).filter(Notification.notification_id == notification_id, _scope(db, user)).first()
    if n is None:
        raise HTTPException(404, "Notification not found")
    n.status = "READ"
    db.commit()
    return serialize(n)
