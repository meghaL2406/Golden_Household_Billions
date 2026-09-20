"""Duplicate person / duplicate family detection.

Panel concern: one person enrolling twice under spelling variants ("Rajesh Kumar" / "Rakesh Kumar") or with
multiple Aadhaar references to draw benefits more than once. We therefore never rely on a single key. Each
candidate is scored across name similarity, date of birth, gender, parent/husband name, mobile, Aadhaar and
locality, and anything above the review threshold opens a verification case instead of being silently accepted.
"""
from datetime import date
from typing import Optional

from sqlalchemy import text, or_
from sqlalchemy.orm import Session

from app.models import Family, FamilyMember, VerificationCase
from .common import normalize_name, generate_number, jsonable

REVIEW_THRESHOLD = 0.62
BLOCK_THRESHOLD = 0.9


def _similarity(db: Session, a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return float(db.execute(text("select similarity(:a, :b)"), {"a": a, "b": b}).scalar() or 0.0)


def score_candidate(db: Session, probe: dict, cand: FamilyMember) -> tuple[float, list[str]]:
    reasons: list[str] = []
    score = 0.0
    name_sim = _similarity(db, normalize_name(probe.get("name", "")), cand.name_normalized or normalize_name(cand.name))
    if name_sim >= 0.85:
        score += 0.35; reasons.append(f"Name matches closely (similarity {name_sim:.2f})")
    elif name_sim >= 0.6:
        score += 0.22; reasons.append(f"Name is a probable spelling variant (similarity {name_sim:.2f})")
    dob: Optional[date] = probe.get("date_of_birth")
    if dob and cand.date_of_birth:
        if dob == cand.date_of_birth:
            score += 0.25; reasons.append("Date of birth is identical")
        elif abs((dob - cand.date_of_birth).days) <= 366:
            score += 0.08; reasons.append("Date of birth is within one year")
    if probe.get("gender") and cand.gender and probe["gender"] == cand.gender:
        score += 0.05
    fh = probe.get("father_or_husband_name")
    if fh and cand.father_or_husband_name:
        fh_sim = _similarity(db, normalize_name(fh), normalize_name(cand.father_or_husband_name))
        if fh_sim >= 0.7:
            score += 0.15; reasons.append("Father/husband name matches")
    if probe.get("mobile_number") and cand.mobile_number and probe["mobile_number"] == cand.mobile_number:
        score += 0.2; reasons.append("Same mobile number")
    if probe.get("aadhaar_reference") and cand.aadhaar_reference:
        if probe["aadhaar_reference"] == cand.aadhaar_reference:
            score += 0.5; reasons.append("Same Aadhaar reference")
        elif score >= 0.5:
            reasons.append("Different Aadhaar reference but same identity attributes: possible multiple-Aadhaar case")
    if probe.get("village") and cand.family and cand.family.village and probe["village"].lower() == cand.family.village.lower():
        score += 0.08; reasons.append("Same village")
    return min(score, 1.0), reasons


def find_duplicate_members(db: Session, probe: dict, exclude_family_id=None, limit: int = 10) -> list[dict]:
    norm = normalize_name(probe.get("name", ""))
    filters = []
    if norm:
        filters.append(text("similarity(name_normalized, :n) > 0.4").bindparams(n=norm))
    if probe.get("mobile_number"):
        filters.append(FamilyMember.mobile_number == probe["mobile_number"])
    if probe.get("aadhaar_reference"):
        filters.append(FamilyMember.aadhaar_reference == probe["aadhaar_reference"])
    if not filters:
        return []
    q = db.query(FamilyMember).filter(or_(*filters)).filter(FamilyMember.member_status != "DECEASED")
    if exclude_family_id:
        q = q.filter(FamilyMember.family_id != exclude_family_id)
    out = []
    for cand in q.limit(200).all():
        s, reasons = score_candidate(db, probe, cand)
        if s >= 0.35:
            out.append({
                "member_id": str(cand.member_id), "family_id": str(cand.family_id),
                "family_code": cand.family.family_code if cand.family else None,
                "name": cand.name, "date_of_birth": cand.date_of_birth.isoformat() if cand.date_of_birth else None, "gender": cand.gender,
                "district": cand.family.district if cand.family else None,
                "score": round(s, 2), "reasons": reasons,
                "level": "BLOCK" if s >= BLOCK_THRESHOLD else "REVIEW" if s >= REVIEW_THRESHOLD else "LOW",
            })
    out.sort(key=lambda x: -x["score"])
    return out[:limit]


def find_duplicate_families(db: Session, family: Family) -> list[dict]:
    """Families sharing head identity, address or several overlapping members."""
    hits: dict[str, dict] = {}
    for m in family.members:
        for d in find_duplicate_members(db, {
            "name": m.name, "date_of_birth": m.date_of_birth, "gender": m.gender,
            "father_or_husband_name": m.father_or_husband_name, "mobile_number": m.mobile_number,
            "aadhaar_reference": m.aadhaar_reference, "village": family.village,
        }, exclude_family_id=family.family_id):
            if d["level"] == "LOW":
                continue
            h = hits.setdefault(d["family_id"], {"family_id": d["family_id"], "family_code": d["family_code"],
                                                 "district": d["district"], "overlaps": [], "score": 0})
            h["overlaps"].append({"our_member": m.name, "their_member": d["name"], "score": d["score"], "reasons": d["reasons"]})
            h["score"] = max(h["score"], d["score"])
    result = list(hits.values())
    for h in result:
        if len(h["overlaps"]) >= 2:
            h["score"] = min(1.0, h["score"] + 0.1 * (len(h["overlaps"]) - 1))
        h["level"] = "BLOCK" if h["score"] >= BLOCK_THRESHOLD else "REVIEW"
    result.sort(key=lambda x: -x["score"])
    return result


def open_case(db: Session, case_type: str, reason: str, family_id=None, member_id=None, evidence=None,
              related_family_id=None, related_member_id=None, priority="NORMAL", life_event_id=None) -> VerificationCase:
    existing = db.query(VerificationCase).filter(
        VerificationCase.case_type == case_type, VerificationCase.family_id == family_id,
        VerificationCase.member_id == member_id, VerificationCase.case_status.in_(["OPEN", "ASSIGNED", "INFO_REQUESTED"]),
    ).first()
    # jsonable() makes evidence safe for the JSONB column: raw UUIDs, dates and Decimals from service code
    # would otherwise crash the insert (PostgreSQL's json encoder only accepts plain JSON-compatible types).
    safe_evidence = jsonable(evidence) if evidence else evidence
    if existing and life_event_id is None:
        existing.evidence = safe_evidence or existing.evidence
        return existing
    case = VerificationCase(
        case_number=generate_number(db, "VC"), case_type=case_type, reason=reason, family_id=family_id, member_id=member_id,
        evidence=safe_evidence or {}, related_family_id=related_family_id, related_member_id=related_member_id,
        priority=priority, life_event_id=life_event_id,
    )
    db.add(case)
    db.flush()
    return case


def run_family_checks(db: Session, family: Family) -> list[VerificationCase]:
    """Run all automatic checks on a family and open verification cases for conflicts. Returns opened cases."""
    from .external import compare_with_external
    cases: list[VerificationCase] = []
    # 1. duplicate family
    for dup in find_duplicate_families(db, family):
        cases.append(open_case(db, "DUPLICATE_FAMILY", f"Possible duplicate of family {dup['family_code']}",
                               family_id=family.family_id, related_family_id=dup["family_id"], evidence=dup,
                               priority="HIGH" if dup["level"] == "BLOCK" else "NORMAL"))
    # 2. duplicate persons (within other families) and Aadhaar mismatches
    for m in family.members:
        dups = [d for d in find_duplicate_members(db, {
            "name": m.name, "date_of_birth": m.date_of_birth, "gender": m.gender,
            "father_or_husband_name": m.father_or_husband_name, "mobile_number": m.mobile_number,
            "aadhaar_reference": m.aadhaar_reference, "village": family.village,
        }, exclude_family_id=family.family_id) if d["level"] != "LOW"]
        if dups:
            m.verification_status = "FLAGGED"
            cases.append(open_case(db, "DUPLICATE_PERSON", f"{m.name} may already exist as {dups[0]['name']} in {dups[0]['family_code']}",
                                   family_id=family.family_id, member_id=m.member_id,
                                   related_family_id=dups[0]["family_id"], related_member_id=dups[0]["member_id"],
                                   evidence={"candidates": dups}, priority="HIGH"))
        mismatch = compare_with_external(db, m)
        if mismatch:
            cases.append(open_case(db, "AADHAAR_MISMATCH", mismatch["reason"], family_id=family.family_id,
                                   member_id=m.member_id, evidence=mismatch))
    # 3. relationship sanity
    from .relationships import relationship_conflicts
    for conflict in relationship_conflicts(db, family):
        cases.append(open_case(db, "RELATIONSHIP_MISMATCH", conflict["reason"], family_id=family.family_id,
                               member_id=conflict.get("member_id"), evidence=conflict))
    # 4. declared vs actual member count
    active = [m for m in family.members if m.member_status in ("ACTIVE", "PROVISIONAL")]
    if family.declared_member_count and family.declared_member_count != len(active):
        cases.append(open_case(db, "MANUAL_REVIEW",
                               f"Declared {family.declared_member_count} members but {len(active)} were added",
                               family_id=family.family_id, evidence={"declared": family.declared_member_count, "added": len(active)}))
    return cases
