"""Rule-based scheme eligibility engine.

A scheme's `eligibility_rules` is a JSON list of conditions:
    {"field": "age", "op": ">=", "value": 60, "label": "Age 60 or above"}
Supported fields are built from the member and family context (see `build_context`). Supported ops:
    == != > >= < <= in not_in contains exists is_true is_false between
`required_documents` lists document_type codes that must be present and verified on the member or family.
`exclusive_with` lists scheme codes; an active benefit under any of them blocks eligibility.

Outputs one of ELIGIBLE, NOT_ELIGIBLE, NEEDS_DOCUMENT, UNDER_REVIEW with human-readable reasons.
"""
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.models import Family, FamilyMember, Scheme, SchemeEligibility, Document, BenefitRecord
from .common import age_on, utcnow

FIELD_LABELS = {
    "age": "Age", "gender": "Gender", "annual_income": "Annual family income", "income_category": "Income category",
    "district": "District", "taluka": "Taluka", "village": "Village", "family_size": "Family size",
    "disability_percentage": "Disability percentage", "disability_type": "Disability type", "is_student": "Student status",
    "education_level": "Education level", "occupation": "Occupation", "marital_status": "Marital status",
    "member_status": "Member status", "is_pregnant_or_lactating": "Pregnant or lactating", "ration_card_type": "Ration card type",
    "family_type": "Family type", "has_house": "Owns a house", "bank_linked": "Bank account linked",
    "is_head": "Head of family", "children_count": "Number of children", "seniors_count": "Senior members",
    "is_widow": "Widow status", "family_verified": "Family verified", "member_verified": "Member identity verified",
}


def build_context(db: Session, family: Family, member: FamilyMember | None) -> dict[str, Any]:
    active = [m for m in family.members if m.member_status in ("ACTIVE", "PROVISIONAL")]
    ctx: dict[str, Any] = {
        "annual_income": float(family.annual_income) if family.annual_income is not None else None,
        "income_category": family.income_category, "district": family.district, "taluka": family.taluka,
        "village": family.village, "family_size": len(active), "ration_card_type": family.ration_card_type,
        "family_type": family.family_type, "family_verified": family.family_status == "VERIFIED",
        "children_count": sum(1 for m in active if (age_on(m.date_of_birth) or 99) < 18),
        "seniors_count": sum(1 for m in active if (age_on(m.date_of_birth) or 0) >= 60),
        "has_house": bool((family.notes or "").lower().find("owns house") >= 0),
    }
    if member is not None:
        ctx.update({
            "age": age_on(member.date_of_birth), "gender": member.gender,
            "disability_percentage": member.disability_percentage or 0, "disability_type": member.disability_type,
            "is_student": bool(member.is_student), "education_level": member.education_level, "occupation": member.occupation,
            "marital_status": member.marital_status, "member_status": member.member_status,
            "is_pregnant_or_lactating": bool(member.is_pregnant_or_lactating), "bank_linked": bool(member.bank_linked),
            "is_head": bool(member.is_head), "is_widow": member.marital_status == "WIDOWED",
            "member_verified": member.verification_status == "VERIFIED",
        })
        if member.annual_income is not None and ctx["annual_income"] is None:
            ctx["annual_income"] = float(member.annual_income)
    return ctx


def _cmp(op: str, actual: Any, expected: Any) -> bool | None:
    if op == "exists":
        return actual is not None and actual != ""
    if op == "is_true":
        return bool(actual)
    if op == "is_false":
        return not bool(actual)
    if actual is None:
        return None  # unknown -> cannot decide
    try:
        if op == "==":
            return str(actual).lower() == str(expected).lower() if isinstance(expected, str) else actual == expected
        if op == "!=":
            return not (str(actual).lower() == str(expected).lower() if isinstance(expected, str) else actual == expected)
        if op == ">":
            return float(actual) > float(expected)
        if op == ">=":
            return float(actual) >= float(expected)
        if op == "<":
            return float(actual) < float(expected)
        if op == "<=":
            return float(actual) <= float(expected)
        if op == "between":
            return float(expected[0]) <= float(actual) <= float(expected[1])
        if op == "in":
            return str(actual).lower() in [str(e).lower() for e in expected]
        if op == "not_in":
            return str(actual).lower() not in [str(e).lower() for e in expected]
        if op == "contains":
            return str(expected).lower() in str(actual).lower()
    except (TypeError, ValueError):
        return None
    return None


def _describe(rule: dict, actual: Any, ok: bool | None) -> str:
    label = rule.get("label") or f"{FIELD_LABELS.get(rule['field'], rule['field'])} {rule['op']} {rule.get('value')}"
    shown = "not recorded" if actual is None else actual
    if ok is None:
        return f"{label}: information missing ({FIELD_LABELS.get(rule['field'], rule['field'])} is not recorded)"
    return f"{label}: {'met' if ok else 'not met'} (recorded value {shown})"


