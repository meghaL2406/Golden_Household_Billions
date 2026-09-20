"""Deterministic demo seed for the Family ID platform.

Usage (from backend/):
    .venv/bin/python -m app.seed            # create tables, seed only when the database is empty
    .venv/bin/python -m app.seed --reset    # drop every table, recreate and seed from scratch

Everything is generated from a fixed random seed so repeated runs produce the same data set.
"""
from __future__ import annotations

import hashlib
import random
import sys
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import Base, SessionLocal, engine, init_extensions
from app.models import (  # noqa: F401  (import registers every model on Base)
    Address, AuditLog, BenefitApplication, BenefitRecord, Consent, Document, ExternalRecord, Family, FamilyMember,
    Grievance, LifeEvent, MockSourceRecord, Notification, OtpChallenge, Relationship, Scheme, SchemeEligibility,
    Sequence, User, VerificationCase,
)
from app.services.common import DISTRICT_CENTROIDS, generate_family_code, generate_number, normalize_name
from app.services.relationships import inverse_type

RNG = random.Random(20260920)
TODAY = date.today()
NOW = datetime.now(timezone.utc)
UPLOAD_ROOT = Path(__file__).resolve().parents[1] / "uploads"
SEED_DOC_DIR = UPLOAD_ROOT / "seed"

# ---------------------------------------------------------------------------------------------------- reference data
DISTRICTS = [
    "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar", "Bhavnagar", "Jamnagar", "Junagadh",
    "Kutch", "Anand", "Mehsana", "Bharuch", "Navsari", "Valsad", "Patan", "Banaskantha",
]
DISTRICT_PINCODES = {
    "Ahmedabad": "380001", "Surat": "395001", "Vadodara": "390001", "Rajkot": "360001", "Gandhinagar": "382010",
    "Bhavnagar": "364001", "Jamnagar": "361001", "Junagadh": "362001", "Kutch": "370001", "Anand": "388001",
    "Mehsana": "384001", "Bharuch": "392001", "Navsari": "396445", "Valsad": "396001", "Patan": "384265",
    "Banaskantha": "385001",
}
DISTRICT_PLACES = {  # district -> [(taluka, village)]
    "Ahmedabad": [("Daskroi", "Bopal"), ("Sanand", "Sanathal"), ("Dholka", "Kalyanpura")],
    "Surat": [("Choryasi", "Sachin"), ("Olpad", "Kim"), ("Bardoli", "Vankaner")],
    "Vadodara": [("Vadodara", "Sevasi"), ("Padra", "Mobha"), ("Savli", "Manjusar")],
    "Rajkot": [("Rajkot", "Kuvadva"), ("Gondal", "Ribda"), ("Jasdan", "Atkot")],
    "Gandhinagar": [("Gandhinagar", "Pethapur"), ("Kalol", "Saij"), ("Dehgam", "Rakhial")],
    "Bhavnagar": [("Bhavnagar", "Sidsar"), ("Sihor", "Songadh"), ("Mahuva", "Bagdana")],
    "Jamnagar": [("Jamnagar", "Dhrol"), ("Kalavad", "Nikava"), ("Lalpur", "Moti Banugar")],
    "Junagadh": [("Junagadh", "Vanthali"), ("Keshod", "Ajab"), ("Mangrol", "Shil")],
    "Kutch": [("Bhuj", "Madhapar"), ("Anjar", "Bhimasar"), ("Mandvi", "Koday")],
    "Anand": [("Anand", "Vallabh Vidyanagar"), ("Petlad", "Sojitra"), ("Borsad", "Ras")],
    "Mehsana": [("Mehsana", "Dediyasan"), ("Visnagar", "Kada"), ("Unjha", "Aithor")],
    "Bharuch": [("Bharuch", "Dahej"), ("Ankleshwar", "Piraman"), ("Jambusar", "Kavi")],
    "Navsari": [("Navsari", "Jalalpore"), ("Gandevi", "Bilimora"), ("Chikhli", "Rankuva")],
    "Valsad": [("Valsad", "Atul"), ("Pardi", "Killa Pardi"), ("Dharampur", "Barumal")],
    "Patan": [("Patan", "Sander"), ("Sidhpur", "Dethli"), ("Chanasma", "Kamboi")],
    "Banaskantha": [("Palanpur", "Chadotar"), ("Deesa", "Bhildi"), ("Dhanera", "Nenava")],
}
SURNAMES = ["Patel", "Shah", "Desai", "Mehta", "Joshi", "Trivedi", "Solanki", "Parmar", "Chauhan", "Rathod",
            "Vaghela", "Jadeja", "Gohil", "Makwana", "Prajapati", "Bhatt", "Dave", "Pandya", "Chaudhary", "Thakor",
            "Rabari", "Vasava", "Gamit", "Chavda", "Zala", "Barot", "Panchal", "Modi"]
MALE_NAMES = ["Jayesh", "Mahesh", "Dinesh", "Hitesh", "Bharat", "Kishor", "Ashok", "Vinod", "Manoj", "Prakash",
              "Sanjay", "Rajendra", "Nitin", "Alpesh", "Jignesh", "Mukesh", "Hasmukh", "Dilip", "Kantilal",
              "Chandrakant", "Bhavesh", "Paresh", "Dharmesh", "Vipul", "Amit", "Rohit", "Naresh", "Govind"]
BOY_NAMES = ["Karan", "Harsh", "Dev", "Yash", "Jay", "Krish", "Aryan", "Om", "Vivek", "Pranav", "Nirav", "Tushar",
             "Meet", "Dhruv", "Parth", "Kavya", "Rudra", "Shiv"]
FEMALE_NAMES = ["Hansa", "Jyoti", "Bhavna", "Kokila", "Rekha", "Sarla", "Gita", "Manjula", "Nita", "Hetal", "Daxa",
                "Jigna", "Falguni", "Urmila", "Kamla", "Savita", "Lila", "Ramila", "Sushila", "Varsha", "Asha", "Ila"]
GIRL_NAMES = ["Kinjal", "Pooja", "Nisha", "Krupa", "Dhara", "Riya", "Aanya", "Diya", "Khushi", "Mansi", "Shreya",
              "Ankita", "Payal", "Ishita", "Vidhi", "Hiral", "Nidhi", "Tanvi"]
OCCUPATIONS = ["Farmer", "Daily wage labourer", "Auto rickshaw driver", "Shopkeeper", "Tailor", "Mason",
               "Diamond polisher", "Textile worker", "Anganwadi worker", "Clerk", "Electrician", "Milk vendor",
               "Security guard", "Homemaker", "Retired"]
EDUCATION = ["Illiterate", "Primary", "Secondary", "Higher Secondary", "Graduate", "Diploma"]
DISABILITIES = [("Locomotor", 45), ("Visual impairment", 60), ("Hearing impairment", 70), ("Locomotor", 80)]
INCOME_BANDS = {"AAY": (60_000, 120_000), "BPL": (120_000, 250_000), "APL": (260_000, 800_000)}
DEPARTMENTS = {
    "EDU": "Education", "WCD": "Women and Child Development", "SJE": "Social Justice and Empowerment",
    "HFW": "Health and Family Welfare", "FCS": "Food and Civil Supplies", "HUD": "Housing and Urban Development",
    "RD": "Rural Development",
}

# ---------------------------------------------------------------------------------------------------- small helpers


def log(msg: str) -> None:
    print(f"[seed] {msg}", flush=True)


def hash_ref(digits: str) -> str:
    """Identical to app.routers.families.hash_ref so seeded references match references created through the API."""
    return hashlib.sha256(f"familyid:{digits}".encode()).hexdigest()[:24]


def dob_for_age(years: int, spread_days: int = 364) -> date:
    base = date(TODAY.year - years, TODAY.month, min(TODAY.day, 28))
    return base - timedelta(days=RNG.randint(0, spread_days))


def days_ago(n: float) -> datetime:
    return NOW - timedelta(days=n)


def random_aadhaar() -> str:
    return "".join(str(RNG.randint(0, 9)) for _ in range(12))


_used_mobiles = {"9876500001", "9876500002", "9000000001", "9000000002", "9000000003", "9000000004"}


def random_mobile() -> str:
    while True:
        m = f"9{RNG.randint(700000000, 999999999)}"
        if m not in _used_mobiles:
            _used_mobiles.add(m)
            return m


def minimal_pdf(title: str, lines: list[str]) -> bytes:
    """Hand-written single page PDF (Helvetica text), valid enough for any viewer."""
    content_lines = ["BT", "/F1 18 Tf", "50 780 Td", f"({title}) Tj", "/F1 11 Tf"]
    for line in lines:
        safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        content_lines += ["0 -20 Td", f"({safe}) Tj"]
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode() + b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def write_seed_pdf(name: str, title: str, lines: list[str]) -> tuple[str, int]:
    SEED_DOC_DIR.mkdir(parents=True, exist_ok=True)
    data = minimal_pdf(title, lines)
    path = SEED_DOC_DIR / f"{name}.pdf"
    path.write_bytes(data)
    return f"/uploads/seed/{name}.pdf", len(data)


# ---------------------------------------------------------------------------------------------------- domain helpers


class Ctx:
    """Mutable state shared between the seeding steps."""

    def __init__(self, db: Session):
        self.db = db
        self.users: dict[str, User] = {}
        self.schemes: dict[str, Scheme] = {}
        self.families: list[Family] = []
        self.members_by_family: dict = {}
        self.ramesh: dict = {}
        self.rajesh: dict = {}
        self.rakesh: dict = {}
        self.mismatch_member: FamilyMember | None = None
        self.newborn: FamilyMember | None = None
        self.not_received_benefit: BenefitRecord | None = None
        self.audit_rows = 0


