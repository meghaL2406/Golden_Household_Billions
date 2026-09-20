"""Officer dashboard, reports and map routers (/dashboard, /map)."""
import hashlib
from datetime import timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case, cast, Date, and_, distinct
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_officer
from app.models import (Family, FamilyMember, Address, VerificationCase, Scheme, SchemeEligibility, BenefitApplication,
                        BenefitRecord, Grievance, AuditLog, User)
from app.services.common import DISTRICT_CENTROIDS, utcnow
from .deps import serialize

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
map_router = APIRouter(prefix="/map", tags=["map"])
extra_routers = [map_router]

ACTIVE_MEMBER = ("ACTIVE", "PROVISIONAL")
OPEN_CASE = ("OPEN", "ASSIGNED", "INFO_REQUESTED")
OPEN_GRIEVANCE = ("OPEN", "IN_PROGRESS", "ESCALATED", "REOPENED")
LIVE_FAMILY = ("MERGED", "INACTIVE")


def _count(db: Session, model, *filters) -> int:
    return int(db.query(func.count()).select_from(model).filter(*filters).scalar() or 0)


# ------------------------------------------------------------------ dashboard
@router.get("/summary")
def summary(db: Session = Depends(get_db), user: User = Depends(require_officer)):
    return {
        "total_families": _count(db, Family, Family.family_status.notin_(LIVE_FAMILY)),
        "verified_families": _count(db, Family, Family.family_status == "VERIFIED"),
        "pending_verification": _count(db, Family, Family.family_status == "PENDING_VERIFICATION"),
        "duplicate_cases": _count(db, VerificationCase, VerificationCase.case_type.in_(["DUPLICATE_PERSON", "DUPLICATE_FAMILY"]),
                                  VerificationCase.case_status.in_(OPEN_CASE)),
        "active_members": _count(db, FamilyMember, FamilyMember.member_status.in_(ACTIVE_MEMBER)),
        "applications": _count(db, BenefitApplication),
        "approved_benefits": _count(db, BenefitApplication, BenefitApplication.application_status == "APPROVED"),
        "pending_cases": _count(db, VerificationCase, VerificationCase.case_status.in_(OPEN_CASE)),
        "open_grievances": _count(db, Grievance, Grievance.status.in_(OPEN_GRIEVANCE)),
        "benefits_delivered": _count(db, BenefitRecord, BenefitRecord.delivery_status.in_(["DELIVERED", "RECEIVED_CONFIRMED"])),
        "benefits_disputed": _count(db, BenefitRecord, BenefitRecord.delivery_status.in_(["DISPUTED", "NOT_RECEIVED"])),
        "provisional_members": _count(db, FamilyMember, FamilyMember.member_status == "PROVISIONAL"),
    }


@router.get("/reports/district")
def report_district(db: Session = Depends(get_db), user: User = Depends(require_officer)):
    fam_rows = (db.query(Family.district,
                         func.count(Family.family_id),
                         func.sum(case((Family.family_status == "VERIFIED", 1), else_=0)),
                         func.sum(case((Family.family_status == "PENDING_VERIFICATION", 1), else_=0)))
                .filter(Family.family_status.notin_(LIVE_FAMILY)).group_by(Family.district).all())
    members = dict(db.query(Family.district, func.count(FamilyMember.member_id))
                   .join(FamilyMember, FamilyMember.family_id == Family.family_id)
                   .filter(FamilyMember.member_status.in_(ACTIVE_MEMBER)).group_by(Family.district).all())
    apps = dict(db.query(Family.district, func.count(BenefitApplication.application_id))
                .join(BenefitApplication, BenefitApplication.family_id == Family.family_id).group_by(Family.district).all())
    bens = dict(db.query(Family.district, func.count(BenefitRecord.benefit_id))
                .join(BenefitRecord, BenefitRecord.family_id == Family.family_id).group_by(Family.district).all())
    out = []
    for district, families, verified, pending, in fam_rows:
        out.append({"district": district, "families": int(families or 0), "verified": int(verified or 0), "pending": int(pending or 0),
                    "members": int(members.get(district, 0)), "applications": int(apps.get(district, 0)), "benefits": int(bens.get(district, 0))})
    out.sort(key=lambda r: (-r["families"], r["district"] or ""))
    return out