def evaluate(db: Session, scheme: Scheme, family: Family, member: FamilyMember | None) -> dict:
    ctx = build_context(db, family, member)
    reasons, failed, unknown = [], [], []
    for rule in scheme.eligibility_rules or []:
        actual = ctx.get(rule["field"])
        ok = _cmp(rule["op"], actual, rule.get("value"))
        reasons.append({"rule": rule, "actual": actual, "result": "MET" if ok else "UNKNOWN" if ok is None else "NOT_MET",
                        "text": _describe(rule, actual, ok)})
        if ok is None:
            unknown.append(rule)
        elif not ok:
            failed.append(rule)
    # documents
    owner_filters = [Document.family_id == family.family_id]
    if member is not None:
        owner_filters.append(Document.member_id == member.member_id)
    from sqlalchemy import or_
    docs = db.query(Document).filter(or_(*owner_filters)).all()
    have = {d.document_type for d in docs if d.verification_status != "REJECTED"}
    verified = {d.document_type for d in docs if d.verification_status == "VERIFIED"}
    missing = [d for d in (scheme.required_documents or []) if d not in have]
    unverified = [d for d in (scheme.required_documents or []) if d in have and d not in verified]
    # existing benefits / exclusivity
    active_benefits = db.query(BenefitRecord).filter(BenefitRecord.family_id == family.family_id,
                                                     BenefitRecord.benefit_status == "ACTIVE").all()
    scheme_ids = {b.scheme_id for b in active_benefits}
    already = scheme.scheme_id in scheme_ids and (member is None or any(b.member_id == member.member_id for b in active_benefits if b.scheme_id == scheme.scheme_id))
    exclusive_hit = None
    if scheme.exclusive_with:
        codes = {s.scheme_code: s for s in db.query(Scheme).filter(Scheme.scheme_id.in_(list(scheme_ids))).all()}
        for code in scheme.exclusive_with:
            if code in codes:
                exclusive_hit = codes[code].scheme_name
                break

    if already:
        status, summary = "NOT_ELIGIBLE", f"Not eligible because this benefit is already active for {'this member' if member else 'this family'}."
    elif exclusive_hit:
        status, summary = "NOT_ELIGIBLE", f"Not eligible because the family already receives {exclusive_hit}, which cannot be combined with this scheme."
    elif failed:
        status = "NOT_ELIGIBLE"
        summary = "Not eligible because " + "; ".join(_describe(r, ctx.get(r["field"]), False).split(":")[0].lower() + " is not met" for r in failed) + "."
    elif unknown:
        status = "UNDER_REVIEW"
        summary = "Under review because " + ", ".join(FIELD_LABELS.get(r["field"], r["field"]).lower() for r in unknown) + " is not yet recorded."
    elif missing:
        status = "NEEDS_DOCUMENT"
        summary = "Missing document: " + ", ".join(d.replace("_", " ").title() for d in missing) + "."
    elif unverified:
        status = "UNDER_REVIEW"
        summary = "Under review because " + ", ".join(d.replace("_", " ").title() for d in unverified) + " is awaiting officer verification."
    elif family.family_status != "VERIFIED":
        status = "UNDER_REVIEW"
        summary = "Eligible on record; the family profile is awaiting verification before benefits can be applied for."
    else:
        status = "ELIGIBLE"
        met = [r.get("label") or FIELD_LABELS.get(r["field"], r["field"]) for r in (scheme.eligibility_rules or [])]
        summary = "Eligible because " + (", ".join(met).lower() if met else "the scheme has no restricting conditions") + "."
    return {"status": status, "summary": summary, "reasons": reasons, "missing_documents": missing,
            "unverified_documents": unverified, "context": ctx}


def recalculate_family(db: Session, family: Family, actor=None) -> list[SchemeEligibility]:
    from .common import audit, notify
    previous = {(e.scheme_id, e.member_id): e.eligibility_status for e in
                db.query(SchemeEligibility).filter(SchemeEligibility.family_id == family.family_id).all()}
    db.query(SchemeEligibility).filter(SchemeEligibility.family_id == family.family_id).delete()
    schemes = db.query(Scheme).filter(Scheme.status == "ACTIVE").all()
    out: list[SchemeEligibility] = []
    active_members = [m for m in family.members if m.member_status in ("ACTIVE", "PROVISIONAL")]
    for scheme in schemes:
        targets = [None] if scheme.target_type == "FAMILY" else active_members
        for member in targets:
            res = evaluate(db, scheme, family, member)
            row = SchemeEligibility(
                scheme_id=scheme.scheme_id, family_id=family.family_id, member_id=member.member_id if member else None,
                eligibility_status=res["status"], eligibility_reason=res["summary"], reasons=res["reasons"],
                missing_requirement=res["missing_documents"] + [f"VERIFY:{d}" for d in res["unverified_documents"]],
                checked_at=utcnow(),
            )
            db.add(row)
            out.append(row)
            key = (scheme.scheme_id, member.member_id if member else None)
            if res["status"] == "ELIGIBLE" and previous.get(key) != "ELIGIBLE":
                who = f" for {member.name}" if member else ""
                notify(db, "NEW_SCHEME_AVAILABLE", f"Your family is now eligible for {scheme.scheme_name}{who}.",
                       title="New scheme available", family_id=family.family_id, link="/schemes")
    audit(db, actor, "ELIGIBILITY_CALCULATED", "FAMILY", family.family_id, family.family_id,
          new_value={"schemes_checked": len(schemes), "eligible": sum(1 for r in out if r.eligibility_status == "ELIGIBLE")})
    db.flush()
    return out