def add_member(ctx: Ctx, fam: Family, name: str, dob: date, gender: str, *, aadhaar: str | bool | None = None,
               is_head: bool = False, father_or_husband: str | None = None, marital: str | None = None,
               occupation: str | None = None, education: str | None = None, is_student: bool = False,
               disability: tuple[str, int] | None = None, udid: str | None = None, income: int | None = None,
               bank_linked: bool = False, pregnant: bool = False, mobile: str | None = None,
               identity_source: str | None = None, member_status: str = "ACTIVE", verified: bool = False,
               created_at: datetime | None = None) -> FamilyMember:
    m = FamilyMember(
        family_id=fam.family_id, name=name, name_normalized=normalize_name(name), father_or_husband_name=father_or_husband,
        date_of_birth=dob, gender=gender, mobile_number=mobile, is_head=is_head, marital_status=marital,
        occupation=occupation, education_level=education, is_student=is_student, bank_linked=bank_linked,
        is_pregnant_or_lactating=pregnant, member_status=member_status, citizenship_status="CITIZEN",
        annual_income=Decimal(income) if income is not None else None, joined_date=(created_at or NOW).date(),
        created_at=created_at or NOW, updated_at=created_at or NOW,
    )
    if disability:
        m.disability_type, m.disability_percentage = disability
        m.udid_reference = udid or f"GJ{RNG.randint(10**15, 10**16 - 1)}"
    if aadhaar:
        digits = random_aadhaar() if aadhaar is True else "".join(ch for ch in str(aadhaar) if ch.isdigit())
        m.aadhaar_reference = f"AAD-{hash_ref(digits)}"
        m.aadhaar_last4 = digits[-4:]
        m.identity_source = identity_source or "AADHAAR"
        m.verification_status = "VERIFIED" if verified else "PARTIAL"
    else:
        m.identity_source = identity_source or RNG.choice(["MANUAL", "MANUAL", "RATION"])
        m.verification_status = "VERIFIED" if verified else "UNVERIFIED"
    if member_status == "PROVISIONAL":
        m.verification_status = "UNVERIFIED"
    ctx.db.add(m)
    ctx.db.flush()
    ctx.members_by_family.setdefault(fam.family_id, []).append(m)
    return m


def link(ctx: Ctx, a: FamilyMember, b: FamilyMember, rel_type: str, verified: bool = False) -> None:
    """Record that `a` is `rel_type` of `b`, plus the inverse relationship (both directions, like the API does)."""
    status = "VERIFIED" if verified else "UNVERIFIED"
    ctx.db.add_all([
        Relationship(member_id=a.member_id, related_member_id=b.member_id, relationship_type=rel_type, verification_status=status),
        Relationship(member_id=b.member_id, related_member_id=a.member_id, relationship_type=inverse_type(rel_type, a),
                     verification_status=status),
    ])


def new_family(ctx: Ctx, district: str, *, status: str, income_category: str | None, annual_income: int | None,
               ration: str | None, family_type: str = "NUCLEAR", declared: int | None = None, created_days_ago: float = 30,
               notes: str | None = None, place: tuple[str, str] | None = None, created_by: User | None = None) -> Family:
    taluka, village = place or RNG.choice(DISTRICT_PLACES[district])
    created = days_ago(created_days_ago)
    fam = Family(
        family_status=status, family_type=family_type, income_category=income_category,
        annual_income=Decimal(annual_income) if annual_income is not None else None, ration_card_type=ration,
        declared_member_count=declared, district=district, taluka=taluka, village=village,
        pincode=DISTRICT_PINCODES[district], notes=notes, created_at=created, updated_at=created,
        created_by_user_id=(created_by or ctx.users["operator"]).user_id,
        verification_status="VERIFIED" if status == "VERIFIED" else "UNVERIFIED",
    )
    ctx.db.add(fam)
    ctx.db.flush()
    lat, lng = DISTRICT_CENTROIDS[district]
    addr = Address(
        family_id=fam.family_id, address_type="PERMANENT", district=district, taluka=taluka, village=village,
        state="Gujarat", pincode=DISTRICT_PINCODES[district], is_current=True, valid_from=created.date(),
        address_line=f"{RNG.randint(1, 240)}, {RNG.choice(['Shiv', 'Krishna', 'Ambika', 'Gokul', 'Radhe', 'Swastik', 'Umiya'])} "
                     f"{RNG.choice(['Society', 'Nagar', 'Park', 'Faliya', 'Chowk', 'Vas'])}, {village}",
        latitude=Decimal(str(round(lat + RNG.uniform(-0.06, 0.06), 6))),
        longitude=Decimal(str(round(lng + RNG.uniform(-0.06, 0.06), 6))),
        created_at=created, updated_at=created,
    )
    ctx.db.add(addr)
    ctx.db.flush()
    fam.address_id = addr.address_id
    if status == "VERIFIED":
        fam.family_code = generate_family_code(ctx.db, district)
        fam.verified_at = created + timedelta(days=RNG.randint(2, 9))
    ctx.families.append(fam)
    return fam


def add_document(ctx: Ctx, fam: Family, doc_type: str, *, member: FamilyMember | None = None, status: str = "VERIFIED",
                 reference: str | None = None, authority: str | None = None, pdf_name: str | None = None,
                 title: str | None = None, lines: list[str] | None = None) -> Document:
    owner = member.name if member else f"family {fam.family_code or fam.family_id.hex[:8]}"
    name = pdf_name or f"{doc_type.lower()}_{(member.member_id if member else fam.family_id).hex[:10]}"
    url, size = write_seed_pdf(name, title or doc_type.replace("_", " ").title(),
                               lines or [f"Issued to: {owner}", f"District: {fam.district}", "Demo document generated by the seed script."])
    created = fam.created_at + timedelta(days=RNG.randint(0, 3), hours=RNG.randint(1, 20))
    doc = Document(
        owner_type="MEMBER" if member else "FAMILY", member_id=member.member_id if member else None, family_id=fam.family_id,
        document_type=doc_type, document_reference=reference or f"{doc_type[:3]}-{RNG.randint(100000, 999999)}",
        issuing_authority=authority or "Mamlatdar Office, " + (fam.taluka or fam.district), issue_date=created.date() - timedelta(days=RNG.randint(30, 900)),
        verification_status=status, storage_provider="LOCAL", file_url=url, file_name=f"{name}.pdf", mime_type="application/pdf",
        size_bytes=size, uploaded_by_user_id=ctx.users["operator"].user_id,
        verified_by_user_id=ctx.users["verifier"].user_id if status == "VERIFIED" else None,
        remarks="Verified against original." if status == "VERIFIED" else None, created_at=created, updated_at=created,
    )
    ctx.db.add(doc)
    ctx.db.flush()
    return doc


def add_case(ctx: Ctx, fam: Family, case_type: str, reason: str, *, member: FamilyMember | None = None, status: str = "OPEN",
             priority: str = "NORMAL", evidence: dict | None = None, related_family: Family | None = None,
             related_member: FamilyMember | None = None, resolution: str | None = None, assigned: bool = False,
             life_event_id=None, created_at: datetime | None = None) -> VerificationCase:
    created = created_at or fam.created_at + timedelta(days=RNG.randint(1, 4))
    case = VerificationCase(
        case_number=generate_number(ctx.db, "VC"), family_id=fam.family_id, member_id=member.member_id if member else None,
        related_family_id=related_family.family_id if related_family else None,
        related_member_id=related_member.member_id if related_member else None, case_type=case_type, reason=reason,
        evidence=evidence or {}, priority=priority, case_status=status, life_event_id=life_event_id,
        assigned_officer_id=ctx.users["verifier"].user_id if (assigned or status in ("ASSIGNED", "APPROVED", "REJECTED", "CLOSED")) else None,
        resolution=resolution, created_at=created, updated_at=created,
    )
    if status in ("APPROVED", "REJECTED", "CLOSED"):
        case.resolved_by_user_id = ctx.users["verifier"].user_id
        case.resolved_at = created + timedelta(days=RNG.randint(1, 5))
    ctx.db.add(case)
    ctx.db.flush()
    return case


def add_audit(ctx: Ctx, actor: User | None, action: str, entity_type: str, reference_id=None, family_id=None,
              new_value: dict | None = None, old_value: dict | None = None, at: datetime | None = None) -> None:
    ctx.db.add(AuditLog(
        actor_user_id=actor.user_id if actor else None, actor_label=actor.name if actor else "system",
        actor_role=actor.role if actor else "SYSTEM", action=action, entity_type=entity_type, reference_id=reference_id,
        family_id=family_id, old_value=old_value, new_value=new_value, ip_address=f"10.20.{RNG.randint(0, 40)}.{RNG.randint(2, 250)}",
        timestamp=at or NOW,
    ))
    ctx.audit_rows += 1


# ---------------------------------------------------------------------------------------------------- 1. users


def seed_users(ctx: Ctx) -> None:
    spec = [
        ("ramesh", "Ramesh Patel", "9876500001", None, "CITIZEN", None, "Ahmedabad"),
        ("suresh", "Suresh Chauhan", "9876500002", None, "CITIZEN", None, "Vadodara"),
        ("operator", "Kiran Desai", "9000000001", "kiran.desai@familyid.gov.in", "SERVICE_OPERATOR", "Common Service Centre", "Ahmedabad"),
        ("verifier", "Bhavna Trivedi", "9000000002", "bhavna.trivedi@familyid.gov.in", "VERIFICATION_OFFICER", "Revenue Department", "Ahmedabad"),
        ("dept", "Nilesh Joshi", "9000000003", "nilesh.joshi@familyid.gov.in", "DEPARTMENT_OFFICER", "Women and Child Development", "Gandhinagar"),
        ("admin", "Anita Sharma", "9000000004", "admin@familyid.gov.in", "ADMIN", "Department of Science and Technology", "Gandhinagar"),
    ]
    for key, name, mobile, email, role, dept, district in spec:
        u = User(name=name, mobile=mobile, email=email, role=role, department=dept, district=district, status="ACTIVE",
                 created_at=days_ago(120), updated_at=days_ago(120), last_login_at=days_ago(RNG.uniform(0, 5)))
        ctx.db.add(u)
        ctx.users[key] = u
    ctx.db.flush()


# ---------------------------------------------------------------------------------------------------- 2. schemes


def rule(field: str, op: str, value=None, label: str | None = None) -> dict:
    return {"field": field, "op": op, "value": value, "label": label}


