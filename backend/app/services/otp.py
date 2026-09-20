import hashlib
import logging
import secrets
import smtplib
from datetime import timedelta
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import OtpChallenge
from .common import utcnow

log = logging.getLogger("familyid.otp")


def _hash(code: str) -> str:
    return hashlib.sha256(f"{settings.JWT_SECRET}:{code}".encode()).hexdigest()


def send_email(to: str, subject: str, body: str) -> bool:
    if not settings.smtp_enabled:
        log.info("SMTP disabled; email to %s not sent. Subject: %s", to, subject)
        return False
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as s:
        s.starttls()
        s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        s.send_message(msg)
    return True


def issue_otp(db: Session, channel: str, identifier: str, purpose: str = "LOGIN") -> dict:
    code = settings.DEMO_OTP if settings.DEV_MODE else f"{secrets.randbelow(10**6):06d}"
    challenge = OtpChallenge(
        channel=channel, identifier=identifier, code_hash=_hash(code), purpose=purpose,
        expires_at=utcnow() + timedelta(minutes=10),
    )
    db.add(challenge)
    db.flush()
    delivered = False
    if channel == "EMAIL":
        delivered = send_email(identifier, "Your Family ID login code", f"Your one-time code is {code}. It is valid for 10 minutes.")
    else:
        log.info("SMS gateway not configured; OTP for %s is %s", identifier, code)
    result = {"challenge_id": str(challenge.challenge_id), "channel": channel, "delivered": delivered, "expires_in_seconds": 600}
    if settings.DEV_MODE:
        result["dev_otp"] = code
    return result


def verify_otp(db: Session, challenge_id: str, code: str) -> OtpChallenge | None:
    challenge = db.get(OtpChallenge, challenge_id)
    if challenge is None or challenge.consumed or challenge.expires_at < utcnow():
        return None
    challenge.attempts = (challenge.attempts or 0) + 1
    if challenge.attempts > 5:
        return None
    if challenge.code_hash != _hash(code):
        db.flush()
        return None
    challenge.consumed = True
    db.flush()
    return challenge
