import uuid
from datetime import datetime, date, timezone

from sqlalchemy import (
    Column, String, Text, Date, DateTime, Integer, Numeric, Boolean, ForeignKey, Index, JSON,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def uid() -> uuid.UUID:
    return uuid.uuid4()


def PK():
    return Column(UUID(as_uuid=True), primary_key=True, default=uid)


def FK(target, nullable=True, ondelete=None):
    return Column(UUID(as_uuid=True), ForeignKey(target, ondelete=ondelete), nullable=nullable, index=True)


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)


# ---------------------------------------------------------------- identity / users
class User(Base, TimestampMixin):
    __tablename__ = "app_user"
    user_id = PK()
    name = Column(String(160), nullable=False)
    mobile = Column(String(15), unique=True, nullable=True, index=True)
    email = Column(String(200), unique=True, nullable=True, index=True)
    role = Column(String(32), nullable=False, default="CITIZEN")
    department = Column(String(120))
    district = Column(String(80))
    status = Column(String(20), nullable=False, default="ACTIVE")
    member_id = Column(UUID(as_uuid=True), nullable=True)  # linked citizen member, if any
    last_login_at = Column(DateTime(timezone=True))


class OtpChallenge(Base):
    __tablename__ = "otp_challenge"
    challenge_id = PK()
    channel = Column(String(10), nullable=False)  # MOBILE | EMAIL
    identifier = Column(String(200), nullable=False, index=True)
    code_hash = Column(String(200), nullable=False)
    purpose = Column(String(30), default="LOGIN")
    attempts = Column(Integer, default=0)
    consumed = Column(Boolean, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)


# ---------------------------------------------------------------- family core
class Address(Base, TimestampMixin):
    __tablename__ = "address"
    address_id = PK()
    address_type = Column(String(20), nullable=False, default="PERMANENT")  # PERMANENT | CURRENT | TEMPORARY
    address_line = Column(Text, nullable=False)
    village = Column(String(120))
    taluka = Column(String(120))
    district = Column(String(120), index=True)
    state = Column(String(80), default="Gujarat")
    pincode = Column(String(10), index=True)
    latitude = Column(Numeric(9, 6))
    longitude = Column(Numeric(9, 6))
    valid_from = Column(Date, default=date.today)
    valid_to = Column(Date)
    is_current = Column(Boolean, default=True)
    family_id = FK("family.family_id", ondelete="CASCADE")
    proof_document_id = Column(UUID(as_uuid=True))


class Family(Base, TimestampMixin):
    __tablename__ = "family"
    family_id = PK()
    family_code = Column(String(32), unique=True, index=True)  # public Family ID e.g. GJ-AHM-26-000123
    family_status = Column(String(30), nullable=False, default="DRAFT")
    # DRAFT -> PENDING_VERIFICATION -> VERIFIED | REJECTED | MERGED | SPLIT | INACTIVE
    family_head_id = Column(UUID(as_uuid=True), nullable=True)
    family_type = Column(String(30), default="NUCLEAR")  # NUCLEAR | JOINT | SINGLE | GUARDIAN
    income_category = Column(String(20))  # BPL | APL | AAY | UNKNOWN
    annual_income = Column(Numeric(12, 2))
    ration_card_type = Column(String(20))
    declared_member_count = Column(Integer)  # panel suggestion: ask number of members up front
    address_id = Column(UUID(as_uuid=True), nullable=True)
    district = Column(String(120), index=True)
    taluka = Column(String(120))
    village = Column(String(120))
    pincode = Column(String(10))
    verification_status = Column(String(30), default="UNVERIFIED")
    verified_at = Column(DateTime(timezone=True))
    merged_into_family_id = Column(UUID(as_uuid=True), nullable=True)
    split_from_family_id = Column(UUID(as_uuid=True), nullable=True)
    created_by_user_id = Column(UUID(as_uuid=True))
    notes = Column(Text)

    members = relationship("FamilyMember", back_populates="family", cascade="all, delete-orphan",
                           primaryjoin="Family.family_id==FamilyMember.family_id")


