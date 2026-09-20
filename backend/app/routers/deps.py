from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, OFFICER_ROLES
from app.models import Family, FamilyMember, User
from app.services.common import jsonable


def serialize(obj):
    return jsonable(obj)


def my_family(db: Session, user: User) -> Family | None:
    if user.member_id:
        m = db.get(FamilyMember, user.member_id)
        if m:
            return db.get(Family, m.family_id)
    return None


def load_family(db: Session, user: User, family_id) -> Family:
    fam = db.get(Family, family_id)
    if fam is None:
        raise HTTPException(404, "Family not found")
    if user.role == "CITIZEN":
        mine = my_family(db, user)
        if mine is None or mine.family_id != fam.family_id:
            raise HTTPException(403, "You can only access your own family")
    return fam


def is_officer(user: User) -> bool:
    return user.role in OFFICER_ROLES