def seed_schemes(ctx: Ctx) -> None:
    specs = [
        dict(scheme_code="GJ-SCH-001", scheme_name="Student Scholarship", department=DEPARTMENTS["EDU"], category="EDUCATION",
             target_type="MEMBER", benefit_type="CASH", benefit_amount=12000, benefit_frequency="ANNUAL",
             description="Annual scholarship for school and college students from low-income families. The amount is credited once a year after the education record is verified.",
             eligibility_rules=[rule("is_student", "is_true", None, "Currently enrolled as a student"),
                                rule("age", "between", [6, 25], "Age between 6 and 25"),
                                rule("annual_income", "<=", 250000, "Annual family income up to 2.5 lakh")],
             required_documents=["EDUCATION_RECORD", "INCOME_CERTIFICATE"], exclusive_with=[]),
        dict(scheme_code="GJ-SCH-002", scheme_name="Child Benefit", department=DEPARTMENTS["WCD"], category="CHILD",
             target_type="MEMBER", benefit_type="CASH", benefit_amount=1500, benefit_frequency="MONTHLY",
             description="Monthly nutrition and care allowance for every child below six years. Payment continues until the child turns six or the family leaves the state.",
             eligibility_rules=[rule("age", "<", 6, "Child below 6 years")],
             required_documents=["BIRTH_CERTIFICATE"], exclusive_with=[]),
        dict(scheme_code="GJ-SCH-003", scheme_name="Senior Citizen Support", department=DEPARTMENTS["SJE"], category="SENIOR",
             target_type="MEMBER", benefit_type="CASH", benefit_amount=1250, benefit_frequency="MONTHLY",
             description="Monthly pension for senior citizens whose family income is modest. No separate application form is needed once the Family ID is verified.",
             eligibility_rules=[rule("age", ">=", 60, "Age 60 or above"),
                                rule("annual_income", "<=", 300000, "Annual family income up to 3 lakh")],
             required_documents=[], exclusive_with=[]),
        dict(scheme_code="GJ-SCH-004", scheme_name="Disability Assistance", department=DEPARTMENTS["SJE"], category="DISABILITY",
             target_type="MEMBER", benefit_type="CASH", benefit_amount=1000, benefit_frequency="MONTHLY",
             description="Monthly assistance for persons with a benchmark disability of forty percent or more. A valid disability certificate or UDID card is required.",
             eligibility_rules=[rule("disability_percentage", ">=", 40, "Disability of 40 percent or more")],
             required_documents=["DISABILITY_CERTIFICATE"], exclusive_with=[]),
        dict(scheme_code="GJ-SCH-005", scheme_name="Housing Assistance", department=DEPARTMENTS["HUD"], category="HOUSING",
             target_type="FAMILY", benefit_type="CASH", benefit_amount=120000, benefit_frequency="ONE_TIME",
             description="One-time construction grant for families below the poverty line that do not own a house. The grant is released in instalments as construction progresses.",
             eligibility_rules=[rule("income_category", "in", ["BPL", "AAY"], "Family is BPL or AAY"),
                                rule("has_house", "is_false", None, "Family does not own a house")],
             required_documents=["ADDRESS_PROOF", "INCOME_CERTIFICATE"], exclusive_with=[]),
        dict(scheme_code="GJ-SCH-006", scheme_name="Health Scheme", department=DEPARTMENTS["HFW"], category="HEALTH",
             target_type="FAMILY", benefit_type="SERVICE", benefit_amount=500000, benefit_frequency="ANNUAL",
             description="Cashless hospital treatment cover of up to five lakh rupees per family per year. Empanelled hospitals accept the Family ID directly at admission.",
             eligibility_rules=[rule("annual_income", "<=", 400000, "Annual family income up to 4 lakh")],
             required_documents=[], exclusive_with=[]),
        dict(scheme_code="GJ-SCH-007", scheme_name="Food and Ration Benefit", department=DEPARTMENTS["FCS"], category="FOOD",
             target_type="FAMILY", benefit_type="IN_KIND", benefit_amount=None, benefit_frequency="MONTHLY",
             description="Subsidised food grains every month for priority households. Entitlement is calculated per family member on the ration card.",
             eligibility_rules=[rule("ration_card_type", "in", ["BPL", "AAY"], "Ration card is BPL or AAY")],
             required_documents=["RATION_CARD"], exclusive_with=[]),
        dict(scheme_code="GJ-SCH-008", scheme_name="Women Support Scheme", department=DEPARTMENTS["WCD"], category="WOMEN",
             target_type="MEMBER", benefit_type="CASH", benefit_amount=6000, benefit_frequency="ANNUAL",
             description="Annual support payment for adult women from low-income households. The amount is paid directly into the beneficiary's own bank account.",
             eligibility_rules=[rule("gender", "==", "FEMALE", "Female member"),
                                rule("age", "between", [18, 60], "Age between 18 and 60"),
                                rule("annual_income", "<=", 250000, "Annual family income up to 2.5 lakh")],
             required_documents=[], exclusive_with=[]),
        dict(scheme_code="GJ-SCH-009", scheme_name="Education Fee Assistance", department=DEPARTMENTS["EDU"], category="EDUCATION",
             target_type="MEMBER", benefit_type="CASH", benefit_amount=8000, benefit_frequency="ANNUAL",
             description="Reimbursement of tuition fees for secondary and higher-secondary students. It cannot be combined with the Student Scholarship.",
             eligibility_rules=[rule("is_student", "is_true", None, "Currently enrolled as a student"),
                                rule("age", "between", [14, 22], "Age between 14 and 22")],
             required_documents=["EDUCATION_RECORD"], exclusive_with=["GJ-SCH-001"]),
        dict(scheme_code="GJ-SCH-010", scheme_name="Financial Subsidy", department=DEPARTMENTS["RD"], category="FINANCIAL",
             target_type="FAMILY", benefit_type="CASH", benefit_amount=10000, benefit_frequency="ONE_TIME",
             description="One-time livelihood subsidy for families below the poverty line. It is intended to support a small business, livestock or tools.",
             eligibility_rules=[rule("income_category", "==", "BPL", "Family is below the poverty line")],
             required_documents=[], exclusive_with=[]),
    ]
    for s in specs:
        amount = s.pop("benefit_amount")
        sch = Scheme(**s, benefit_amount=Decimal(amount) if amount is not None else None, status="ACTIVE",
                     created_at=days_ago(90), updated_at=days_ago(90))
        ctx.db.add(sch)
        ctx.schemes[s["scheme_code"]] = sch
    ctx.db.flush()


# ---------------------------------------------------------------------------------------------------- 3. mock sources


def seed_mock_sources(ctx: Ctx) -> None:
    """Simulated Ration/PDS, Aadhaar and Civil Registration lookups used by the enrolment and verification demos."""
    ctx.db.add(MockSourceRecord(
        source_system="RATION_PDS", external_reference_id="GJ-RC-778812",
        lookup_keys={"mobile": "9876500002", "ration_card": "GJ-RC-778812", "name": "Suresh Chauhan"},
        payload={"record_type": "HOUSEHOLD", "card_type": "BPL", "head_name": "Suresh Chauhan", "name": "Suresh Chauhan",
                 "date_of_birth": "1980-03-12", "gender": "MALE", "father_name": "Manilal Chauhan",
                 "address": "14, Ambika Nagar, Sevasi, Vadodara", "district": "Vadodara",
                 "members": [
                     {"name": "Suresh Chauhan", "dob": "1980-03-12", "gender": "MALE", "relation": "SELF"},
                     {"name": "Kokila Chauhan", "dob": "1984-07-22", "gender": "FEMALE", "relation": "WIFE"},
                     {"name": "Dhruv Chauhan", "dob": "2010-11-02", "gender": "MALE", "relation": "SON"},
                     {"name": "Riya Chauhan", "dob": "2015-01-19", "gender": "FEMALE", "relation": "DAUGHTER"},
                 ]},
    ))
    ctx.db.add(MockSourceRecord(
        source_system="AADHAAR", external_reference_id="UID-XXXX-XXXX-4412",
        lookup_keys={"mobile": "9876500002", "name": "Suresh Chauhan"},
        payload={"record_type": "DEMOGRAPHIC", "name": "Suresh Chauhan", "date_of_birth": "1980-03-12", "gender": "MALE",
                 "father_name": "Manilal Chauhan", "address": "14, Ambika Nagar, Sevasi, Vadodara", "district": "Vadodara"},
    ))
    # Ramesh Patel's own household and demographic record (MATCHED demo)
    ctx.db.add(MockSourceRecord(
        source_system="RATION_PDS", external_reference_id="GJ-RC-551203",
        lookup_keys={"mobile": "9876500001", "ration_card": "GJ-RC-551203", "name": "Ramesh Patel"},
        payload={"record_type": "HOUSEHOLD", "card_type": "BPL", "head_name": "Ramesh Patel", "name": "Ramesh Patel",
                 "date_of_birth": "1982-08-14", "gender": "MALE", "father_name": "Kanubhai Patel",
                 "address": "23, Shiv Society, Bopal, Ahmedabad", "district": "Ahmedabad",
                 "members": [
                     {"name": "Ramesh Patel", "dob": "1982-08-14", "gender": "MALE", "relation": "SELF"},
                     {"name": "Meena Patel", "dob": "1986-02-03", "gender": "FEMALE", "relation": "WIFE"},
                     {"name": "Arjun Patel", "dob": str(dob_for_age(12)), "gender": "MALE", "relation": "SON"},
                     {"name": "Priya Patel", "dob": str(dob_for_age(4)), "gender": "FEMALE", "relation": "DAUGHTER"},
                     {"name": "Kanubhai Patel", "dob": "1958-01-26", "gender": "MALE", "relation": "FATHER"},
                 ]},
    ))
    ctx.db.add(MockSourceRecord(
        source_system="AADHAAR", external_reference_id="UID-XXXX-XXXX-2231",
        lookup_keys={"mobile": "9876500001", "name": "Ramesh Patel"},
        payload={"record_type": "DEMOGRAPHIC", "name": "Ramesh Patel", "date_of_birth": "1982-08-14", "gender": "MALE",
                 "father_name": "Kanubhai Patel", "address": "23, Shiv Society, Bopal, Ahmedabad", "district": "Ahmedabad"},
    ))
    ctx.db.flush()


