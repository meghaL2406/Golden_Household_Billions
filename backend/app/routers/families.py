from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_officer
from app.models import (Family, FamilyMember, Relationship, Address, Document, ExternalRecord, LifeEvent,
                        VerificationCase, SchemeEligibility, BenefitApplication, BenefitRecord, User, Consent)
from app.schemas.inputs import FamilyCreate, FamilyUpdate, MemberIn, MemberUpdate, RelationshipIn, ConsentIn
from app.services.common import audit, notify, normalize_name, utcnow, age_on
from app.services.duplicates import find_duplicate_members, run_family_checks, open_case
from app.services.external import search_existing, lookup_source, fetch_for_member
from app.services.relationships import inverse_type
from app.services.eligibility import recalculate_family
from .deps import serialize, my_family, load_family, is_officer

router = APIRouter(prefix="/families", tags=["families"])


def _member_payload(m: FamilyMember) -> dict:
    d = serialize(m)
    d["age"] = age_on(m.date_of_birth)
    d["aadhaar_reference"] = ("XXXX-XXXX-" + m.aadhaar_last4) if m.aadhaar_last4 else None
    d["aadhaar_linked"] = bool(m.aadhaar_reference)
    return d


def family_detail(db: Session, fam: Family) -> dict:
    members = sorted(fam.members, key=lambda m: (not m.is_head, m.date_of_birth or date.max))
    ids = [m.member_id for m in members]
    rels = db.query(Relationship).filter(Relationship.member_id.in_(ids)).all() if ids else []
    docs = db.query(Document).filter((Document.family_id == fam.family_id) | (Document.member_id.in_(ids))).order_by(Document.created_at.desc()).all() if ids else []
    addresses = db.query(Address).filter(Address.family_id == fam.family_id).order_by(Address.is_current.desc(), Address.valid_from.desc()).all()
    ext = db.query(ExternalRecord).filter(ExternalRecord.family_id == fam.family_id).all()
    cases = db.query(VerificationCase).filter(VerificationCase.family_id == fam.family_id).order_by(VerificationCase.created_at.desc()).all()
    events = db.query(LifeEvent).filter(LifeEvent.family_id == fam.family_id).order_by(LifeEvent.created_at.desc()).all()
    names = {m.member_id: m.name for m in members}
    out = serialize(fam)
    out.update({
        "members": [_member_payload(m) for m in members],
        "relationships": [{**serialize(r), "member_name": names.get(r.member_id), "related_member_name": names.get(r.related_member_id)} for r in rels],
        "documents": serialize(docs), "addresses": serialize(addresses), "external_records": serialize(ext),
        "verification_cases": serialize(cases), "life_events": serialize(events),
        "active_member_count": sum(1 for m in members if m.member_status in ("ACTIVE", "PROVISIONAL")),
        "completeness": _completeness(fam, members, docs, rels),
    })
    return out


def _completeness(fam, members, docs, rels) -> dict:
    steps = [
        ("Head of family added", any(m.is_head for m in members)),
        ("All declared members added", fam.declared_member_count is None or sum(1 for m in members if m.member_status in ("ACTIVE", "PROVISIONAL")) >= fam.declared_member_count),
        ("Relationships recorded for every member", all(any(r.member_id == m.member_id for r in rels) for m in members if not m.is_head) if len(members) > 1 else True),
        ("Address proof uploaded", any(d.document_type == "ADDRESS_PROOF" for d in docs)),
        ("Submitted for verification", fam.family_status not in ("DRAFT",)),
        ("Family ID issued", fam.family_code is not None),
    ]
    return {"steps": [{"label": l, "done": bool(d)} for l, d in steps], "percent": int(100 * sum(1 for _, d in steps if d) / len(steps))}


