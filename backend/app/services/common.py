import re
import unicodedata
from datetime import date, datetime, timezone
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import AuditLog, Notification, Sequence

DISTRICT_CODES = {
    "Ahmedabad": "AHM", "Surat": "SUR", "Vadodara": "VAD", "Rajkot": "RAJ", "Gandhinagar": "GNR",
    "Bhavnagar": "BHV", "Jamnagar": "JAM", "Junagadh": "JUN", "Kutch": "KUT", "Anand": "AND",
    "Mehsana": "MEH", "Bharuch": "BRC", "Navsari": "NAV", "Valsad": "VAL", "Patan": "PAT",
    "Banaskantha": "BNK", "Sabarkantha": "SBK", "Kheda": "KHD", "Amreli": "AMR", "Dahod": "DAH",
    "Panchmahal": "PCM", "Morbi": "MOR", "Surendranagar": "SND", "Porbandar": "POR", "Narmada": "NAR",
    "Tapi": "TAP", "Dang": "DNG", "Aravalli": "ARV", "Botad": "BOT", "Chhota Udaipur": "CHU",
    "Devbhoomi Dwarka": "DWK", "Gir Somnath": "GIR", "Mahisagar": "MHS",
}

DISTRICT_CENTROIDS = {
    "Ahmedabad": (23.0225, 72.5714), "Surat": (21.1702, 72.8311), "Vadodara": (22.3072, 73.1812),
    "Rajkot": (22.3039, 70.8022), "Gandhinagar": (23.2156, 72.6369), "Bhavnagar": (21.7645, 72.1519),
    "Jamnagar": (22.4707, 70.0577), "Junagadh": (21.5222, 70.4579), "Kutch": (23.7337, 69.8597),
    "Anand": (22.5645, 72.9289), "Mehsana": (23.5880, 72.3693), "Bharuch": (21.7051, 72.9959),
    "Navsari": (20.9467, 72.9520), "Valsad": (20.5992, 72.9342), "Patan": (23.8493, 72.1266),
    "Banaskantha": (24.1722, 72.4383), "Sabarkantha": (23.5981, 72.9634), "Kheda": (22.7507, 72.6847),
    "Amreli": (21.6032, 71.2221), "Dahod": (22.8350, 74.2550), "Panchmahal": (22.7739, 73.6142),
    "Morbi": (22.8173, 70.8378), "Surendranagar": (22.7277, 71.6486), "Porbandar": (21.6417, 69.6293),
    "Narmada": (21.8713, 73.5031), "Tapi": (21.1233, 73.3969), "Dang": (20.7539, 73.6853),
    "Aravalli": (23.5380, 73.2820), "Botad": (22.1704, 71.6684), "Chhota Udaipur": (22.3049, 74.0121),
    "Devbhoomi Dwarka": (22.2394, 68.9678), "Gir Somnath": (20.9159, 70.3629), "Mahisagar": (23.1300, 73.6300),
}


def normalize_name(name: str) -> str:
    """Normalise Indian names for duplicate detection: casefold, strip honorifics, collapse spelling variants."""
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(shri|smt|kumari|mr|mrs|ms|dr|bhai|ben)\b", " ", s)
    s = re.sub(r"[^a-z ]", " ", s)
    # common transliteration variants
    for a, b in (("ee", "i"), ("oo", "u"), ("aa", "a"), ("ck", "k"), ("sh", "s"), ("ph", "f"), ("th", "t"), ("dh", "d"), ("bh", "b"), ("kh", "k"), ("gh", "g"), ("ch", "c"), ("w", "v"), ("y", "i"), ("z", "j")):
        s = s.replace(a, b)
    s = re.sub(r"(.)\1+", r"\1", s)  # collapse doubled letters
    return re.sub(r"\s+", " ", s).strip()


def age_on(dob: Optional[date], on: Optional[date] = None) -> Optional[int]:
    if not dob:
        return None
    on = on or date.today()
    return on.year - dob.year - ((on.month, on.day) < (dob.month, dob.day))


def next_sequence(db: Session, key: str) -> int:
    row = db.execute(
        text("INSERT INTO id_sequence(key, value) VALUES (:k, 1) "
             "ON CONFLICT (key) DO UPDATE SET value = id_sequence.value + 1 RETURNING value"),
        {"k": key},
    ).scalar_one()
    return int(row)


def generate_family_code(db: Session, district: Optional[str]) -> str:
    code = DISTRICT_CODES.get(district or "", "GEN")
    yy = datetime.now().strftime("%y")
    n = next_sequence(db, f"FAMILY-{code}-{yy}")
    return f"GJ-{code}-{yy}-{n:06d}"


def generate_number(db: Session, prefix: str) -> str:
    yy = datetime.now().strftime("%y")
    n = next_sequence(db, f"{prefix}-{yy}")
    return f"{prefix}-{yy}-{n:06d}"


def audit(db: Session, actor, action: str, entity_type: str, reference_id=None, family_id=None,
          old_value: Any = None, new_value: Any = None) -> None:
    db.add(AuditLog(
        actor_user_id=getattr(actor, "user_id", None),
        actor_label=getattr(actor, "name", None) or "system",
        actor_role=getattr(actor, "role", None) or "SYSTEM",
        action=action, entity_type=entity_type, reference_id=reference_id, family_id=family_id,
        old_value=jsonable(old_value), new_value=jsonable(new_value),
    ))


def notify(db: Session, notification_type: str, message: str, title: Optional[str] = None,
           family_id=None, member_id=None, user_id=None, link: Optional[str] = None) -> None:
    db.add(Notification(
        family_id=family_id, member_id=member_id, user_id=user_id, notification_type=notification_type,
        title=title or notification_type.replace("_", " ").title(), message=message, link=link,
    ))


def jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if hasattr(value, "hex") and hasattr(value, "int"):  # UUID
        return str(value)
    if hasattr(value, "__table__"):
        return {c.name: jsonable(getattr(value, c.name)) for c in value.__table__.columns}
    try:
        return float(value) if type(value).__name__ == "Decimal" else value
    except Exception:
        return str(value)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
