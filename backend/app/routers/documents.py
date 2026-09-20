from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_officer
from app.models import Document, Family, FamilyMember, Relationship, User
from app.services.common import audit, notify
from app.services.eligibility import recalculate_family
from app.services.storage import store_file
from .deps import serialize, my_family, load_family, is_officer

router = APIRouter(prefix="/documents", tags=["documents"])

DOCUMENT_TYPES = (
    "BIRTH_CERTIFICATE", "MARRIAGE_CERTIFICATE", "DEATH_CERTIFICATE", "INCOME_CERTIFICATE", "ADDRESS_PROOF",
    "DISABILITY_CERTIFICATE", "RATION_CARD", "EDUCATION_RECORD", "COURT_ORDER", "ADOPTION_ORDER", "CASTE_CERTIFICATE",
    "BANK_PASSBOOK", "OTHER",
)


def _load_document(db: Session, user: User, document_id) -> Document:
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    if user.role == "CITIZEN":
        mine = my_family(db, user)
        owner_family_id = doc.family_id
        if owner_family_id is None and doc.member_id:
            m = db.get(FamilyMember, doc.member_id)
            owner_family_id = m.family_id if m else None
        if mine is None or owner_family_id != mine.family_id:
            raise HTTPException(403, "You can only access documents of your own family")
    return doc


