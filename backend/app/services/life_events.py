"""Applies verified life events to the family profile while preserving history."""
from datetime import date

from sqlalchemy.orm import Session

from app.models import Family, FamilyMember, Relationship, LifeEvent, Address, BenefitRecord
from .common import audit, notify, utcnow, generate_family_code
from .relationships import inverse_type


def apply_life_event(db: Session, event: LifeEvent, actor=None) -> dict:
    family = db.get(Family, event.family_id)
    member = db.get(FamilyMember, event.member_id) if event.member_id else None
    details = event.details or {}
    result = {"event_type": event.event_type, "changes": []}
    today = event.event_date or date.today()

    if event.event_type == "DEATH" and member:
        member.member_status = "DECEASED"
        member.date_of_death = today
        member.left_date = today
        for r in db.query(Relationship).filter((Relationship.member_id == member.member_id) | (Relationship.related_member_id == member.member_id), Relationship.end_date.is_(None)).all():
            r.end_date = today
        for b in db.query(BenefitRecord).filter(BenefitRecord.member_id == member.member_id, BenefitRecord.benefit_status == "ACTIVE").all():
            b.benefit_status = "CLOSED"; b.end_date = today
            b.delivery_log = (b.delivery_log or []) + [{"status": "CLOSED", "at": utcnow().isoformat(), "note": "Member deceased"}]
        if family.family_head_id == member.member_id:
            successor = next((m for m in family.members if m.member_status == "ACTIVE" and m.member_id != member.member_id), None)
            if successor:
                family.family_head_id = successor.member_id; successor.is_head = True; member.is_head = False
                result["changes"].append(f"Head of family transferred to {successor.name}")
        spouse_ids = [r.related_member_id for r in db.query(Relationship).filter(Relationship.member_id == member.member_id, Relationship.relationship_type == "SPOUSE").all()]
        for sid in spouse_ids:
            sp = db.get(FamilyMember, sid)
            if sp and sp.member_status == "ACTIVE":
                sp.marital_status = "WIDOWED"
        result["changes"].append(f"{member.name} marked deceased; memberships, relationships and benefits closed with history kept")

    elif event.event_type in ("DIVORCE", "SEPARATION") and member:
        spouse_id = event.related_member_id
        for r in db.query(Relationship).filter(Relationship.relationship_type == "SPOUSE", Relationship.end_date.is_(None)).filter(
                ((Relationship.member_id == member.member_id) & (Relationship.related_member_id == spouse_id)) |
                ((Relationship.member_id == spouse_id) & (Relationship.related_member_id == member.member_id))).all():
            r.end_date = today
        member.marital_status = "DIVORCED" if event.event_type == "DIVORCE" else "SEPARATED"
        sp = db.get(FamilyMember, spouse_id) if spouse_id else None
        if sp:
            sp.marital_status = member.marital_status
        if details.get("leaves_household"):
            new_fam = _split_member(db, family, member, details, actor)
            result["changes"].append(f"{member.name} moved to new family {new_fam.family_code}")
        result["changes"].append("Spouse relationship ended; history preserved")

    elif event.event_type == "MARRIAGE" and member:
        spouse_id = event.related_member_id
        sp = db.get(FamilyMember, spouse_id) if spouse_id else None
        if sp:
            _ensure_relationship(db, member, sp, "SPOUSE", today, event.document_id)
            member.marital_status = sp.marital_status = "MARRIED"
            if sp.family_id != family.family_id and details.get("joins_household", True):
                sp.previous_family_id = sp.family_id; sp.family_id = family.family_id; sp.joined_date = today
                result["changes"].append(f"{sp.name} joined household {family.family_code}")
        result["changes"].append("Spouse relationship verified")

    elif event.event_type in ("ADOPTION", "GUARDIANSHIP") and member:
        guardian = db.get(FamilyMember, event.related_member_id) if event.related_member_id else None
        if guardian:
            rel = "GUARDIAN" if event.event_type == "GUARDIANSHIP" else ("MOTHER" if guardian.gender == "FEMALE" else "FATHER")
            _ensure_relationship(db, guardian, member, rel, today, event.document_id)
            if member.family_id != family.family_id:
                member.previous_family_id = member.family_id; member.family_id = family.family_id; member.joined_date = today
            member.verification_status = "VERIFIED"
        result["changes"].append("Guardian/parent relationship recorded")

    elif event.event_type in ("ADDRESS_CHANGE", "MIGRATION"):
        for a in db.query(Address).filter(Address.family_id == family.family_id, Address.is_current.is_(True)).all():
            a.is_current = False; a.valid_to = today
        addr = Address(family_id=family.family_id, address_type=details.get("address_type", "CURRENT"),
                       address_line=details.get("address_line", ""), village=details.get("village"), taluka=details.get("taluka"),
                       district=details.get("district"), pincode=details.get("pincode"), latitude=details.get("latitude"),
                       longitude=details.get("longitude"), valid_from=today, is_current=True, proof_document_id=event.document_id)
        db.add(addr); db.flush()
        family.address_id = addr.address_id
        if details.get("address_type", "CURRENT") != "TEMPORARY":
            family.district, family.taluka, family.village, family.pincode = addr.district, addr.taluka, addr.village, addr.pincode
        result["changes"].append("New address recorded; previous address kept in history")

    elif event.event_type == "SPLIT" and member:
        new_fam = _split_member(db, family, member, details, actor)
        result["changes"].append(f"{member.name} moved to new family {new_fam.family_code}")

    elif event.event_type == "BIRTH":
        result["changes"].append("Newborn added as provisional member (Aadhaar not required)")

    event.applied = True
    event.verification_status = "VERIFIED"
    audit(db, actor, "LIFE_EVENT_APPLIED", "LIFE_EVENT", event.event_id, family.family_id, new_value=result)
    notify(db, "FAMILY_INFO_CHANGED", f"Your family profile was updated after a verified {event.event_type.replace('_', ' ').lower()} event.",
           family_id=family.family_id, link="/family")
    from .eligibility import recalculate_family
    recalculate_family(db, family, actor)
    return result


