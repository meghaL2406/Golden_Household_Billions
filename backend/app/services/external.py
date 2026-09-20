"""Mock integration with external government source systems.

The platform stores *references* to external records plus the fetched snapshot. It never pretends to own the
source database. `MockSourceRecord` simulates Aadhaar demographic, Ration/PDS and Civil Registration lookups.
"""
from sqlalchemy import cast, String
from sqlalchemy.orm import Session

from app.models import ExternalRecord, FamilyMember, MockSourceRecord, Consent
from .common import normalize_name, utcnow


def lookup_source(db: Session, source_system: str, **keys) -> list[MockSourceRecord]:
    q = db.query(MockSourceRecord).filter(MockSourceRecord.source_system == source_system)
    results = []
    for rec in q.all():
        lk = rec.lookup_keys or {}
        for k, v in keys.items():
            if v and str(lk.get(k, "")).lower() == str(v).lower():
                results.append(rec)
                break
    return results


def has_consent(db: Session, member_id, data_source: str) -> bool:
    return db.query(Consent).filter(Consent.member_id == member_id, Consent.data_source == data_source,
                                    Consent.consent_status == "GRANTED").first() is not None


def fetch_for_member(db: Session, member: FamilyMember, source_system: str, require_consent: bool = True) -> list[ExternalRecord]:
    if require_consent and not has_consent(db, member.member_id, source_system):
        return []
    hits = lookup_source(db, source_system, mobile=member.mobile_number, aadhaar=member.aadhaar_reference,
                         name=member.name)
    out = []
    for hit in hits:
        payload = hit.payload or {}
        match, score = _match(member, payload)
        rec = db.query(ExternalRecord).filter(ExternalRecord.member_id == member.member_id,
                                              ExternalRecord.source_system == source_system,
                                              ExternalRecord.external_reference_id == hit.external_reference_id).first()
        if rec is None:
            rec = ExternalRecord(member_id=member.member_id, family_id=member.family_id, source_system=source_system,
                                 record_type=payload.get("record_type", source_system), external_reference_id=hit.external_reference_id)
            db.add(rec)
        rec.fetched_data = payload
        rec.match_status = match
        rec.match_score = score
        rec.last_verified_at = utcnow()
        out.append(rec)
    db.flush()
    return out


def _match(member: FamilyMember, payload: dict) -> tuple[str, float]:
    points, total = 0.0, 0.0
    if payload.get("name"):
        total += 1
        a, b = normalize_name(payload["name"]), normalize_name(member.name)
        points += 1 if a == b else 0.5 if (a in b or b in a) else 0
    if payload.get("date_of_birth") and member.date_of_birth:
        total += 1
        points += 1 if str(member.date_of_birth) == payload["date_of_birth"] else 0
    if payload.get("gender") and member.gender:
        total += 0.5
        points += 0.5 if payload["gender"] == member.gender else 0
    if total == 0:
        return "UNMATCHED", 0
    score = round(points / total * 100, 2)
    return ("MATCHED" if score >= 90 else "PARTIAL" if score >= 60 else "MISMATCH"), score


def compare_with_external(db: Session, member: FamilyMember) -> dict | None:
    rec = db.query(ExternalRecord).filter(ExternalRecord.member_id == member.member_id,
                                          ExternalRecord.match_status == "MISMATCH").first()
    if rec is None:
        return None
    return {"reason": f"{member.name}: details differ from {rec.source_system} record {rec.external_reference_id}",
            "source_system": rec.source_system, "external_reference_id": rec.external_reference_id,
            "fetched": rec.fetched_data, "entered": {"name": member.name, "date_of_birth": str(member.date_of_birth), "gender": member.gender}}


def search_existing(db: Session, mobile: str | None = None, aadhaar: str | None = None, name: str | None = None,
                    ration_card: str | None = None) -> dict:
    """Used at enrolment start: is there an existing Family ID, or an existing Ration/PDS household we can seed from?"""
    from .duplicates import find_duplicate_members
    families = find_duplicate_members(db, {"name": name or "", "mobile_number": mobile, "aadhaar_reference": aadhaar}) if (name or mobile or aadhaar) else []
    ration = []
    for rec in lookup_source(db, "RATION_PDS", mobile=mobile, aadhaar=aadhaar, ration_card=ration_card):
        ration.append({"external_reference_id": rec.external_reference_id, **(rec.payload or {})})
    return {"existing_members": families, "ration_records": ration}