@router.post("", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    owner_type: str = Form(...),
    family_id: UUID = Form(...),
    document_type: str = Form(...),
    member_id: Optional[UUID] = Form(None),
    document_reference: Optional[str] = Form(None),
    issuing_authority: Optional[str] = Form(None),
    issue_date: Optional[date] = Form(None),
    expiry_date: Optional[date] = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    owner_type = owner_type.upper()
    document_type = document_type.upper()
    if owner_type not in ("MEMBER", "FAMILY"):
        raise HTTPException(400, "owner_type must be MEMBER or FAMILY")
    if document_type not in DOCUMENT_TYPES:
        raise HTTPException(400, f"Unknown document type. Allowed types: {', '.join(DOCUMENT_TYPES)}")
    fam = load_family(db, user, family_id)
    if fam.family_status in ("MERGED", "INACTIVE"):
        raise HTTPException(400, "This family is closed and cannot receive new documents")
    member = None
    if owner_type == "MEMBER":
        if member_id is None:
            raise HTTPException(400, "member_id is required when owner_type is MEMBER")
        member = db.get(FamilyMember, member_id)
        if member is None or member.family_id != fam.family_id:
            raise HTTPException(404, "Member not found in this family")
    elif member_id is not None:
        member = db.get(FamilyMember, member_id)
        if member is None or member.family_id != fam.family_id:
            raise HTTPException(404, "Member not found in this family")
    if not file.filename:
        raise HTTPException(400, "A file is required")

    stored = await store_file(file, f"family/{fam.family_id}")
    doc = Document(
        owner_type=owner_type, family_id=fam.family_id, member_id=member.member_id if member else None,
        document_type=document_type, document_reference=document_reference, issuing_authority=issuing_authority,
        issue_date=issue_date, expiry_date=expiry_date, verification_status="PENDING",
        file_name=file.filename, mime_type=file.content_type or "application/octet-stream",
        uploaded_by_user_id=user.user_id, **stored,
    )
    db.add(doc); db.flush()
    audit(db, user, "DOCUMENT_UPLOADED", "DOCUMENT", doc.document_id, fam.family_id,
          new_value={"document_type": document_type, "owner_type": owner_type, "file_name": doc.file_name,
                     "member": member.name if member else None})
    recalculate_family(db, fam, user)
    db.commit()
    return serialize(doc)


@router.get("")
def list_documents(family_id: Optional[UUID] = None, member_id: Optional[UUID] = None, status: Optional[str] = None,
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "CITIZEN":
        mine = my_family(db, user)
        if mine is None:
            return []
        if family_id is not None and family_id != mine.family_id:
            raise HTTPException(403, "You can only list documents of your own family")
        family_id = mine.family_id
    query = db.query(Document)
    if family_id is not None:
        member_ids = [r[0] for r in db.query(FamilyMember.member_id).filter(FamilyMember.family_id == family_id).all()]
        cond = Document.family_id == family_id
        if member_ids:
            cond = cond | Document.member_id.in_(member_ids)
        query = query.filter(cond)
    if member_id is not None:
        query = query.filter(Document.member_id == member_id)
    if status:
        query = query.filter(Document.verification_status == status.upper())
    return serialize(query.order_by(Document.created_at.desc()).all())


@router.get("/{document_id}")
def get_document(document_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return serialize(_load_document(db, user, document_id))


@router.post("/{document_id}/verify")
def verify_document(document_id: UUID, body: dict, db: Session = Depends(get_db), user: User = Depends(require_officer)):
    status = str(body.get("status", "")).upper()
    remarks = body.get("remarks")
    if status not in ("VERIFIED", "REJECTED"):
        raise HTTPException(400, "status must be VERIFIED or REJECTED")
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    old_status = doc.verification_status
    doc.verification_status = status
    doc.verified_by_user_id = user.user_id
    doc.remarks = remarks
    fam = db.get(Family, doc.family_id) if doc.family_id else None
    member = db.get(FamilyMember, doc.member_id) if doc.member_id else None
    if fam is None and member is not None:
        fam = db.get(Family, member.family_id)

    if status == "VERIFIED":
        for rel in db.query(Relationship).filter(Relationship.evidence_document_id == doc.document_id).all():
            rel.verification_status = "VERIFIED"
        if member is not None and doc.document_type == "BIRTH_CERTIFICATE" and member.member_status == "PROVISIONAL" \
                and member.verification_status in ("UNVERIFIED", "PARTIAL"):
            member.verification_status = "VERIFIED"
        audit(db, user, "DOCUMENT_VERIFIED", "DOCUMENT", doc.document_id, fam.family_id if fam else None,
              old_value={"status": old_status}, new_value={"status": status, "remarks": remarks})
        if fam is not None:
            notify(db, "VERIFICATION_COMPLETED",
                   f"Your {doc.document_type.replace('_', ' ').lower()} has been verified by an officer.",
                   family_id=fam.family_id, member_id=doc.member_id, link="/documents")
    else:
        audit(db, user, "DOCUMENT_REJECTED", "DOCUMENT", doc.document_id, fam.family_id if fam else None,
              old_value={"status": old_status}, new_value={"status": status, "remarks": remarks})
        if fam is not None:
            reason = f" Reason: {remarks}" if remarks else ""
            notify(db, "DOCUMENT_REQUIRED",
                   f"Your {doc.document_type.replace('_', ' ').lower()} was rejected. Please upload a clear, valid copy.{reason}",
                   family_id=fam.family_id, member_id=doc.member_id, link="/documents")
    if fam is not None:
        recalculate_family(db, fam, user)
    db.commit()
    return serialize(doc)


@router.delete("/{document_id}")
def delete_document(document_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = _load_document(db, user, document_id)
    if doc.verification_status != "PENDING" and not is_officer(user):
        raise HTTPException(400, "Only documents that are still pending verification can be deleted")
    family_id = doc.family_id
    if family_id is None and doc.member_id:
        m = db.get(FamilyMember, doc.member_id)
        family_id = m.family_id if m else None
    audit(db, user, "DOCUMENT_DELETED", "DOCUMENT", doc.document_id, family_id,
          old_value={"document_type": doc.document_type, "file_name": doc.file_name})
    db.delete(doc)
    db.flush()
    fam = db.get(Family, family_id) if family_id else None
    if fam is not None:
        recalculate_family(db, fam, user)
    db.commit()
    return {"ok": True}