def seed_mock_sources_dependent(ctx: Ctx) -> None:
    """Mock records that reference seeded members (written after the families exist)."""
    mm = ctx.mismatch_member
    ctx.db.add(MockSourceRecord(
        source_system="AADHAAR", external_reference_id="UID-XXXX-XXXX-" + (mm.aadhaar_last4 or "9081"),
        lookup_keys={"mobile": mm.mobile_number, "aadhaar": mm.aadhaar_reference, "name": mm.name},
        payload={"record_type": "DEMOGRAPHIC", "name": "Mahesh Solanki", "date_of_birth": "1979-04-02", "gender": "MALE",
                 "father_name": "Ratilal Solanki", "address": "Kuvadva, Rajkot", "district": "Rajkot"},
    ))
    nb = ctx.newborn
    father = next(m for m in ctx.members_by_family[nb.family_id] if m.is_head)
    mother = next((m for m in ctx.members_by_family[nb.family_id] if m.gender == "FEMALE" and m.marital_status == "MARRIED"), None)
    ctx.db.add(MockSourceRecord(
        source_system="CIVIL_REGISTRATION", external_reference_id=f"BR-{TODAY.year}-{RNG.randint(100000, 999999)}",
        lookup_keys={"name": nb.name, "mobile": father.mobile_number},
        payload={"record_type": "BIRTH", "name": nb.name, "date_of_birth": str(nb.date_of_birth), "gender": nb.gender,
                 "father_name": father.name, "mother_name": mother.name if mother else None,
                 "address": f"{father.family.village}, {father.family.district}", "district": father.family.district,
                 "place_of_birth": f"Community Health Centre, {father.family.taluka}"},
    ))
    ctx.db.flush()


# ---------------------------------------------------------------------------------------------------- 4. families


def seed_ramesh_family(ctx: Ctx) -> None:
    fam = new_family(ctx, "Ahmedabad", status="VERIFIED", income_category="BPL", annual_income=180000, ration="BPL",
                     family_type="JOINT", declared=5, created_days_ago=58, place=("Daskroi", "Bopal"), created_by=ctx.users["ramesh"])
    c = fam.created_at
    ramesh = add_member(ctx, fam, "Ramesh Patel", date(1982, 8, 14), "MALE", aadhaar="472819034412", is_head=True,
                        father_or_husband="Kanubhai Patel", marital="MARRIED", occupation="Auto rickshaw driver", education="Secondary",
                        income=180000, bank_linked=True, mobile="9876500001", verified=True, created_at=c)
    meena = add_member(ctx, fam, "Meena Patel", date(1986, 2, 3), "FEMALE", aadhaar="381920475522", father_or_husband="Ramesh Patel",
                       marital="MARRIED", occupation="Homemaker", education="Primary", bank_linked=True, verified=True, created_at=c)
    arjun = add_member(ctx, fam, "Arjun Patel", dob_for_age(12), "MALE", aadhaar="290183746631", father_or_husband="Ramesh Patel",
                       marital="SINGLE", education="Class 7", is_student=True, verified=True, created_at=c)
    priya = add_member(ctx, fam, "Priya Patel", dob_for_age(4), "FEMALE", aadhaar=None, father_or_husband="Ramesh Patel",
                       marital="SINGLE", identity_source="BIRTH_CERTIFICATE", verified=True, created_at=c)
    kanu = add_member(ctx, fam, "Kanubhai Patel", date(1958, 1, 26), "MALE", aadhaar="118273649902", father_or_husband="Mohanbhai Patel",
                      marital="WIDOWED", occupation="Retired", education="Primary", bank_linked=True, verified=True, created_at=c)
    fam.family_head_id = ramesh.member_id
    ctx.users["ramesh"].member_id = ramesh.member_id
    link(ctx, ramesh, meena, "SPOUSE", True)
    for child in (arjun, priya):
        link(ctx, ramesh, child, "FATHER", True)
        link(ctx, meena, child, "MOTHER", True)
        link(ctx, kanu, child, "GRANDFATHER", True)
    link(ctx, arjun, priya, "BROTHER", True)
    link(ctx, kanu, ramesh, "FATHER", True)

    add_document(ctx, fam, "BIRTH_CERTIFICATE", member=priya, pdf_name="ramesh_birth_certificate_priya", reference="BC-AHM-2022-018834",
                 authority="Registrar of Births and Deaths, AMC", title="Birth Certificate",
                 lines=["Name of child: Priya Patel", "Father: Ramesh Patel", "Mother: Meena Patel", f"Date of birth: {priya.date_of_birth}"])
    add_document(ctx, fam, "EDUCATION_RECORD", member=arjun, pdf_name="ramesh_education_record_arjun", reference="EDU-AHM-2026-77120",
                 authority="Bopal Primary School", title="Bonafide Student Certificate",
                 lines=["Student: Arjun Patel", "Class: 7", "Academic year: 2026-27"])
    add_document(ctx, fam, "ADDRESS_PROOF", pdf_name="ramesh_address_proof", reference="ELEC-AHM-2024-4491",
                 authority="Torrent Power", title="Electricity Bill", lines=["Consumer: Ramesh Patel", "Address: 23, Shiv Society, Bopal, Ahmedabad"])
    add_document(ctx, fam, "INCOME_CERTIFICATE", pdf_name="ramesh_income_certificate", reference="INC-AHM-2026-11209",
                 authority="Mamlatdar Office, Daskroi", title="Income Certificate", lines=["Head of family: Ramesh Patel", "Annual income: Rs. 1,80,000"])
    add_document(ctx, fam, "RATION_CARD", pdf_name="ramesh_ration_card", reference="GJ-RC-551203",
                 authority="Food and Civil Supplies, Ahmedabad", title="Ration Card (BPL)", lines=["Card number: GJ-RC-551203", "Members: 5"])

    for src in ("RATION_PDS", "AADHAAR"):
        ctx.db.add(Consent(member_id=ramesh.member_id, user_id=ctx.users["ramesh"].user_id, data_source=src,
                           purpose="Verify family details for Family ID enrolment", consent_status="GRANTED",
                           consent_date=c + timedelta(hours=1), created_at=c, updated_at=c))
    ration_payload = ctx.db.query(MockSourceRecord).filter_by(external_reference_id="GJ-RC-551203").one().payload
    ctx.db.add(ExternalRecord(family_id=fam.family_id, member_id=ramesh.member_id, source_system="RATION_PDS", record_type="HOUSEHOLD",
                              external_reference_id="GJ-RC-551203", fetched_data=ration_payload, match_status="MATCHED",
                              match_score=Decimal("100.00"), last_verified_at=c + timedelta(hours=2), created_at=c, updated_at=c))
    add_case(ctx, fam, "FAMILY_VERIFICATION", "Family submitted for verification", status="APPROVED",
             resolution="Documents verified in person; Family ID issued.", created_at=c + timedelta(days=1))
    ctx.ramesh = {"family": fam, "ramesh": ramesh, "meena": meena, "arjun": arjun, "priya": priya, "kanu": kanu}


def seed_duplicate_demo(ctx: Ctx) -> None:
    """Rajesh Kumar (verified, Aadhaar linked) versus Rakesh Kumar (pending, no Aadhaar): same DOB and father."""
    fam_a = new_family(ctx, "Rajkot", status="VERIFIED", income_category="BPL", annual_income=210000, ration="BPL",
                       declared=4, created_days_ago=44, place=("Rajkot", "Kuvadva"))
    c = fam_a.created_at
    rajesh = add_member(ctx, fam_a, "Rajesh Kumar", date(1978, 6, 15), "MALE", aadhaar="556677881234", is_head=True,
                        father_or_husband="Shantilal Kumar", marital="MARRIED", occupation="Mason", education="Secondary",
                        income=210000, bank_linked=True, mobile=random_mobile(), verified=True, created_at=c)
    sunita = add_member(ctx, fam_a, "Sunita Kumar", date(1982, 10, 5), "FEMALE", aadhaar=True, father_or_husband="Rajesh Kumar",
                        marital="MARRIED", occupation="Homemaker", education="Primary", verified=True, created_at=c)
    son = add_member(ctx, fam_a, "Vikas Kumar", dob_for_age(16), "MALE", aadhaar=True, father_or_husband="Rajesh Kumar",
                     marital="SINGLE", education="Class 11", is_student=True, verified=True, created_at=c)
    dau = add_member(ctx, fam_a, "Nidhi Kumar", dob_for_age(9), "FEMALE", aadhaar=None, father_or_husband="Rajesh Kumar",
                     marital="SINGLE", education="Class 4", is_student=True, verified=True, created_at=c)
    fam_a.family_head_id = rajesh.member_id
    link(ctx, rajesh, sunita, "SPOUSE", True)
    for ch in (son, dau):
        link(ctx, rajesh, ch, "FATHER", True)
        link(ctx, sunita, ch, "MOTHER", True)
    link(ctx, son, dau, "BROTHER", True)
    add_document(ctx, fam_a, "ADDRESS_PROOF")
    add_document(ctx, fam_a, "RATION_CARD")
    add_document(ctx, fam_a, "INCOME_CERTIFICATE")
    add_document(ctx, fam_a, "EDUCATION_RECORD", member=son)
    add_case(ctx, fam_a, "FAMILY_VERIFICATION", "Family submitted for verification", status="APPROVED",
             resolution="Verified.", created_at=c + timedelta(days=1))
    ctx.rajesh = {"family": fam_a, "head": rajesh}

    fam_b = new_family(ctx, "Rajkot", status="PENDING_VERIFICATION", income_category="BPL", annual_income=150000, ration="BPL",
                       declared=3, created_days_ago=6, place=("Gondal", "Ribda"))
    c = fam_b.created_at
    rakesh = add_member(ctx, fam_b, "Rakesh Kumar", date(1978, 6, 15), "MALE", aadhaar=None, is_head=True,
                        father_or_husband="Shantilal Kumar", marital="MARRIED", occupation="Daily wage labourer", education="Primary",
                        income=150000, mobile=random_mobile(), identity_source="MANUAL", created_at=c)
    wife = add_member(ctx, fam_b, "Rekha Kumar", date(1983, 3, 9), "FEMALE", aadhaar=None, father_or_husband="Rakesh Kumar",
                      marital="MARRIED", occupation="Homemaker", identity_source="MANUAL", created_at=c)
    kid = add_member(ctx, fam_b, "Meet Kumar", dob_for_age(7), "MALE", aadhaar=None, father_or_husband="Rakesh Kumar",
                     marital="SINGLE", education="Class 2", is_student=True, identity_source="MANUAL", created_at=c)
    fam_b.family_head_id = rakesh.member_id
    link(ctx, rakesh, wife, "SPOUSE")
    link(ctx, rakesh, kid, "FATHER")
    link(ctx, wife, kid, "MOTHER")
    add_document(ctx, fam_b, "ADDRESS_PROOF", status="PENDING")
    add_case(ctx, fam_b, "DUPLICATE_PERSON",
             f"Head Rakesh Kumar resembles existing member Rajesh Kumar of family {fam_a.family_code}",
             member=rakesh, priority="HIGH", related_family=fam_a, related_member=rajesh, created_at=c + timedelta(hours=1),
             evidence={"score": 0.82, "level": "REVIEW", "candidate_family_code": fam_a.family_code,
                       "reasons": ["Name is a probable spelling variant (similarity 0.71)", "Date of birth is identical",
                                   "Father/husband name matches", "Same district"],
                       "comparison": {"entered": {"name": "Rakesh Kumar", "date_of_birth": "1978-06-15", "father_or_husband_name": "Shantilal Kumar", "aadhaar_linked": False},
                                      "existing": {"name": "Rajesh Kumar", "date_of_birth": "1978-06-15", "father_or_husband_name": "Shantilal Kumar", "aadhaar_linked": True}}})
    add_case(ctx, fam_b, "FAMILY_VERIFICATION", "Family submitted for verification", created_at=c + timedelta(hours=2))
    ctx.rakesh = {"family": fam_b, "head": rakesh}


