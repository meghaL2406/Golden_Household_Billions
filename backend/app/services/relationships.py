from sqlalchemy.orm import Session

from app.models import Family, Relationship, FamilyMember
from .common import age_on

INVERSE = {
    "SPOUSE": "SPOUSE", "FATHER": None, "MOTHER": None, "SON": None, "DAUGHTER": None,
    "BROTHER": None, "SISTER": None, "GUARDIAN": "WARD", "WARD": "GUARDIAN",
    "GRANDFATHER": None, "GRANDMOTHER": None, "OTHER": "OTHER",
}
PARENT_TYPES = ("FATHER", "MOTHER")
CHILD_TYPES = ("SON", "DAUGHTER")


def inverse_type(rel_type: str, related: FamilyMember) -> str:
    if rel_type in PARENT_TYPES:  # member is FATHER of related -> related is SON/DAUGHTER of member
        return "DAUGHTER" if related.gender == "FEMALE" else "SON"
    if rel_type in CHILD_TYPES:
        return "MOTHER" if related.gender == "FEMALE" else "FATHER"
    if rel_type in ("BROTHER", "SISTER"):
        return "SISTER" if related.gender == "FEMALE" else "BROTHER"
    if rel_type in ("GRANDFATHER", "GRANDMOTHER"):
        return "GRANDDAUGHTER" if related.gender == "FEMALE" else "GRANDSON"
    return INVERSE.get(rel_type) or "OTHER"


def relationship_conflicts(db: Session, family: Family) -> list[dict]:
    """Detect impossible relationships: parent younger than child, two living spouses, self-relations."""
    out = []
    members = {m.member_id: m for m in family.members}
    rels = db.query(Relationship).filter(Relationship.member_id.in_(list(members.keys())), Relationship.end_date.is_(None)).all()
    spouse_count: dict = {}
    for r in rels:
        a, b = members.get(r.member_id), members.get(r.related_member_id)
        if not a or not b:
            continue
        if a.member_id == b.member_id:
            out.append({"reason": f"{a.name} is related to themself", "member_id": str(a.member_id)})
        if r.relationship_type in PARENT_TYPES and a.date_of_birth and b.date_of_birth:
            gap = age_on(a.date_of_birth, b.date_of_birth)
            if gap is not None and gap < 12:
                out.append({"reason": f"{a.name} is recorded as {r.relationship_type.lower()} of {b.name} but is only {gap} years older",
                            "member_id": str(a.member_id), "relationship_id": str(r.relationship_id)})
        if r.relationship_type == "SPOUSE":
            spouse_count[a.member_id] = spouse_count.get(a.member_id, 0) + 1
            if a.date_of_birth and (age_on(a.date_of_birth) or 99) < 18:
                out.append({"reason": f"{a.name} is recorded as a spouse but is under 18", "member_id": str(a.member_id)})
    for mid, n in spouse_count.items():
        if n > 1:
            out.append({"reason": f"{members[mid].name} has {n} active spouse relationships", "member_id": str(mid)})
    return out