@router.get("/search-existing")
def search_existing_records(mobile: str | None = None, aadhaar: str | None = None, name: str | None = None,
                            ration_card: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return search_existing(db, mobile=mobile, aadhaar=aadhaar, name=name, ration_card=ration_card)


@router.get("/mine")
def get_my_family(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = my_family(db, user)
    if fam is None:
        return None
    return family_detail(db, fam)


@router.post("", status_code=201)
def create_family(body: FamilyCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "CITIZEN" and my_family(db, user):
        raise HTTPException(400, "You are already a member of a family. Report a life event to split or update it.")
    head = body.head
    probe = head.model_dump()
    probe["village"] = body.address.village
    dups = find_duplicate_members(db, probe)
    blocking = [d for d in dups if d["level"] == "BLOCK"]
    if blocking and not head.force:
        raise HTTPException(409, {"message": "An existing family already contains this person. Do not create a second family; request to join or claim it.",
                                  "candidates": blocking})
    fam = Family(family_status="DRAFT", family_type=body.family_type, income_category=body.income_category,
                 annual_income=body.annual_income, ration_card_type=body.ration_card_type,
                 declared_member_count=body.declared_member_count, district=body.address.district, taluka=body.address.taluka,
                 village=body.address.village, pincode=body.address.pincode, created_by_user_id=user.user_id)
    db.add(fam); db.flush()
    addr = Address(family_id=fam.family_id, **body.address.model_dump())
    db.add(addr); db.flush()
    fam.address_id = addr.address_id
    member = _new_member(db, fam, head, user)
    member.is_head = True
    fam.family_head_id = member.member_id
    if user.role == "CITIZEN":
        user.member_id = member.member_id
        if not member.mobile_number and user.mobile:
            member.mobile_number = user.mobile
    # seed from Ration/PDS household if the citizen claimed one
    seeded = []
    if body.claim_ration_reference:
        for rec in lookup_source(db, "RATION_PDS", ration_card=body.claim_ration_reference):
            payload = rec.payload or {}
            db.add(ExternalRecord(family_id=fam.family_id, member_id=member.member_id, source_system="RATION_PDS", record_type="HOUSEHOLD",
                                  external_reference_id=rec.external_reference_id, fetched_data=payload, match_status="PARTIAL", last_verified_at=utcnow()))
            fam.ration_card_type = payload.get("card_type", fam.ration_card_type)
            seeded = payload.get("members", [])
    audit(db, user, "FAMILY_CREATED", "FAMILY", fam.family_id, fam.family_id, new_value={"declared_member_count": body.declared_member_count, "district": fam.district})
    notify(db, "FAMILY_CREATED", "Your family enrolment has started. Add the remaining members and submit for verification.", family_id=fam.family_id, user_id=user.user_id, link="/family")
    if dups:
        open_case(db, "DUPLICATE_PERSON", f"Head {member.name} resembles an existing member", family_id=fam.family_id, member_id=member.member_id,
                  related_family_id=dups[0]["family_id"], related_member_id=dups[0]["member_id"], evidence={"candidates": dups})
    db.commit(); db.refresh(fam)
    out = family_detail(db, fam)
    out["duplicate_warnings"] = dups
    out["ration_suggested_members"] = seeded
    return out


def _is_newborn_dob(dob: date | None) -> bool:
    """A declared infant under one year old: the only case where a member may be added without Aadhaar."""
    if dob is None:
        return False
    years = age_on(dob)
    return years is not None and 0 <= years < 1


def _new_member(db, fam: Family, body: MemberIn, user) -> FamilyMember:
    data = body.model_dump(exclude={"relationship_type", "related_member_id", "force"})
    aadhaar = data.pop("aadhaar_reference", None)
    if not aadhaar and not _is_newborn_dob(data.get("date_of_birth")):
        raise HTTPException(422, "Aadhaar number is required to add a member. Only a newborn under one year "
                                  "old may be added with a birth certificate instead; link the Aadhaar number later.")
    m = FamilyMember(family_id=fam.family_id, **data)
    m.name_normalized = normalize_name(m.name)
    if aadhaar:
        digits = "".join(ch for ch in aadhaar if ch.isdigit())
        m.aadhaar_reference = f"AAD-{hash_ref(digits)}"
        m.aadhaar_last4 = digits[-4:]
        m.identity_source = m.identity_source or "AADHAAR"
        m.verification_status = "PARTIAL"
    else:
        m.identity_source = m.identity_source or "MANUAL"
        m.verification_status = "UNVERIFIED"
    if m.date_of_birth and (age_on(m.date_of_birth) or 0) < 1 and not aadhaar:
        m.member_status = "PROVISIONAL"
        m.identity_source = "BIRTH_CERTIFICATE"
    db.add(m); db.flush()
    audit(db, user, "MEMBER_ADDED", "MEMBER", m.member_id, fam.family_id, new_value={"name": m.name, "aadhaar_linked": bool(aadhaar)})
    return m


def hash_ref(digits: str) -> str:
    import hashlib
    return hashlib.sha256(f"familyid:{digits}".encode()).hexdigest()[:24]


@router.get("")
def list_families(q: str | None = None, district: str | None = None, status: str | None = None, page: int = 1, size: int = 25,
                  db: Session = Depends(get_db), user: User = Depends(require_officer)):
    query = db.query(Family)
    if district:
        query = query.filter(Family.district == district)
    if status:
        query = query.filter(Family.family_status == status)
    if q:
        like = f"%{q}%"
        ids = [r[0] for r in db.query(FamilyMember.family_id).filter((FamilyMember.name.ilike(like)) | (FamilyMember.mobile_number == q) | (FamilyMember.aadhaar_last4 == q[-4:])).all()]
        query = query.filter((Family.family_code.ilike(like)) | (Family.family_id.in_(ids)))
    total = query.count()
    rows = query.order_by(Family.created_at.desc()).offset((page - 1) * size).limit(size).all()
    items = []
    for f in rows:
        d = serialize(f)
        head = next((m for m in f.members if m.is_head), None)
        d["head_name"] = head.name if head else None
        d["member_count"] = sum(1 for m in f.members if m.member_status in ("ACTIVE", "PROVISIONAL"))
        d["open_cases"] = db.query(VerificationCase).filter(VerificationCase.family_id == f.family_id, VerificationCase.case_status.in_(["OPEN", "ASSIGNED", "INFO_REQUESTED"])).count()
        items.append(d)
    return {"total": total, "items": items, "page": page, "size": size}


@router.get("/{family_id}")
def get_family(family_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = load_family(db, user, family_id)
    audit(db, user, "FAMILY_VIEWED", "FAMILY", fam.family_id, fam.family_id) if is_officer(user) else None
    db.commit()
    return family_detail(db, fam)


@router.patch("/{family_id}")
def update_family(family_id: UUID, body: FamilyUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = load_family(db, user, family_id)
    old = {k: getattr(fam, k) for k in body.model_dump(exclude_none=True)}
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(fam, k, v)
    audit(db, user, "DATA_MODIFIED", "FAMILY", fam.family_id, fam.family_id, old_value=old, new_value=body.model_dump(exclude_none=True))
    db.commit()
    return family_detail(db, fam)


# ------------------------------------------------------------------ members
@router.post("/{family_id}/members", status_code=201)
def add_member(family_id: UUID, body: MemberIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = load_family(db, user, family_id)
    if fam.family_status in ("MERGED", "INACTIVE"):
        raise HTTPException(400, "This family is closed")
    probe = body.model_dump(); probe["village"] = fam.village
    dups = find_duplicate_members(db, probe, exclude_family_id=fam.family_id)
    within = [m for m in fam.members if normalize_name(m.name) == normalize_name(body.name) and m.date_of_birth == body.date_of_birth]
    if within:
        raise HTTPException(409, {"message": f"{body.name} is already a member of this family.", "candidates": []})
    blocking = [d for d in dups if d["level"] == "BLOCK"]
    if blocking and not body.force:
        raise HTTPException(409, {"message": "This person already exists in another family. Adding them here would create a duplicate. Confirm to proceed under officer review.", "candidates": blocking})
    m = _new_member(db, fam, body, user)
    if body.relationship_type and body.related_member_id:
        related = db.get(FamilyMember, body.related_member_id)
        if related is None or related.family_id != fam.family_id:
            raise HTTPException(400, "Related member must belong to the same family")
        _add_relationship_pair(db, m, related, body.relationship_type, user)
    if dups and any(d["level"] != "LOW" for d in dups):
        m.verification_status = "FLAGGED"
        open_case(db, "DUPLICATE_PERSON", f"{m.name} resembles {dups[0]['name']} in family {dups[0]['family_code']}", family_id=fam.family_id,
                  member_id=m.member_id, related_family_id=dups[0]["family_id"], related_member_id=dups[0]["member_id"], evidence={"candidates": dups}, priority="HIGH")
        notify(db, "VERIFICATION_PENDING", f"{m.name} was added but needs officer review because a similar person already exists.", family_id=fam.family_id)
    if fam.family_status == "VERIFIED":
        fam.family_status = "PENDING_VERIFICATION"
        open_case(db, "FAMILY_VERIFICATION", f"New member {m.name} added to a verified family", family_id=fam.family_id, member_id=m.member_id)
    db.commit()
    out = _member_payload(m)
    out["duplicate_warnings"] = dups
    return out


def _add_relationship_pair(db, member: FamilyMember, related: FamilyMember, rel_type: str, user, evidence_document_id=None, start=None):
    rel_type = rel_type.upper()
    r1 = Relationship(member_id=member.member_id, related_member_id=related.member_id, relationship_type=rel_type, start_date=start,
                      evidence_document_id=evidence_document_id, verification_status="VERIFIED" if evidence_document_id else "UNVERIFIED")
    r2 = Relationship(member_id=related.member_id, related_member_id=member.member_id, relationship_type=inverse_type(rel_type, related),
                      start_date=start, evidence_document_id=evidence_document_id, verification_status=r1.verification_status)
    db.add_all([r1, r2]); db.flush()
    audit(db, user, "RELATIONSHIP_CHANGED", "RELATIONSHIP", r1.relationship_id, member.family_id,
          new_value={"member": member.name, "type": rel_type, "related": related.name})
    return r1


@router.patch("/{family_id}/members/{member_id}")
def update_member(family_id: UUID, member_id: UUID, body: MemberUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = load_family(db, user, family_id)
    m = db.get(FamilyMember, member_id)
    if m is None or m.family_id != fam.family_id:
        raise HTTPException(404, "Member not found")
    changes = body.model_dump(exclude_none=True)
    old = {k: getattr(m, k) for k in changes if k != "aadhaar_reference"}
    aadhaar = changes.pop("aadhaar_reference", None)
    for k, v in changes.items():
        setattr(m, k, v)
    if aadhaar:
        digits = "".join(ch for ch in aadhaar if ch.isdigit())
        ref = f"AAD-{hash_ref(digits)}"
        clash = db.query(FamilyMember).filter(FamilyMember.aadhaar_reference == ref, FamilyMember.member_id != m.member_id).first()
        if clash:
            open_case(db, "DUPLICATE_PERSON", f"Aadhaar linked to {m.name} is already linked to {clash.name}", family_id=fam.family_id, member_id=m.member_id,
                      related_family_id=clash.family_id, related_member_id=clash.member_id, priority="HIGH")
            m.verification_status = "FLAGGED"
        else:
            m.aadhaar_reference, m.aadhaar_last4 = ref, digits[-4:]
            if m.verification_status == "UNVERIFIED":
                m.verification_status = "PARTIAL"
            if m.member_status == "PROVISIONAL":
                m.member_status = "ACTIVE"
            changes["aadhaar_linked"] = True
    m.name_normalized = normalize_name(m.name)
    audit(db, user, "DATA_MODIFIED", "MEMBER", m.member_id, fam.family_id, old_value=old, new_value=changes)
    if fam.family_status == "VERIFIED" and any(k in changes for k in ("name", "date_of_birth", "gender", "aadhaar_linked")):
        m.verification_status = "PARTIAL" if m.verification_status != "FLAGGED" else m.verification_status
        open_case(db, "MANUAL_REVIEW", f"Identity details of {m.name} were changed after verification", family_id=fam.family_id, member_id=m.member_id, evidence={"changes": changes})
    db.commit(); db.refresh(fam)
    recalculate_family(db, fam, user); db.commit()
    return _member_payload(m)


@router.delete("/{family_id}/members/{member_id}")
def remove_member(family_id: UUID, member_id: UUID, reason: str = Query("Removed by citizen"), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = load_family(db, user, family_id)
    m = db.get(FamilyMember, member_id)
    if m is None or m.family_id != fam.family_id:
        raise HTTPException(404, "Member not found")
    if m.is_head:
        raise HTTPException(400, "The head of family cannot be removed. Report a life event instead.")
    if fam.family_status == "DRAFT":
        db.delete(m)
    else:
        m.member_status = "LEFT"; m.left_date = date.today()
        for r in db.query(Relationship).filter((Relationship.member_id == m.member_id) | (Relationship.related_member_id == m.member_id), Relationship.end_date.is_(None)).all():
            r.end_date = date.today()
    audit(db, user, "MEMBER_REMOVED", "MEMBER", member_id, fam.family_id, old_value={"name": m.name, "reason": reason})
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ relationships
@router.post("/{family_id}/relationships", status_code=201)
def add_relationship(family_id: UUID, body: RelationshipIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = load_family(db, user, family_id)
    a, b = db.get(FamilyMember, body.member_id), db.get(FamilyMember, body.related_member_id)
    if not a or not b or a.family_id != fam.family_id or b.family_id != fam.family_id:
        raise HTTPException(400, "Both members must belong to this family")
    if a.member_id == b.member_id:
        raise HTTPException(400, "A member cannot be related to themself")
    r = _add_relationship_pair(db, a, b, body.relationship_type, user, body.evidence_document_id, body.start_date)
    db.commit()
    return serialize(r)


@router.delete("/{family_id}/relationships/{relationship_id}")
def end_relationship(family_id: UUID, relationship_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = load_family(db, user, family_id)
    r = db.get(Relationship, relationship_id)
    if r is None:
        raise HTTPException(404, "Relationship not found")
    inv = db.query(Relationship).filter(Relationship.member_id == r.related_member_id, Relationship.related_member_id == r.member_id, Relationship.end_date.is_(None)).first()
    if fam.family_status == "DRAFT":
        db.delete(r)
        if inv: db.delete(inv)
    else:
        r.end_date = date.today()
        if inv: inv.end_date = date.today()
    audit(db, user, "RELATIONSHIP_CHANGED", "RELATIONSHIP", relationship_id, fam.family_id, old_value={"type": r.relationship_type, "ended": True})
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ consent + external
@router.post("/{family_id}/consents", status_code=201)
def grant_consent(family_id: UUID, body: ConsentIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = load_family(db, user, family_id)
    m = db.get(FamilyMember, body.member_id)
    if m is None or m.family_id != fam.family_id:
        raise HTTPException(404, "Member not found")
    c = Consent(member_id=m.member_id, user_id=user.user_id, data_source=body.data_source, purpose=body.purpose)
    db.add(c)
    audit(db, user, "CONSENT_GRANTED", "CONSENT", m.member_id, fam.family_id, new_value={"source": body.data_source})
    records = fetch_for_member(db, m, body.data_source, require_consent=False)
    db.commit()
    return {"consent": serialize(c), "records": serialize(records)}


@router.post("/{family_id}/members/{member_id}/fetch/{source}")
def fetch_external(family_id: UUID, member_id: UUID, source: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = load_family(db, user, family_id)
    m = db.get(FamilyMember, member_id)
    if m is None or m.family_id != fam.family_id:
        raise HTTPException(404, "Member not found")
    records = fetch_for_member(db, m, source.upper(), require_consent=not is_officer(user))
    if not records:
        db.commit()
        return {"records": [], "message": "No record found or consent not granted for this source."}
    for r in records:
        if r.match_status == "MATCHED" and m.verification_status in ("UNVERIFIED", "PARTIAL"):
            m.verification_status = "PARTIAL"
    audit(db, user, "EXTERNAL_RECORD_FETCHED", "MEMBER", m.member_id, fam.family_id, new_value={"source": source, "count": len(records)})
    db.commit()
    return {"records": serialize(records)}


# ------------------------------------------------------------------ submit / checks
@router.post("/{family_id}/run-checks")
def run_checks(family_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = load_family(db, user, family_id)
    cases = run_family_checks(db, fam)
    db.commit()
    return {"cases": serialize(cases), "duplicate_families": [c.evidence for c in cases if c.case_type == "DUPLICATE_FAMILY"]}


@router.post("/{family_id}/submit")
def submit_for_verification(family_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = load_family(db, user, family_id)
    if fam.family_status not in ("DRAFT", "REJECTED", "PENDING_VERIFICATION"):
        raise HTTPException(400, f"Family is already {fam.family_status.lower().replace('_', ' ')}")
    active = [m for m in fam.members if m.member_status in ("ACTIVE", "PROVISIONAL")]
    if not active:
        raise HTTPException(400, "Add at least one member before submitting")
    cases = run_family_checks(db, fam)
    fam.family_status = "PENDING_VERIFICATION"
    fam.verification_status = "PENDING"
    main = open_case(db, "FAMILY_VERIFICATION", "Family profile submitted for verification", family_id=fam.family_id,
                     evidence={"member_count": len(active), "conflicts": len(cases)}, priority="HIGH" if cases else "NORMAL")
    audit(db, user, "FAMILY_SUBMITTED", "FAMILY", fam.family_id, fam.family_id, new_value={"conflicts": len(cases)})
    notify(db, "VERIFICATION_PENDING", "Your family profile has been submitted. An officer will verify the records and documents.", family_id=fam.family_id, link="/family")
    recalculate_family(db, fam, user)
    db.commit()
    return {"family": family_detail(db, fam), "verification_case": serialize(main), "conflicts": serialize(cases)}