def gen_generic_family(ctx: Ctx, idx: int, status: str, district: str, flavour: str | None) -> Family:
    surname = SURNAMES[idx % len(SURNAMES)]
    income_category = RNG.choice(["BPL", "BPL", "APL", "AAY", "APL"])
    lo, hi = INCOME_BANDS[income_category]
    annual_income = RNG.randint(lo // 1000, hi // 1000) * 1000
    ration = income_category if income_category in ("BPL", "AAY") else RNG.choice(["APL", None])
    joint = flavour == "joint" or RNG.random() < 0.25
    created_days = {"VERIFIED": RNG.uniform(12, 85), "PENDING_VERIFICATION": RNG.uniform(1, 10), "DRAFT": RNG.uniform(0.5, 6),
                    "REJECTED": RNG.uniform(15, 50), "MERGED": RNG.uniform(40, 80)}[status]
    notes = "Owns house (pucca)" if RNG.random() < 0.3 else None
    fam = new_family(ctx, district, status=status, income_category=income_category, annual_income=annual_income, ration=ration,
                     family_type="JOINT" if joint else ("SINGLE" if flavour == "widow" and RNG.random() < 0.3 else "NUCLEAR"),
                     created_days_ago=created_days, notes=notes)
    c = fam.created_at
    verified = status == "VERIFIED"
    aad = lambda: True if RNG.random() < 0.55 else None  # noqa: E731  about half of members carry an Aadhaar reference
    members: list[FamilyMember] = []
    children: list[FamilyMember] = []

    if flavour == "widow":
        head_age = RNG.randint(48, 62)
        head = add_member(ctx, fam, f"{RNG.choice(FEMALE_NAMES)} {surname}", dob_for_age(head_age), "FEMALE", aadhaar=aad(), is_head=True,
                          father_or_husband=f"Late {RNG.choice(MALE_NAMES)} {surname}", marital="WIDOWED", occupation=RNG.choice(OCCUPATIONS),
                          education=RNG.choice(EDUCATION[:3]), income=annual_income, bank_linked=True, mobile=random_mobile(), verified=verified, created_at=c)
        spouse = None
    else:
        head_age = RNG.randint(28, 60)
        head = add_member(ctx, fam, f"{RNG.choice(MALE_NAMES)} {surname}", dob_for_age(head_age), "MALE", aadhaar=aad(), is_head=True,
                          father_or_husband=f"{RNG.choice(MALE_NAMES)} {surname}", marital="MARRIED", occupation=RNG.choice(OCCUPATIONS[:-2]),
                          education=RNG.choice(EDUCATION), income=annual_income, bank_linked=RNG.random() < 0.7, mobile=random_mobile(),
                          verified=verified, created_at=c)
        spouse_age = head_age - RNG.randint(1, 5)
        spouse = add_member(ctx, fam, f"{RNG.choice(FEMALE_NAMES)} {surname}", dob_for_age(spouse_age), "FEMALE", aadhaar=aad(),
                            father_or_husband=head.name, marital="MARRIED", occupation=RNG.choice(["Homemaker", "Anganwadi worker", "Tailor", "Daily wage labourer"]),
                            education=RNG.choice(EDUCATION[:4]), bank_linked=RNG.random() < 0.5,
                            pregnant=(flavour == "pregnant") or (spouse_age < 34 and RNG.random() < 0.15), verified=verified, created_at=c)
        link(ctx, head, spouse, "SPOUSE", verified)
    fam.family_head_id = head.member_id
    members += [head] + ([spouse] if spouse else [])

    # children: ages consistent with parents (youngest parent at least 19 years older)
    parent_age = min(head_age, head_age - 5 if spouse else head_age)
    max_child_age = max(0, parent_age - 19)
    n_children = 0 if max_child_age < 1 else RNG.choice([1, 1, 2, 2, 2, 3])
    for _ in range(n_children):
        age = RNG.randint(0, min(max_child_age, 24))
        gender = RNG.choice(["MALE", "FEMALE"])
        first = RNG.choice(BOY_NAMES if gender == "MALE" else GIRL_NAMES)
        student = 5 <= age <= 22 and RNG.random() < 0.85
        child = add_member(ctx, fam, f"{first} {surname}", dob_for_age(age), gender, aadhaar=aad() if age >= 5 else None,
                           father_or_husband=head.name if head.gender == "MALE" else head.father_or_husband_name.replace("Late ", ""),
                           marital="SINGLE", education=f"Class {min(12, max(1, age - 5))}" if student and age < 18 else ("Graduate" if student else None),
                           is_student=student, identity_source=None if age >= 5 else "BIRTH_CERTIFICATE", verified=verified, created_at=c)
        children.append(child)
    if flavour == "newborn":
        nb_gender = RNG.choice(["MALE", "FEMALE"])
        nb = add_member(ctx, fam, f"{RNG.choice(BOY_NAMES if nb_gender == 'MALE' else GIRL_NAMES)} {surname}", TODAY - timedelta(days=RNG.randint(12, 50)),
                        nb_gender, aadhaar=None, father_or_husband=head.name, marital="SINGLE", identity_source="BIRTH_CERTIFICATE",
                        member_status="PROVISIONAL", created_at=days_ago(5))
        children.append(nb)
        ctx.newborn = nb
        ev = LifeEvent(family_id=fam.family_id, member_id=nb.member_id, related_member_id=spouse.member_id if spouse else None, event_type="BIRTH",
                       event_date=nb.date_of_birth, details={"newborn_name": nb.name, "father": head.name, "mother": spouse.name if spouse else None,
                                                             "place_of_birth": f"Community Health Centre, {fam.taluka}"},
                       verification_status="VERIFIED", applied=True, reported_by_user_id=ctx.users["operator"].user_id,
                       created_at=days_ago(5), updated_at=days_ago(3))
        ctx.db.add(ev)
        ctx.db.flush()
        add_case(ctx, fam, "LIFE_EVENT", f"Birth reported: {nb.name}", member=nb, status="APPROVED", life_event_id=ev.event_id,
                 resolution="Birth certificate verified; newborn added as provisional member.", created_at=days_ago(5))
        add_document(ctx, fam, "BIRTH_CERTIFICATE", member=nb, status="VERIFIED")
    for ch in children:
        if head.gender == "MALE":
            link(ctx, head, ch, "FATHER", verified)
        else:
            link(ctx, head, ch, "MOTHER", verified)
        if spouse:
            link(ctx, spouse, ch, "MOTHER", verified)
    for i in range(len(children)):
        for j in range(i + 1, len(children)):
            link(ctx, children[i], children[j], "BROTHER" if children[i].gender == "MALE" else "SISTER", verified)
    members += children

    # grandparents for joint families
    if joint and head.gender == "MALE" and len(members) <= 5:
        gf_age = head_age + RNG.randint(24, 30)
        gf = add_member(ctx, fam, f"{RNG.choice(MALE_NAMES)}bhai {surname}", dob_for_age(gf_age), "MALE", aadhaar=aad(),
                        father_or_husband=f"{RNG.choice(MALE_NAMES)} {surname}", marital="MARRIED", occupation="Retired", education=RNG.choice(EDUCATION[:2]),
                        bank_linked=True, verified=verified, created_at=c)
        link(ctx, gf, head, "FATHER", verified)
        for ch in children:
            link(ctx, gf, ch, "GRANDFATHER", verified)
        members.append(gf)
        if len(members) < 7 and RNG.random() < 0.8:
            gm = add_member(ctx, fam, f"{RNG.choice(FEMALE_NAMES)}ben {surname}", dob_for_age(gf_age - RNG.randint(2, 6)), "FEMALE", aadhaar=aad(),
                            father_or_husband=gf.name, marital="MARRIED", occupation="Homemaker", education="Illiterate", verified=verified, created_at=c)
            link(ctx, gf, gm, "SPOUSE", verified)
            link(ctx, gm, head, "MOTHER", verified)
            for ch in children:
                link(ctx, gm, ch, "GRANDMOTHER", verified)
            members.append(gm)
        else:
            gf.marital_status = "WIDOWED"
    if len(members) < 2:  # a lone head is not a family for the demo; add a dependent sibling
        sib = add_member(ctx, fam, f"{RNG.choice(MALE_NAMES)} {surname}", dob_for_age(head_age - 4), "MALE", aadhaar=aad(),
                         father_or_husband=head.father_or_husband_name, marital="SINGLE", occupation=RNG.choice(OCCUPATIONS), verified=verified, created_at=c)
        link(ctx, sib, head, "BROTHER", verified)
        members.append(sib)

    # disability
    if flavour == "disability" or RNG.random() < 0.12:
        target = RNG.choice([m for m in members if (TODAY - m.date_of_birth).days > 365 * 8])
        target.disability_type, target.disability_percentage = RNG.choice(DISABILITIES)
        target.udid_reference = f"GJ{RNG.randint(10**15, 10**16 - 1)}"
        if verified:
            add_document(ctx, fam, "DISABILITY_CERTIFICATE", member=target, status="VERIFIED" if RNG.random() < 0.8 else "PENDING")
    fam.declared_member_count = len(members)

    # documents and cases per status
    if verified:
        add_document(ctx, fam, "ADDRESS_PROOF")
        if ration in ("BPL", "AAY"):
            add_document(ctx, fam, "RATION_CARD", status="VERIFIED" if RNG.random() < 0.85 else "PENDING")
        if RNG.random() < 0.75:
            add_document(ctx, fam, "INCOME_CERTIFICATE", status="VERIFIED" if RNG.random() < 0.85 else "PENDING")
        for ch in children:
            age = (TODAY - ch.date_of_birth).days // 365
            if age < 6 and ch is not ctx.newborn and RNG.random() < 0.8:
                add_document(ctx, fam, "BIRTH_CERTIFICATE", member=ch, status="VERIFIED" if RNG.random() < 0.7 else "PENDING")
            if ch.is_student and RNG.random() < 0.6:
                add_document(ctx, fam, "EDUCATION_RECORD", member=ch, status="VERIFIED" if RNG.random() < 0.75 else "PENDING")
        add_case(ctx, fam, "FAMILY_VERIFICATION", "Family submitted for verification", status="APPROVED", resolution="Verified.")
    elif status == "PENDING_VERIFICATION":
        add_document(ctx, fam, "ADDRESS_PROOF", status="PENDING")
        if RNG.random() < 0.5:
            add_document(ctx, fam, "RATION_CARD", status="PENDING")
        add_case(ctx, fam, "FAMILY_VERIFICATION", "Family submitted for verification", status=RNG.choice(["OPEN", "OPEN", "ASSIGNED"]),
                 priority=RNG.choice(["NORMAL", "NORMAL", "HIGH"]))
    elif status == "REJECTED":
        add_document(ctx, fam, "ADDRESS_PROOF", status="REJECTED")
        add_case(ctx, fam, "FAMILY_VERIFICATION", "Family submitted for verification", status="REJECTED",
                 resolution="Address proof does not belong to the declared head of family.")
    elif status == "DRAFT" and RNG.random() < 0.5:
        add_document(ctx, fam, "ADDRESS_PROOF", status="PENDING")
    return fam


def seed_generic_families(ctx: Ctx) -> None:
    plan = (["VERIFIED"] * 29) + (["PENDING_VERIFICATION"] * 7) + (["DRAFT"] * 3) + (["REJECTED"] * 2) + ["MERGED"]
    flavours = {0: "joint", 1: "widow", 2: "newborn", 3: "disability", 4: "pregnant", 5: "joint", 9: "widow", 14: "disability", 29: "joint"}
    merged_source = None
    for i, status in enumerate(plan):
        district = DISTRICTS[i % len(DISTRICTS)]
        if status == "MERGED":
            merged_source = gen_generic_family(ctx, i, status, district, None)
            continue
        fam = gen_generic_family(ctx, i, status, district, flavours.get(i))
        if status == "PENDING_VERIFICATION" and ctx.mismatch_member is None:
            head = next(m for m in ctx.members_by_family[fam.family_id] if m.is_head)
            if not head.aadhaar_reference:
                digits = random_aadhaar()
                head.aadhaar_reference = f"AAD-{hash_ref(digits)}"
                head.aadhaar_last4 = digits[-4:]
                head.identity_source = "AADHAAR"
                head.verification_status = "PARTIAL"
            head.name = f"Mukesh {head.name.split()[-1]}"
            head.name_normalized = normalize_name(head.name)
            ctx.mismatch_member = head
    # merge: the MERGED family's members move to a verified family of the same district (mirrors services.life_events.merge_families)
    target = next(f for f in ctx.families if f.family_status == "VERIFIED" and f.district == merged_source.district
                  and len(ctx.members_by_family[f.family_id]) <= 4)
    moved = ctx.members_by_family.pop(merged_source.family_id)
    for m in moved:
        m.previous_family_id = merged_source.family_id
        m.family_id = target.family_id
        m.is_head = False
        m.verification_status = "VERIFIED"
        ctx.members_by_family[target.family_id].append(m)
    merged_source.merged_into_family_id = target.family_id
    merged_source.family_status = "MERGED"
    merged_source.notes = f"Merged into {target.family_code} after officer review (duplicate household)."
    add_case(ctx, merged_source, "DUPLICATE_FAMILY", f"Household overlaps with {target.family_code}", status="CLOSED",
             related_family=target, resolution=f"Merged into {target.family_code}.")
    ctx.db.flush()


def seed_mismatch_demo(ctx: Ctx) -> None:
    """Officer demo: entered details differ from the Aadhaar demographic record -> AADHAAR_MISMATCH case."""
    m = ctx.mismatch_member
    fam = ctx.db.get(Family, m.family_id)
    payload = ctx.db.query(MockSourceRecord).filter(MockSourceRecord.source_system == "AADHAAR",
                                                    MockSourceRecord.lookup_keys["mobile"].astext == m.mobile_number).one().payload
    ctx.db.add(Consent(member_id=m.member_id, user_id=ctx.users["operator"].user_id, data_source="AADHAAR",
                       purpose="Verify identity for Family ID enrolment", consent_status="GRANTED"))
    ctx.db.add(ExternalRecord(family_id=fam.family_id, member_id=m.member_id, source_system="AADHAAR", record_type="DEMOGRAPHIC",
                              external_reference_id="UID-XXXX-XXXX-" + (m.aadhaar_last4 or "9081"), fetched_data=payload,
                              match_status="MISMATCH", match_score=Decimal("40.00"), last_verified_at=NOW))
    add_case(ctx, fam, "AADHAAR_MISMATCH", f"{m.name}: details differ from AADHAAR record UID-XXXX-XXXX-{m.aadhaar_last4}", member=m,
             priority="HIGH", evidence={"entered": {"name": m.name, "date_of_birth": str(m.date_of_birth), "gender": m.gender},
                                        "fetched": payload, "match_score": 40.0})


# ---------------------------------------------------------------------------------------------------- 5. eligibility


def run_eligibility(ctx: Ctx) -> int:
    from app.services.eligibility import recalculate_family  # imported here to avoid import cycles at module load

    ctx.db.commit()
    n = 0
    for fam in ctx.db.query(Family).filter(Family.family_status.in_(["VERIFIED", "PENDING_VERIFICATION"])).all():
        ctx.db.refresh(fam)
        n += len(recalculate_family(ctx.db, fam, None))
    ctx.db.commit()
    return n


# ---------------------------------------------------------------------------------------------------- 6. applications


def _prefill(ctx: Ctx, fam: Family, member: FamilyMember | None) -> dict:
    head = next((m for m in ctx.members_by_family[fam.family_id] if m.is_head), None)
    who = member or head
    addr = ctx.db.get(Address, fam.address_id) if fam.address_id else None
    return {"name": who.name if who else None, "date_of_birth": str(who.date_of_birth) if who and who.date_of_birth else None,
            "gender": who.gender if who else None, "address": addr.address_line if addr else None, "district": fam.district,
            "income": float(fam.annual_income) if fam.annual_income is not None else None, "income_category": fam.income_category,
            "family_code": fam.family_code, "aadhaar_linked": bool(who and who.aadhaar_reference), "head_name": head.name if head else None}


def create_application(ctx: Ctx, fam: Family, scheme: Scheme, member: FamilyMember | None, status: str, submitted_days_ago: float,
                       delivery_status: str | None = None) -> tuple[BenefitApplication, BenefitRecord | None]:
    citizen = ctx.users["ramesh"] if fam.family_id == ctx.ramesh["family"].family_id else ctx.users["operator"]
    officer = ctx.users["dept"]
    submitted = days_ago(submitted_days_ago)
    history = [{"status": "SUBMITTED", "at": submitted.isoformat(), "by": citizen.name, "note": "Application submitted with verified Family ID data."}]
    app = BenefitApplication(application_number=generate_number(ctx.db, "APP"), family_id=fam.family_id,
                             member_id=member.member_id if member else None, scheme_id=scheme.scheme_id, application_status=status,
                             prefilled_data=_prefill(ctx, fam, member), attached_document_ids=[], submitted_at=submitted,
                             created_at=submitted, updated_at=submitted)
    t = submitted
    if status in ("UNDER_REVIEW", "INFO_REQUESTED", "APPROVED", "REJECTED"):
        t += timedelta(days=RNG.randint(1, 3))
        app.reviewed_by_user_id = officer.user_id
        history.append({"status": "UNDER_REVIEW", "at": t.isoformat(), "by": officer.name, "note": "Taken up for review."})
    if status == "INFO_REQUESTED":
        t += timedelta(days=1)
        app.officer_remarks = "Please upload a recent income certificate (older than one year)."
        history.append({"status": "INFO_REQUESTED", "at": t.isoformat(), "by": officer.name, "note": app.officer_remarks})
    if status == "REJECTED":
        t += timedelta(days=1)
        app.rejected_at = t
        app.rejection_reason = "Declared income exceeds the scheme ceiling after cross-check with the income certificate."
        history.append({"status": "REJECTED", "at": t.isoformat(), "by": officer.name, "note": app.rejection_reason})
    benefit = None
    if status == "APPROVED":
        t += timedelta(days=RNG.randint(1, 2))
        app.approved_at = t
        app.officer_remarks = "Eligibility confirmed; benefit sanctioned."
        history.append({"status": "APPROVED", "at": t.isoformat(), "by": officer.name, "note": app.officer_remarks})
        chain = ["SANCTIONED", "DISBURSED", "DELIVERED", "RECEIVED_CONFIRMED"]
        final = delivery_status or "SANCTIONED"
        steps = chain[: chain.index(final) + 1] if final in chain else ["SANCTIONED", "DISBURSED", "NOT_RECEIVED"]
        log_rows, last = [], t
        for s in steps:
            last += timedelta(days=RNG.randint(1, 4))
            by = citizen.name if s in ("RECEIVED_CONFIRMED", "NOT_RECEIVED") else officer.name
            note = {"SANCTIONED": "Benefit sanctioned by department.", "DISBURSED": "Amount released to bank / fair price shop.",
                    "DELIVERED": "Delivery reported by the field office.", "RECEIVED_CONFIRMED": "Citizen confirmed receipt.",
                    "NOT_RECEIVED": "Citizen reported that the benefit was not received."}[s]
            log_rows.append({"status": s, "at": last.isoformat(), "by": by, "note": note,
                             "reference": f"PFMS-{RNG.randint(10**9, 10**10 - 1)}" if s == "DISBURSED" else None})
        benefit = BenefitRecord(family_id=fam.family_id, member_id=member.member_id if member else None, scheme_id=scheme.scheme_id,
                                application_id=app.application_id, benefit_status="ACTIVE", delivery_status=final,
                                benefit_amount=scheme.benefit_amount, start_date=t.date(), delivery_log=log_rows, last_delivery_at=last,
                                citizen_confirmed_at=last if final == "RECEIVED_CONFIRMED" else None, created_at=t, updated_at=last)
    app.status_history = history
    app.updated_at = t
    ctx.db.add(app)
    ctx.db.flush()
    if benefit:
        ctx.db.add(benefit)
        ctx.db.flush()
        if benefit.delivery_status == "NOT_RECEIVED" and ctx.not_received_benefit is None:
            ctx.not_received_benefit = benefit
    return app, benefit


def seed_applications(ctx: Ctx) -> None:
    r = ctx.ramesh
    create_application(ctx, r["family"], ctx.schemes["GJ-SCH-002"], r["priya"], "APPROVED", 40, delivery_status="DELIVERED")
    create_application(ctx, r["family"], ctx.schemes["GJ-SCH-001"], r["arjun"], "SUBMITTED", 2)

    rows = (ctx.db.query(SchemeEligibility, Family, Scheme)
            .join(Family, Family.family_id == SchemeEligibility.family_id).join(Scheme, Scheme.scheme_id == SchemeEligibility.scheme_id)
            .filter(SchemeEligibility.eligibility_status == "ELIGIBLE", Family.family_status == "VERIFIED",
                    Family.family_id != r["family"].family_id)
            .order_by(Family.created_at, Scheme.scheme_code, SchemeEligibility.member_id).all())
    by_family: dict = {}
    for el, fam, sch in rows:
        by_family.setdefault(fam.family_id, []).append((el, fam, sch))
    statuses = ["APPROVED", "SUBMITTED", "APPROVED", "UNDER_REVIEW", "APPROVED", "REJECTED", "APPROVED", "INFO_REQUESTED",
                "APPROVED", "SUBMITTED", "APPROVED", "UNDER_REVIEW", "APPROVED", "REJECTED", "APPROVED", "SUBMITTED", "APPROVED",
                "UNDER_REVIEW", "APPROVED", "INFO_REQUESTED", "APPROVED", "SUBMITTED", "APPROVED"]
    deliveries = ["SANCTIONED", "DISBURSED", "DELIVERED", "RECEIVED_CONFIRMED", "NOT_RECEIVED"]
    used_pairs: set = set()
    picked = []
    # round-robin across families so that applications spread over districts and schemes
    fam_ids = list(by_family.keys())
    turn = 0
    while len(picked) < len(statuses) and fam_ids:
        fid = fam_ids[turn % len(fam_ids)]
        options = [o for o in by_family[fid] if (o[1].family_id, o[2].scheme_id, o[0].member_id) not in used_pairs]
        if options:
            choice = options[(turn // len(fam_ids)) % len(options)]
            used_pairs.add((choice[1].family_id, choice[2].scheme_id, choice[0].member_id))
            picked.append(choice)
        turn += 1
        if turn > 500:
            break
    approved_i = 0
    for (el, fam, sch), status in zip(picked, statuses):
        member = ctx.db.get(FamilyMember, el.member_id) if el.member_id else None
        delivery = None
        if status == "APPROVED":
            delivery = deliveries[approved_i % len(deliveries)]
            approved_i += 1
        create_application(ctx, fam, sch, member, status, RNG.uniform(1, 29), delivery_status=delivery)
    ctx.db.flush()


# ---------------------------------------------------------------------------------------------------- 7. grievances


def add_grievance(ctx: Ctx, fam: Family, category: str, description: str, status: str, created_days_ago: float, *,
                  member: FamilyMember | None = None, benefit: BenefitRecord | None = None, application: BenefitApplication | None = None,
                  scheme: Scheme | None = None, priority: str = "NORMAL", escalation: int = 0, resolution: str | None = None,
                  rating: int | None = None) -> Grievance:
    created = days_ago(created_days_ago)
    citizen = "Citizen (Family ID portal)"
    officer = ctx.users["dept"]
    history = [{"status": "OPEN", "at": created.isoformat(), "by": citizen, "note": "Grievance registered."}]
    t = created
    if status in ("IN_PROGRESS", "ESCALATED", "RESOLVED"):
        t += timedelta(days=1)
        history.append({"status": "IN_PROGRESS", "at": t.isoformat(), "by": officer.name, "note": "Assigned to department officer."})
    if status == "ESCALATED":
        t += timedelta(days=3)
        history.append({"status": "ESCALATED", "at": t.isoformat(), "by": "system", "note": "Escalated: no resolution within SLA."})
    if status == "RESOLVED":
        t += timedelta(days=RNG.randint(1, 3))
        history.append({"status": "RESOLVED", "at": t.isoformat(), "by": officer.name, "note": resolution})
    g = Grievance(grievance_number=generate_number(ctx.db, "GRV"), family_id=fam.family_id, member_id=member.member_id if member else None,
                  application_id=application.application_id if application else None, benefit_id=benefit.benefit_id if benefit else None,
                  scheme_id=scheme.scheme_id if scheme else None, category=category, description=description, status=status,
                  priority=priority, escalation_level=escalation, department=scheme.department if scheme else None,
                  assigned_officer_id=officer.user_id if status != "OPEN" else None, resolution=resolution,
                  resolved_at=t if status == "RESOLVED" else None, due_at=created + timedelta(days=7), citizen_rating=rating,
                  history=history, created_at=created, updated_at=t)
    ctx.db.add(g)
    ctx.db.flush()
    return g


def seed_grievances(ctx: Ctx) -> None:
    r = ctx.ramesh
    benefits = ctx.db.query(BenefitRecord).all()
    apps = ctx.db.query(BenefitApplication).order_by(BenefitApplication.created_at).all()
    scheme_by_id = {s.scheme_id: s for s in ctx.schemes.values()}
    nr = ctx.not_received_benefit
    if nr:
        add_grievance(ctx, ctx.db.get(Family, nr.family_id), "BENEFIT_NOT_RECEIVED",
                      f"The {scheme_by_id[nr.scheme_id].scheme_name} amount shows as disbursed but nothing has been credited to our account.",
                      "IN_PROGRESS", 5, benefit=nr, scheme=scheme_by_id[nr.scheme_id], priority="HIGH",
                      member=ctx.db.get(FamilyMember, nr.member_id) if nr.member_id else None)
    ramesh_app = next(a for a in apps if a.family_id == r["family"].family_id and a.application_status == "APPROVED")
    add_grievance(ctx, r["family"], "APPLICATION_DELAY", "Child Benefit application for my daughter was pending for more than two weeks without any update.",
                  "RESOLVED", 30, application=ramesh_app, scheme=ctx.schemes["GJ-SCH-002"], member=r["priya"],
                  resolution="Application was approved on review and the first instalment has been delivered.", rating=4)
    rejected = [a for a in apps if a.application_status == "REJECTED"]
    if rejected:
        a = rejected[0]
        add_grievance(ctx, ctx.db.get(Family, a.family_id), "WRONG_REJECTION",
                      "Our application was rejected citing income above the limit, but the verified income certificate shows Rs. 1,60,000.",
                      "ESCALATED", 12, application=a, scheme=scheme_by_id[a.scheme_id], priority="HIGH", escalation=1)
    delivered = [b for b in benefits if b.delivery_status == "DELIVERED" and b.family_id != r["family"].family_id]
    if delivered:
        b = delivered[0]
        add_grievance(ctx, ctx.db.get(Family, b.family_id), "WRONG_AMOUNT",
                      "The amount received is Rs. 500 less than the sanctioned amount shown on the portal.", "OPEN", 11,
                      benefit=b, scheme=scheme_by_id[b.scheme_id])  # overdue: due 7 days after creation
    pending_fam = next(f for f in ctx.families if f.family_status == "PENDING_VERIFICATION" and f is not ctx.rakesh["family"])
    add_grievance(ctx, pending_fam, "VERIFICATION_DELAY", "Family submitted for verification ten days ago; no officer has visited or called yet.",
                  "OPEN", 2)
    verified_fam = next(f for f in ctx.families if f.family_status == "VERIFIED" and f.family_id not in (r["family"].family_id,))
    add_grievance(ctx, verified_fam, "DATA_ERROR", "My mother's date of birth is recorded incorrectly on the Family ID; it should be 1961, not 1967.",
                  "IN_PROGRESS", 4)


# ---------------------------------------------------------------------------------------------------- 8. notifications + audit


def seed_notifications(ctx: Ctx) -> None:
    fam = ctx.ramesh["family"]
    user = ctx.users["ramesh"]
    rows = [
        ("FAMILY_ID_CREATED", "Family ID issued", f"Your Family ID {fam.family_code} has been issued after verification.", "/family", fam.verified_at, "READ"),
        ("APPLICATION_APPROVED", "Application approved", "Your Child Benefit application for Priya Patel has been approved.", "/applications", days_ago(36), "READ"),
        ("BENEFIT_STATUS", "Benefit delivered", "Child Benefit for Priya Patel has been marked as delivered. Please confirm receipt.", "/benefits", days_ago(28), "UNREAD"),
        ("NEW_SCHEME_AVAILABLE", "New scheme available", "Your family is eligible for Health Scheme. Apply from the schemes page.", "/schemes", days_ago(3), "UNREAD"),
        ("APPLICATION_SUBMITTED", "Application submitted", "Student Scholarship application for Arjun Patel has been submitted.", "/applications", days_ago(2), "UNREAD"),
        ("GRIEVANCE_RESOLVED", "Grievance resolved", "Your grievance about the Child Benefit delay has been resolved.", "/grievances", days_ago(25), "READ"),
    ]
    for ntype, title, message, link_, at, status in rows:
        ctx.db.add(Notification(family_id=fam.family_id, user_id=user.user_id, notification_type=ntype, title=title, message=message,
                                link=link_, status=status, sent_at=at))
    # officer inbox samples
    ctx.db.add(Notification(user_id=ctx.users["verifier"].user_id, notification_type="CASE_ASSIGNED", title="Case assigned",
                            message="A DUPLICATE_PERSON case in Rajkot has been assigned to you.", link="/verification", sent_at=days_ago(1)))


def seed_audit(ctx: Ctx) -> None:
    op, ver, dept, adm, ram = (ctx.users[k] for k in ("operator", "verifier", "dept", "admin", "ramesh"))
    fams = [f for f in ctx.families if f.family_status != "MERGED"]
    apps = ctx.db.query(BenefitApplication).all()
    docs = ctx.db.query(Document).all()
    r = ctx.ramesh
    rf = r["family"]
    # Ramesh's own timeline
    add_audit(ctx, ram, "FAMILY_CREATED", "FAMILY", rf.family_id, rf.family_id, {"district": "Ahmedabad", "declared_member_count": 5}, at=rf.created_at)
    for m in (r["ramesh"], r["meena"], r["arjun"], r["priya"], r["kanu"]):
        add_audit(ctx, ram, "MEMBER_ADDED", "MEMBER", m.member_id, rf.family_id, {"name": m.name, "aadhaar_linked": bool(m.aadhaar_reference)},
                  at=rf.created_at + timedelta(minutes=RNG.randint(5, 40)))
    add_audit(ctx, ram, "CONSENT_GRANTED", "CONSENT", None, rf.family_id, {"data_source": "RATION_PDS"}, at=rf.created_at + timedelta(hours=1))
    add_audit(ctx, ram, "EXTERNAL_FETCH", "EXTERNAL_RECORD", None, rf.family_id, {"source": "RATION_PDS", "match_status": "MATCHED"}, at=rf.created_at + timedelta(hours=2))
    add_audit(ctx, ram, "FAMILY_SUBMITTED", "FAMILY", rf.family_id, rf.family_id, {"status": "PENDING_VERIFICATION"}, at=rf.created_at + timedelta(days=1))
    add_audit(ctx, ver, "VERIFICATION_APPROVED", "FAMILY", rf.family_id, rf.family_id, {"family_code": rf.family_code}, {"status": "PENDING_VERIFICATION"}, at=rf.verified_at)
    add_audit(ctx, ram, "APPLICATION_SUBMITTED", "APPLICATION", None, rf.family_id, {"scheme": "Child Benefit", "member": "Priya Patel"}, at=days_ago(40))
    add_audit(ctx, dept, "BENEFIT_APPROVED", "APPLICATION", None, rf.family_id, {"scheme": "Child Benefit", "amount": 1500}, at=days_ago(37))
    add_audit(ctx, ram, "APPLICATION_SUBMITTED", "APPLICATION", None, rf.family_id, {"scheme": "Student Scholarship", "member": "Arjun Patel"}, at=days_ago(2))
    add_audit(ctx, ver, "OFFICER_ACCESS", "FAMILY", rf.family_id, rf.family_id, {"purpose": "Verification visit"}, at=days_ago(1.5))
    # spread across other families
    actions = ["FAMILY_CREATED", "MEMBER_ADDED", "MEMBER_ADDED", "DOCUMENT_UPLOADED", "DOCUMENT_UPLOADED", "VERIFICATION_APPROVED",
               "APPLICATION_SUBMITTED", "BENEFIT_APPROVED", "OFFICER_ACCESS", "OFFICER_ACCESS", "DATA_MODIFIED", "RELATIONSHIP_CHANGED"]
    for i in range(48):
        fam = fams[RNG.randrange(len(fams))]
        action = actions[i % len(actions)]
        at = days_ago(RNG.uniform(0, 30))
        members = ctx.members_by_family.get(fam.family_id, [])
        if action == "FAMILY_CREATED":
            add_audit(ctx, op, action, "FAMILY", fam.family_id, fam.family_id, {"district": fam.district}, at=at)
        elif action == "MEMBER_ADDED" and members:
            m = RNG.choice(members)
            add_audit(ctx, op, action, "MEMBER", m.member_id, fam.family_id, {"name": m.name, "aadhaar_linked": bool(m.aadhaar_reference)}, at=at)
        elif action == "DOCUMENT_UPLOADED":
            fd = [d for d in docs if d.family_id == fam.family_id]
            d = RNG.choice(fd) if fd else None
            add_audit(ctx, op, action, "DOCUMENT", d.document_id if d else None, fam.family_id, {"document_type": d.document_type if d else "ADDRESS_PROOF"}, at=at)
        elif action == "VERIFICATION_APPROVED":
            add_audit(ctx, ver, action, "FAMILY", fam.family_id, fam.family_id, {"family_code": fam.family_code}, {"status": "PENDING_VERIFICATION"}, at=at)
        elif action == "APPLICATION_SUBMITTED":
            fa = [a for a in apps if a.family_id == fam.family_id]
            add_audit(ctx, op, action, "APPLICATION", fa[0].application_id if fa else None, fam.family_id,
                      {"application_number": fa[0].application_number if fa else None}, at=at)
        elif action == "BENEFIT_APPROVED":
            fa = [a for a in apps if a.family_id == fam.family_id and a.application_status == "APPROVED"]
            add_audit(ctx, dept, action, "APPLICATION", fa[0].application_id if fa else None, fam.family_id,
                      {"application_number": fa[0].application_number if fa else None}, at=at)
        elif action == "OFFICER_ACCESS":
            add_audit(ctx, RNG.choice([ver, dept, adm]), action, "FAMILY", fam.family_id, fam.family_id, {"purpose": RNG.choice(["Case review", "Grievance review", "Audit"])}, at=at)
        elif action == "DATA_MODIFIED":
            add_audit(ctx, op, action, "FAMILY", fam.family_id, fam.family_id, {"annual_income": float(fam.annual_income or 0)}, {"annual_income": float(fam.annual_income or 0) - 10000}, at=at)
        elif action == "RELATIONSHIP_CHANGED" and len(members) >= 2:
            add_audit(ctx, op, action, "RELATIONSHIP", None, fam.family_id, {"member": members[0].name, "related": members[1].name, "type": "SPOUSE"}, at=at)
    add_audit(ctx, adm, "USER_CREATED", "USER", dept.user_id, None, {"role": "DEPARTMENT_OFFICER"}, at=days_ago(29))
    add_audit(ctx, adm, "SCHEME_UPDATED", "SCHEME", ctx.schemes["GJ-SCH-006"].scheme_id, None, {"status": "ACTIVE"}, at=days_ago(20))


# ---------------------------------------------------------------------------------------------------- orchestration


def reset_schema() -> None:
    for attempt in (1, 2):
        try:
            log("dropping all tables")
            Base.metadata.drop_all(bind=engine)
            return
        except Exception as exc:  # locks from a concurrently running API process
            if attempt == 2:
                raise
            log(f"drop_all failed ({exc.__class__.__name__}); retrying in 20 seconds")
            time.sleep(20)


def summary(db: Session) -> None:
    tables = [("Users", User), ("Schemes", Scheme), ("Mock source records", MockSourceRecord), ("Families", Family),
              ("Addresses", Address), ("Members", FamilyMember), ("Relationships", Relationship), ("Documents", Document),
              ("External records", ExternalRecord), ("Consents", Consent), ("Life events", LifeEvent),
              ("Verification cases", VerificationCase), ("Scheme eligibility rows", SchemeEligibility),
              ("Applications", BenefitApplication), ("Benefit records", BenefitRecord), ("Grievances", Grievance),
              ("Notifications", Notification), ("Audit log rows", AuditLog)]
    width = max(len(t) for t, _ in tables)
    print("\n" + "=" * (width + 10))
    print(f"{'Table':<{width}}   Count")
    print("-" * (width + 10))
    for label, model in tables:
        print(f"{label:<{width}}   {db.query(model).count():>5}")
    print("-" * (width + 10))
    for status, n in db.execute(text("select family_status, count(*) from family group by 1 order by 1")):
        print(f"  families {status:<22} {n:>5}")
    for status, n in db.execute(text("select eligibility_status, count(*) from scheme_eligibility group by 1 order by 1")):
        print(f"  eligibility {status:<19} {n:>5}")
    print("=" * (width + 10))


def main(argv: list[str]) -> int:
    reset = "--reset" in argv
    init_extensions()
    if reset:
        reset_schema()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).count() > 0 and not reset:
            log("users already exist; nothing to do (use --reset to rebuild the demo data)")
            summary(db)
            return 0
        ctx = Ctx(db)
        log("users"); seed_users(ctx)
        log("schemes"); seed_schemes(ctx)
        log("mock source systems"); seed_mock_sources(ctx)
        log("Ramesh Patel's family"); seed_ramesh_family(ctx)
        log("duplicate detection demo (Rajesh / Rakesh Kumar)"); seed_duplicate_demo(ctx)
        log("demo families"); seed_generic_families(ctx)
        log("dependent mock records + Aadhaar mismatch demo"); seed_mock_sources_dependent(ctx); seed_mismatch_demo(ctx)
        db.commit()
        log("eligibility"); n = run_eligibility(ctx); log(f"  {n} eligibility rows")
        log("applications and benefits"); seed_applications(ctx)
        log("grievances"); seed_grievances(ctx)
        log("notifications"); seed_notifications(ctx)
        log("audit log"); seed_audit(ctx)
        db.commit()
        log("done")
        summary(db)
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