class FamilyMember(Base, TimestampMixin):
    __tablename__ = "family_member"
    member_id = PK()
    family_id = FK("family.family_id", nullable=False, ondelete="CASCADE")
    name = Column(String(160), nullable=False)
    name_normalized = Column(String(160), index=True)
    father_or_husband_name = Column(String(160))
    date_of_birth = Column(Date)
    gender = Column(String(10))  # MALE | FEMALE | OTHER
    mobile_number = Column(String(15), index=True)
    email = Column(String(200))
    aadhaar_reference = Column(String(64), index=True)  # hashed/last-4 reference only, may be NULL
    aadhaar_last4 = Column(String(4))
    member_status = Column(String(20), nullable=False, default="ACTIVE")  # ACTIVE | LEFT | DECEASED | PROVISIONAL
    citizenship_status = Column(String(20), default="CITIZEN")
    verification_status = Column(String(30), default="UNVERIFIED")  # UNVERIFIED | PARTIAL | VERIFIED | FLAGGED
    identity_source = Column(String(40))  # AADHAAR | BIRTH_CERTIFICATE | MANUAL | RATION
    is_head = Column(Boolean, default=False)
    marital_status = Column(String(20))
    occupation = Column(String(80))
    education_level = Column(String(60))
    is_student = Column(Boolean, default=False)
    disability_type = Column(String(60))
    disability_percentage = Column(Integer)
    udid_reference = Column(String(64))
    annual_income = Column(Numeric(12, 2))
    bank_linked = Column(Boolean, default=False)
    is_pregnant_or_lactating = Column(Boolean, default=False)
    joined_date = Column(Date, default=date.today)
    left_date = Column(Date)
    date_of_death = Column(Date)
    previous_family_id = Column(UUID(as_uuid=True))

    family = relationship("Family", back_populates="members", foreign_keys=[family_id])


Index("ix_member_name_trgm", FamilyMember.name_normalized, postgresql_using="gin",
      postgresql_ops={"name_normalized": "gin_trgm_ops"})


class Relationship(Base, TimestampMixin):
    __tablename__ = "relationship"
    relationship_id = PK()
    member_id = FK("family_member.member_id", nullable=False, ondelete="CASCADE")
    related_member_id = FK("family_member.member_id", nullable=False, ondelete="CASCADE")
    relationship_type = Column(String(30), nullable=False)
    # SPOUSE | FATHER | MOTHER | SON | DAUGHTER | BROTHER | SISTER | GUARDIAN | WARD | GRANDFATHER | GRANDMOTHER | OTHER
    start_date = Column(Date)
    end_date = Column(Date)
    verification_status = Column(String(30), default="UNVERIFIED")
    evidence_document_id = Column(UUID(as_uuid=True))
    notes = Column(Text)


# ---------------------------------------------------------------- documents
class Document(Base, TimestampMixin):
    """Unified table for MEMBER_DOCUMENT and FAMILY_DOCUMENT (owner_type distinguishes)."""
    __tablename__ = "document"
    document_id = PK()
    owner_type = Column(String(10), nullable=False)  # MEMBER | FAMILY
    member_id = FK("family_member.member_id", ondelete="CASCADE")
    family_id = FK("family.family_id", ondelete="CASCADE")
    document_type = Column(String(50), nullable=False)
    # BIRTH_CERTIFICATE | MARRIAGE_CERTIFICATE | DEATH_CERTIFICATE | INCOME_CERTIFICATE | ADDRESS_PROOF
    # DISABILITY_CERTIFICATE | RATION_CARD | EDUCATION_RECORD | COURT_ORDER | ADOPTION_ORDER | OTHER
    document_reference = Column(String(120))
    issuing_authority = Column(String(160))
    issue_date = Column(Date)
    expiry_date = Column(Date)
    verification_status = Column(String(30), default="PENDING")  # PENDING | VERIFIED | REJECTED
    storage_provider = Column(String(20), default="LOCAL")  # CLOUDINARY | LOCAL
    cloudinary_file_id = Column(String(255))
    file_url = Column(Text)
    file_name = Column(String(255))
    mime_type = Column(String(100))
    size_bytes = Column(Integer)
    uploaded_by_user_id = Column(UUID(as_uuid=True))
    verified_by_user_id = Column(UUID(as_uuid=True))
    remarks = Column(Text)


