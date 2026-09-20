from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_token, get_current_user
from app.models import User, FamilyMember, Family
from app.schemas.inputs import OtpRequest, OtpVerify
from app.services.otp import issue_otp, verify_otp
from app.services.common import audit, utcnow
from .deps import serialize, my_family

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-otp")
def request_otp(body: OtpRequest, db: Session = Depends(get_db)):
    ident = body.identifier.strip().lower() if body.channel == "EMAIL" else body.identifier.strip()
    if body.channel == "MOBILE" and not (ident.isdigit() and 10 <= len(ident) <= 12):
        raise HTTPException(400, "Enter a valid mobile number")
    if body.channel == "EMAIL" and "@" not in ident:
        raise HTTPException(400, "Enter a valid email address")
    res = issue_otp(db, body.channel, ident)
    db.commit()
    existing = db.query(User).filter((User.mobile == ident) if body.channel == "MOBILE" else (User.email == ident)).first()
    res["known_user"] = existing is not None
    return res


@router.post("/verify-otp")
def verify(body: OtpVerify, db: Session = Depends(get_db)):
    challenge = verify_otp(db, body.challenge_id, body.code.strip())
    if challenge is None:
        db.commit()
        raise HTTPException(401, "Invalid or expired code")
    col = User.mobile if challenge.channel == "MOBILE" else User.email
    user = db.query(User).filter(col == challenge.identifier).first()
    if user is None:
        user = User(name=body.name or "Citizen", role="CITIZEN",
                    mobile=challenge.identifier if challenge.channel == "MOBILE" else None,
                    email=challenge.identifier if challenge.channel == "EMAIL" else None)
        db.add(user); db.flush()
        audit(db, user, "USER_REGISTERED", "USER", user.user_id)
    user.last_login_at = utcnow()
    audit(db, user, "LOGIN", "USER", user.user_id)
    db.commit()
    fam = my_family(db, user)
    return {"token": create_token(str(user.user_id), user.role), "user": serialize(user),
            "family_id": str(fam.family_id) if fam else None}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    fam = my_family(db, user)
    return {"user": serialize(user), "family_id": str(fam.family_id) if fam else None,
            "family_code": fam.family_code if fam else None, "family_status": fam.family_status if fam else None}