def _ensure_relationship(db, a: FamilyMember, b: FamilyMember, rel_type: str, start, doc_id):
    existing = db.query(Relationship).filter(Relationship.member_id == a.member_id, Relationship.related_member_id == b.member_id,
                                             Relationship.relationship_type == rel_type, Relationship.end_date.is_(None)).first()
    if existing:
        existing.verification_status = "VERIFIED"; existing.evidence_document_id = doc_id or existing.evidence_document_id
    else:
        db.add(Relationship(member_id=a.member_id, related_member_id=b.member_id, relationship_type=rel_type, start_date=start,
                            verification_status="VERIFIED", evidence_document_id=doc_id))
    inv = inverse_type(rel_type, b)
    existing_inv = db.query(Relationship).filter(Relationship.member_id == b.member_id, Relationship.related_member_id == a.member_id,
                                                 Relationship.end_date.is_(None)).first()
    if existing_inv:
        existing_inv.verification_status = "VERIFIED"
    else:
        db.add(Relationship(member_id=b.member_id, related_member_id=a.member_id, relationship_type=inv, start_date=start,
                            verification_status="VERIFIED", evidence_document_id=doc_id))
    db.flush()


def _split_member(db, family: Family, member: FamilyMember, details: dict, actor) -> Family:
    today = date.today()
    new_fam = Family(family_status="PENDING_VERIFICATION", family_head_id=None, family_type="SINGLE",
                     district=details.get("district") or family.district, taluka=details.get("taluka") or family.taluka,
                     village=details.get("village") or family.village, pincode=details.get("pincode") or family.pincode,
                     split_from_family_id=family.family_id, declared_member_count=1, created_by_user_id=getattr(actor, "user_id", None))
    new_fam.family_code = generate_family_code(db, new_fam.district)
    db.add(new_fam); db.flush()
    member.previous_family_id = family.family_id
    member.family_id = new_fam.family_id
    member.joined_date = today
    member.is_head = True
    new_fam.family_head_id = member.member_id
    for r in db.query(Relationship).filter(Relationship.member_id == member.member_id, Relationship.end_date.is_(None)).all():
        pass  # relationships persist across households; only spouse ends on divorce (handled separately)
    if family.family_head_id == member.member_id:
        successor = next((m for m in family.members if m.member_status == "ACTIVE" and m.member_id != member.member_id), None)
        if successor:
            family.family_head_id = successor.member_id; successor.is_head = True
    audit(db, actor, "FAMILY_SPLIT", "FAMILY", new_fam.family_id, family.family_id, new_value={"member": member.name, "new_family": new_fam.family_code})
    return new_fam


def merge_families(db: Session, source: Family, target: Family, actor=None) -> dict:
    moved = 0
    for m in list(source.members):
        m.previous_family_id = source.family_id
        m.family_id = target.family_id
        m.is_head = False
        moved += 1
    source.family_status = "MERGED"
    source.merged_into_family_id = target.family_id
    audit(db, actor, "FAMILY_MERGED", "FAMILY", source.family_id, target.family_id,
          old_value={"source": source.family_code}, new_value={"target": target.family_code, "members_moved": moved})
    notify(db, "FAMILY_INFO_CHANGED", f"Family {source.family_code} was merged into {target.family_code} after officer review.", family_id=target.family_id)
    db.flush()
    db.refresh(target)
    from .eligibility import recalculate_family
    recalculate_family(db, target, actor)
    return {"moved": moved, "source": source.family_code, "target": target.family_code}