# ---------------------------------------------------------------- external records / consent
class ExternalRecord(Base, TimestampMixin):
    __tablename__ = "external_record"
    record_id = PK()
    family_id = FK("family.family_id", ondelete="CASCADE")
    member_id = FK("family_member.member_id", ondelete="CASCADE")
    source_system = Column(String(50), nullable=False)  # AADHAAR | RATION_PDS | CIVIL_REGISTRATION | INCOME | UDID | EDUCATION
    record_type = Column(String(50), nullable=False)
    external_reference_id = Column(String(120), index=True)
    fetched_data = Column(JSONB, default=dict)
    match_status = Column(String(30), default="UNMATCHED")  # MATCHED | PARTIAL | MISMATCH | UNMATCHED
    match_score = Column(Numeric(5, 2))
    last_verified_at = Column(DateTime(timezone=True))


class MockSourceRecord(Base):
    """Simulated government source systems (Ration/PDS, civil registration, Aadhaar demographic)."""
    __tablename__ = "mock_source_record"
    id = PK()
    source_system = Column(String(50), nullable=False, index=True)
    external_reference_id = Column(String(120), nullable=False, index=True)
    lookup_keys = Column(JSONB, default=dict)  # e.g. {"mobile": "...", "aadhaar_last4": "...", "name": "..."}
    payload = Column(JSONB, default=dict)


class Consent(Base, TimestampMixin):
    __tablename__ = "consent"
    consent_id = PK()
    member_id = FK("family_member.member_id", ondelete="CASCADE")
    user_id = Column(UUID(as_uuid=True))
    data_source = Column(String(50), nullable=False)
    purpose = Column(String(160), nullable=False)
    consent_status = Column(String(20), default="GRANTED")  # GRANTED | REVOKED | EXPIRED
    consent_date = Column(DateTime(timezone=True), default=now_utc)
    expiry_date = Column(DateTime(timezone=True))


# ---------------------------------------------------------------- life events / verification
class LifeEvent(Base, TimestampMixin):
    __tablename__ = "life_event"
    event_id = PK()
    family_id = FK("family.family_id", nullable=False, ondelete="CASCADE")
    member_id = FK("family_member.member_id", ondelete="SET NULL")
    related_member_id = Column(UUID(as_uuid=True))
    event_type = Column(String(30), nullable=False)
    # BIRTH | MARRIAGE | DEATH | DIVORCE | SEPARATION | ADOPTION | GUARDIANSHIP | ADDRESS_CHANGE | SPLIT | MERGE | MIGRATION
    event_date = Column(Date)
    document_id = Column(UUID(as_uuid=True))
    details = Column(JSONB, default=dict)
    verification_status = Column(String(30), default="PENDING")  # PENDING | VERIFIED | REJECTED
    applied = Column(Boolean, default=False)
    reported_by_user_id = Column(UUID(as_uuid=True))


