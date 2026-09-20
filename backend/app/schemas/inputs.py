from datetime import date
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class OtpRequest(BaseModel):
    channel: str = Field(pattern="^(MOBILE|EMAIL)$")
    identifier: str
    name: Optional[str] = None


class OtpVerify(BaseModel):
    challenge_id: str
    code: str
    name: Optional[str] = None


class AddressIn(BaseModel):
    address_type: str = "PERMANENT"
    address_line: str
    village: Optional[str] = None
    taluka: Optional[str] = None
    district: str
    state: str = "Gujarat"
    pincode: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class MemberIn(BaseModel):
    name: str
    father_or_husband_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    mobile_number: Optional[str] = None
    email: Optional[str] = None
    aadhaar_reference: Optional[str] = None
    identity_source: Optional[str] = None
    marital_status: Optional[str] = None
    occupation: Optional[str] = None
    education_level: Optional[str] = None
    is_student: bool = False
    disability_type: Optional[str] = None
    disability_percentage: Optional[int] = None
    udid_reference: Optional[str] = None
    annual_income: Optional[float] = None
    bank_linked: bool = False
    is_pregnant_or_lactating: bool = False
    citizenship_status: str = "CITIZEN"
    # relationship of this new member TO an existing member (e.g. this person is the SON of related_member_id)
    relationship_type: Optional[str] = None
    related_member_id: Optional[UUID] = None
    force: bool = False  # proceed despite duplicate warnings (a verification case is still opened)


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    father_or_husband_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    mobile_number: Optional[str] = None
    email: Optional[str] = None
    aadhaar_reference: Optional[str] = None
    marital_status: Optional[str] = None
    occupation: Optional[str] = None
    education_level: Optional[str] = None
    is_student: Optional[bool] = None
    disability_type: Optional[str] = None
    disability_percentage: Optional[int] = None
    udid_reference: Optional[str] = None
    annual_income: Optional[float] = None
    bank_linked: Optional[bool] = None
    is_pregnant_or_lactating: Optional[bool] = None


class FamilyCreate(BaseModel):
    declared_member_count: int = Field(ge=1, le=30)
    family_type: str = "NUCLEAR"
    income_category: Optional[str] = None
    annual_income: Optional[float] = None
    ration_card_type: Optional[str] = None
    address: AddressIn
    head: MemberIn
    claim_ration_reference: Optional[str] = None  # seed from an existing Ration/PDS household


class FamilyUpdate(BaseModel):
    family_type: Optional[str] = None
    income_category: Optional[str] = None
    annual_income: Optional[float] = None
    ration_card_type: Optional[str] = None
    declared_member_count: Optional[int] = None
    notes: Optional[str] = None


class RelationshipIn(BaseModel):
    member_id: UUID
    related_member_id: UUID
    relationship_type: str
    start_date: Optional[date] = None
    evidence_document_id: Optional[UUID] = None


class ConsentIn(BaseModel):
    member_id: UUID
    data_source: str
    purpose: str = "Family ID enrolment and scheme eligibility"


class CaseAction(BaseModel):
    action: str = Field(pattern="^(ASSIGN|APPROVE|REJECT|REQUEST_INFO|MERGE|CLOSE)$")
    resolution: Optional[str] = None
    assign_to_user_id: Optional[UUID] = None
    merge_into_family_id: Optional[UUID] = None


class LifeEventIn(BaseModel):
    event_type: str
    event_date: Optional[date] = None
    member_id: Optional[UUID] = None
    related_member_id: Optional[UUID] = None
    document_id: Optional[UUID] = None
    details: dict[str, Any] = {}
    newborn: Optional[MemberIn] = None  # for BIRTH


class SchemeIn(BaseModel):
    scheme_code: str
    scheme_name: str
    department: str
    description: Optional[str] = None
    category: Optional[str] = None
    target_type: str = "MEMBER"
    benefit_type: str = "CASH"
    benefit_amount: Optional[float] = None
    benefit_frequency: Optional[str] = None
    eligibility_rules: list[dict[str, Any]] = []
    required_documents: list[str] = []
    exclusive_with: list[str] = []
    status: str = "ACTIVE"


class ApplicationIn(BaseModel):
    scheme_id: UUID
    member_id: Optional[UUID] = None
    attached_document_ids: list[UUID] = []
    extra: dict[str, Any] = {}


class ApplicationAction(BaseModel):
    action: str = Field(pattern="^(UNDER_REVIEW|REQUEST_INFO|APPROVE|REJECT|WITHDRAW)$")
    remarks: Optional[str] = None
    benefit_amount: Optional[float] = None


class DeliveryUpdate(BaseModel):
    status: str = Field(pattern="^(SANCTIONED|DISBURSED|DELIVERED|RECEIVED_CONFIRMED|NOT_RECEIVED|DISPUTED)$")
    note: Optional[str] = None
    reference: Optional[str] = None


class GrievanceIn(BaseModel):
    category: str
    description: str
    application_id: Optional[UUID] = None
    benefit_id: Optional[UUID] = None
    scheme_id: Optional[UUID] = None
    member_id: Optional[UUID] = None


class GrievanceAction(BaseModel):
    action: str = Field(pattern="^(ASSIGN|IN_PROGRESS|ESCALATE|RESOLVE|CLOSE|REOPEN|RATE)$")
    note: Optional[str] = None
    assign_to_user_id: Optional[UUID] = None
    rating: Optional[int] = Field(default=None, ge=1, le=5)


class UserIn(BaseModel):
    name: str
    mobile: Optional[str] = None
    email: Optional[EmailStr] = None
    role: str
    department: Optional[str] = None
    district: Optional[str] = None
    status: str = "ACTIVE"