@router.get("/reports/schemes")
def report_schemes(db: Session = Depends(get_db), user: User = Depends(require_officer)):
    def bucket(status):
        return func.sum(case((SchemeEligibility.eligibility_status == status, 1), else_=0))
    elig = {r[0]: r[1:] for r in db.query(SchemeEligibility.scheme_id, bucket("ELIGIBLE"), bucket("NEEDS_DOCUMENT"),
                                             bucket("UNDER_REVIEW"), bucket("NOT_ELIGIBLE")).group_by(SchemeEligibility.scheme_id).all()}
    apps = {r[0]: r[1:] for r in db.query(BenefitApplication.scheme_id, func.count(BenefitApplication.application_id),
                                             func.sum(case((BenefitApplication.application_status == "APPROVED", 1), else_=0)))
            .group_by(BenefitApplication.scheme_id).all()}
    delivered = dict(db.query(BenefitRecord.scheme_id, func.count(BenefitRecord.benefit_id))
                     .filter(BenefitRecord.delivery_status.in_(["DELIVERED", "RECEIVED_CONFIRMED"])).group_by(BenefitRecord.scheme_id).all())
    out = []
    for s in db.query(Scheme).order_by(Scheme.scheme_name).all():
        e = elig.get(s.scheme_id, (0, 0, 0, 0))
        a = apps.get(s.scheme_id, (0, 0))
        out.append({"scheme_id": str(s.scheme_id), "scheme_code": s.scheme_code, "scheme_name": s.scheme_name, "department": s.department,
                    "status": s.status, "eligible": int(e[0] or 0), "needs_document": int(e[1] or 0), "under_review": int(e[2] or 0),
                    "not_eligible": int(e[3] or 0), "applications": int(a[0] or 0), "approved": int(a[1] or 0),
                    "delivered": int(delivered.get(s.scheme_id, 0))})
    return out


@router.get("/reports/applications")
def report_applications(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db), user: User = Depends(require_officer)):
    since = utcnow() - timedelta(days=days)
    by_status = {k: int(v) for k, v in db.query(BenefitApplication.application_status, func.count(BenefitApplication.application_id))
                 .group_by(BenefitApplication.application_status).all()}
    day = cast(BenefitApplication.created_at, Date)
    rows = dict(db.query(day, func.count(BenefitApplication.application_id)).filter(BenefitApplication.created_at >= since).group_by(day).all())
    start = since.date()
    by_day = []
    for i in range(days + 1):
        d = start + timedelta(days=i)
        if d > utcnow().date():
            break
        by_day.append({"date": d.isoformat(), "count": int(rows.get(d, 0))})
    return {"by_status": by_status, "by_day": by_day, "days": days}


@router.get("/reports/benefits")
def report_benefits(db: Session = Depends(get_db), user: User = Depends(require_officer)):
    by_delivery = {k: int(v) for k, v in db.query(BenefitRecord.delivery_status, func.count(BenefitRecord.benefit_id)).group_by(BenefitRecord.delivery_status).all()}
    total_amount = float(db.query(func.coalesce(func.sum(BenefitRecord.benefit_amount), 0)).scalar() or 0)
    by_scheme = [{"scheme_id": str(sid), "scheme_name": name, "count": int(cnt), "amount": float(amt or 0)} for sid, name, cnt, amt in
                 db.query(Scheme.scheme_id, Scheme.scheme_name, func.count(BenefitRecord.benefit_id), func.sum(BenefitRecord.benefit_amount))
                 .join(BenefitRecord, BenefitRecord.scheme_id == Scheme.scheme_id).group_by(Scheme.scheme_id, Scheme.scheme_name)
                 .order_by(func.count(BenefitRecord.benefit_id).desc()).all()]
    return {"by_delivery_status": by_delivery, "total_amount": total_amount, "by_scheme": by_scheme}


@router.get("/reports/cases")
def report_cases(db: Session = Depends(get_db), user: User = Depends(require_officer)):
    by_type = {k: int(v) for k, v in db.query(VerificationCase.case_type, func.count(VerificationCase.case_id)).group_by(VerificationCase.case_type).all()}
    by_status = {k: int(v) for k, v in db.query(VerificationCase.case_status, func.count(VerificationCase.case_id)).group_by(VerificationCase.case_status).all()}
    seconds = db.query(func.avg(func.extract("epoch", VerificationCase.resolved_at - VerificationCase.created_at))).filter(
        VerificationCase.resolved_at.isnot(None)).scalar()
    avg_hours = round(float(seconds) / 3600, 1) if seconds is not None else None
    return {"by_type": by_type, "by_status": by_status, "avg_resolution_hours": avg_hours}