class VerificationCase(Base, TimestampMixin):
    __tablename__ = "verification_case"
    case_id = PK()
    case_number = Column(String(24), unique=True, index=True)
    family_id = FK("family.family_id", ondelete="CASCADE")
    member_id = FK("family_member.member_id", ondelete="SET NULL")
    related_family_id = Column(UUID(as_uuid=True))
    related_member_id = Column(UUID(as_uuid=True))
    case_type = Column(String(40), nullable=False)
    # DUPLICATE_PERSON | DUPLICATE_FAMILY | AADHAAR_MISMATCH | RELATIONSHIP_MISMATCH | INVALID_DOCUMENT
    # ADDRESS_CONFLICT | EXISTING_BENEFIT | LIFE_EVENT | FAMILY_VERIFICATION | MERGE_REQUEST | MANUAL_REVIEW
    reason = Column(Text)
    evidence = Column(JSONB, default=dict)
    priority = Column(String(10), default="NORMAL")
    case_status = Column(String(30), default="OPEN")  # OPEN | ASSIGNED | INFO_REQUESTED | APPROVED | REJECTED | CLOSED
    assigned_officer_id = Column(UUID(as_uuid=True))
    resolution = Column(Text)
    resolved_by_user_id = Column(UUID(as_uuid=True))
    resolved_at = Column(DateTime(timezone=True))
    life_event_id = Column(UUID(as_uuid=True))


# ---------------------------------------------------------------- schemes / eligibility / benefits
class Scheme(Base, TimestampMixin):
    __tablename__ = "scheme"
    scheme_id = PK()
    scheme_code = Column(String(30), unique=True)
    scheme_name = Column(String(160), nullable=False)
    department = Column(String(120), nullable=False)
    description = Column(Text)
    category = Column(String(40))  # EDUCATION | CHILD | SENIOR | DISABILITY | HOUSING | HEALTH | FOOD | WOMEN | FINANCIAL
    target_type = Column(String(10), nullable=False, default="MEMBER")  # MEMBER | FAMILY
    benefit_type = Column(String(20), default="CASH")  # CASH | IN_KIND | SERVICE
    benefit_amount = Column(Numeric(12, 2))
    benefit_frequency = Column(String(20))  # ONE_TIME | MONTHLY | ANNUAL
    eligibility_rules = Column(JSONB, default=list)  # list of {field, op, value, label}
    required_documents = Column(JSONB, default=list)  # list of document_type codes
    exclusive_with = Column(JSONB, default=list)  # scheme codes that cannot be held simultaneously
    status = Column(String(20), default="ACTIVE")


class SchemeEligibility(Base):
    __tablename__ = "scheme_eligibility"
    eligibility_id = PK()
    scheme_id = FK("scheme.scheme_id", nullable=False, ondelete="CASCADE")
    family_id = FK("family.family_id", nullable=False, ondelete="CASCADE")
    member_id = FK("family_member.member_id", ondelete="CASCADE")
    eligibility_status = Column(String(20), nullable=False)  # ELIGIBLE | NOT_ELIGIBLE | NEEDS_DOCUMENT | UNDER_REVIEW
    eligibility_reason = Column(Text)
    reasons = Column(JSONB, default=list)
    missing_requirement = Column(JSONB, default=list)
    checked_at = Column(DateTime(timezone=True), default=now_utc)


class BenefitApplication(Base, TimestampMixin):
    __tablename__ = "benefit_application"
    application_id = PK()
    application_number = Column(String(24), unique=True, index=True)
    family_id = FK("family.family_id", nullable=False, ondelete="CASCADE")
    member_id = FK("family_member.member_id", ondelete="SET NULL")
    scheme_id = FK("scheme.scheme_id", nullable=False)
    application_status = Column(String(30), nullable=False, default="SUBMITTED")
    # DRAFT | SUBMITTED | UNDER_REVIEW | INFO_REQUESTED | APPROVED | REJECTED | WITHDRAWN
    prefilled_data = Column(JSONB, default=dict)
    attached_document_ids = Column(JSONB, default=list)
    officer_remarks = Column(Text)
    submitted_at = Column(DateTime(timezone=True))
    reviewed_by_user_id = Column(UUID(as_uuid=True))
    approved_at = Column(DateTime(timezone=True))
    rejected_at = Column(DateTime(timezone=True))
    rejection_reason = Column(Text)
    status_history = Column(JSONB, default=list)  # [{status, at, by, note}]