@router.get("/activity")
def activity(limit: int = Query(20, ge=1, le=200), db: Session = Depends(get_db), user: User = Depends(require_officer)):
    rows = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).all()
    out = []
    for r in rows:
        d = serialize(r)
        d["actor_label"] = r.actor_label or "system"
        out.append(d)
    return out


# ------------------------------------------------------------------ map
@map_router.get("/districts")
def map_districts(scheme_id: Optional[UUID] = None, db: Session = Depends(get_db), user: User = Depends(require_officer)):
    rows = (db.query(Family.district, func.count(Family.family_id), func.sum(case((Family.family_status == "VERIFIED", 1), else_=0)))
            .filter(Family.family_status.notin_(LIVE_FAMILY), Family.district.isnot(None)).group_by(Family.district).all())
    eligible = {}
    if scheme_id:
        eligible = dict(db.query(Family.district, func.count(distinct(SchemeEligibility.family_id)))
                        .join(SchemeEligibility, SchemeEligibility.family_id == Family.family_id)
                        .filter(SchemeEligibility.scheme_id == scheme_id, SchemeEligibility.eligibility_status == "ELIGIBLE")
                        .group_by(Family.district).all())
    out = []
    for district, families, verified in rows:
        centroid = DISTRICT_CENTROIDS.get(district)
        if centroid is None:
            continue
        item = {"district": district, "lat": centroid[0], "lng": centroid[1], "families": int(families or 0), "verified": int(verified or 0)}
        if scheme_id:
            item["eligible_families"] = int(eligible.get(district, 0))
        out.append(item)
    out.sort(key=lambda r: -r["families"])
    return out


def _jitter(family_id, scale: float = 0.003) -> tuple[float, float]:
    digest = hashlib.sha256(str(family_id).encode()).digest()
    a = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF
    b = int.from_bytes(digest[4:8], "big") / 0xFFFFFFFF
    return (a * 2 - 1) * scale, (b * 2 - 1) * scale


@map_router.get("/points")
def map_points(district: Optional[str] = None, taluka: Optional[str] = None, village: Optional[str] = None, status: Optional[str] = None,
               db: Session = Depends(get_db), user: User = Depends(require_officer)):
    member_count = (db.query(func.count(FamilyMember.member_id)).filter(FamilyMember.family_id == Family.family_id,
                                                                        FamilyMember.member_status.in_(ACTIVE_MEMBER)).correlate(Family).scalar_subquery())
    q = (db.query(Family.family_id, Family.family_code, Family.family_status, Family.district, Address.latitude, Address.longitude, member_count)
         .outerjoin(Address, and_(Address.family_id == Family.family_id, Address.is_current.is_(True)))
         .filter(Family.family_status.notin_(LIVE_FAMILY)))
    if district:
        q = q.filter(Family.district == district)
    if taluka:
        q = q.filter(Family.taluka == taluka)
    if village:
        q = q.filter(Family.village == village)
    if status:
        q = q.filter(Family.family_status == status)
    rows = q.order_by(Family.created_at.desc()).limit(2000).all()
    out, seen = [], set()
    for fid, code, fstatus, dist, lat, lng, count in rows:
        if fid in seen:
            continue  # more than one current address; keep the first
        seen.add(fid)
        dlat, dlng = _jitter(fid)
        if lat is not None and lng is not None:
            base_lat, base_lng = float(lat), float(lng)
        else:
            centroid = DISTRICT_CENTROIDS.get(dist)
            if centroid is None:
                continue
            base_lat, base_lng = centroid
            dlat, dlng = _jitter(fid, 0.03)  # spread district-level fallbacks more widely
        out.append({"family_ref": code or "Provisional", "family_code": code or "Provisional", "status": fstatus,
                    "member_count": int(count or 0), "lat": round(base_lat + dlat, 5), "lng": round(base_lng + dlng, 5)})
    return out


@map_router.get("/locations")
def map_locations(db: Session = Depends(get_db), user: User = Depends(require_officer)):
    rows = (db.query(Family.district, Family.taluka, Family.village).filter(Family.family_status.notin_(LIVE_FAMILY), Family.district.isnot(None))
            .distinct().order_by(Family.district, Family.taluka, Family.village).all())
    districts: list[str] = []
    talukas: dict[str, list[str]] = {}
    villages: dict[str, list[str]] = {}
    for d, t, v in rows:
        if d not in districts:
            districts.append(d)
        if t:
            talukas.setdefault(d, [])
            if t not in talukas[d]:
                talukas[d].append(t)
            if v:
                villages.setdefault(t, [])
                if v not in villages[t]:
                    villages[t].append(v)
    return {"districts": districts, "talukas": talukas, "villages": villages}