class BenefitRecord(Base, TimestampMixin):
    __tablename__ = "benefit_record"
    benefit_id = PK()
    family_id = FK("family.family_id", nullable=False, ondelete="CASCADE")
    member_id = FK("family_member.member_id", ondelete="SET NULL")
    scheme_id = FK("scheme.scheme_id", nullable=False)
    application_id = FK("benefit_application.application_id", ondelete="SET NULL")
    benefit_status = Column(String(20), default="ACTIVE")  # ACTIVE | CLOSED | SUSPENDED
    # Delivery tracking, as asked by the panel: was the benefit actually received?
    delivery_status = Column(String(30), default="SANCTIONED")
    # SANCTIONED | DISBURSED | DELIVERED | RECEIVED_CONFIRMED | NOT_RECEIVED | DISPUTED
    benefit_amount = Column(Numeric(12, 2))
    start_date = Column(Date, default=date.today)
    end_date = Column(Date)
    delivery_log = Column(JSONB, default=list)  # [{status, at, by, note, reference}]
    last_delivery_at = Column(DateTime(timezone=True))
    citizen_confirmed_at = Column(DateTime(timezone=True))


class Grievance(Base, TimestampMixin):
    __tablename__ = "grievance"
    grievance_id = PK()
    grievance_number = Column(String(24), unique=True, index=True)
    family_id = FK("family.family_id", nullable=False, ondelete="CASCADE")
    member_id = FK("family_member.member_id", ondelete="SET NULL")
    application_id = Column(UUID(as_uuid=True))
    benefit_id = Column(UUID(as_uuid=True))
    scheme_id = Column(UUID(as_uuid=True))
    category = Column(String(40), nullable=False)
    # BENEFIT_NOT_RECEIVED | WRONG_AMOUNT | APPLICATION_DELAY | WRONG_REJECTION | DATA_ERROR | VERIFICATION_DELAY | OTHER
    description = Column(Text, nullable=False)
    status = Column(String(30), default="OPEN")  # OPEN | IN_PROGRESS | ESCALATED | RESOLVED | CLOSED | REOPENED
    priority = Column(String(10), default="NORMAL")
    escalation_level = Column(Integer, default=0)
    assigned_officer_id = Column(UUID(as_uuid=True))
    department = Column(String(120))
    resolution = Column(Text)
    resolved_at = Column(DateTime(timezone=True))
    due_at = Column(DateTime(timezone=True))
    citizen_rating = Column(Integer)
    history = Column(JSONB, default=list)


# ---------------------------------------------------------------- notifications / audit
class Notification(Base):
    __tablename__ = "notification"
    notification_id = PK()
    family_id = FK("family.family_id", ondelete="CASCADE")
    member_id = Column(UUID(as_uuid=True))
    user_id = Column(UUID(as_uuid=True), index=True)
    notification_type = Column(String(40), nullable=False)
    title = Column(String(200))
    message = Column(Text, nullable=False)
    status = Column(String(10), default="UNREAD")  # UNREAD | READ
    link = Column(String(200))
    sent_at = Column(DateTime(timezone=True), default=now_utc)


class AuditLog(Base):
    __tablename__ = "audit_log"
    log_id = PK()
    actor_user_id = Column(UUID(as_uuid=True), index=True)
    actor_label = Column(String(160))
    actor_role = Column(String(32))
    action = Column(String(60), nullable=False, index=True)
    entity_type = Column(String(40), nullable=False)
    reference_id = Column(UUID(as_uuid=True), index=True)
    family_id = Column(UUID(as_uuid=True), index=True)
    old_value = Column(JSONB)
    new_value = Column(JSONB)
    ip_address = Column(String(64))
    timestamp = Column(DateTime(timezone=True), default=now_utc, index=True)


class Sequence(Base):
    """Per-key counters for human-readable identifiers (Family ID, case numbers)."""
    __tablename__ = "id_sequence"
    key = Column(String(40), primary_key=True)
    value = Column(Integer, default=0, nullable=False)
