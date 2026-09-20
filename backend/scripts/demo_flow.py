"""End-to-end check of the demo story against a running API (default http://localhost:8000).

Usage: .venv/bin/python scripts/demo_flow.py [base_url]
Requires the seeded database. Prints one line per step and exits non-zero on the first failure.
"""
import sys
import uuid
from datetime import date

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/") + "/api"
c = httpx.Client(base_url=BASE, timeout=30.0)
FAILURES = []


def step(label: str, ok: bool, detail: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {label}{(' — ' + detail) if detail else ''}")
    if not ok:
        FAILURES.append(label)


def login(identifier: str, channel: str = "MOBILE", name: str | None = None) -> str:
    r = c.post("/auth/request-otp", json={"channel": channel, "identifier": identifier})
    r.raise_for_status()
    code = r.json().get("dev_otp", "123456")
    r = c.post("/auth/verify-otp", json={"challenge_id": r.json()["challenge_id"], "code": code, "name": name})
    r.raise_for_status()
    return r.json()["token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def main() -> int:
    step("API is healthy", c.get("/health").status_code == 200)

    # ---------------------------------------------------------------- citizen with a seeded family
    ramesh = login("9876500001")
    me = c.get("/auth/me", headers=auth(ramesh)).json()
    step("Seeded citizen signs in with a mobile OTP", me["user"]["role"] == "CITIZEN", me["user"]["name"])
    fam = c.get("/families/mine", headers=auth(ramesh)).json()
    step("Verified family profile loads with a Family ID", bool(fam and fam.get("family_code")), str(fam and fam.get("family_code")))
    step("Household has members and relationships", len(fam["members"]) >= 3 and len(fam["relationships"]) >= 2,
         f"{len(fam['members'])} members, {len(fam['relationships'])} relationship rows")

    elig = c.get("/eligibility/mine", headers=auth(ramesh)).json()
    statuses = {i["eligibility_status"] for i in elig["items"]}
    step("Eligibility engine returns reasoned results", len(elig["items"]) > 0 and statuses, ", ".join(sorted(statuses)))
    step("Every eligibility row carries a plain reason", all(i.get("eligibility_reason") for i in elig["items"]))

    # ---------------------------------------------------------------- new citizen enrols, Aadhaar-free newborn
    mobile = f"98765{uuid.uuid4().int % 100000:05d}"
    fresh = login(mobile, name="Demo Citizen")
    search = c.get("/families/search-existing", params={"mobile": "9876500002"}, headers=auth(fresh)).json()
    step("Existing records are searched before enrolment", "existing_members" in search and "ration_records" in search,
         f"{len(search['ration_records'])} ration record(s)")

    created = c.post("/families", headers=auth(fresh), json={
        "declared_member_count": 3, "family_type": "NUCLEAR", "income_category": "BPL", "annual_income": 150000,
        "address": {"address_type": "PERMANENT", "address_line": "12 Station Road", "village": "Karamsad",
                    "taluka": "Anand", "district": "Anand", "pincode": "388325"},
        "head": {"name": "Demo Head", "date_of_birth": "1988-04-02", "gender": "MALE", "mobile_number": mobile,
                 "aadhaar_reference": "234512341234"},
    })
    step("New family enrolment starts", created.status_code == 201, str(created.status_code))
    fid = created.json()["family_id"]

    spouse = c.post(f"/families/{fid}/members", headers=auth(fresh), json={
        "name": "Demo Spouse", "date_of_birth": "1991-07-19", "gender": "FEMALE", "marital_status": "MARRIED",
        "aadhaar_reference": "876554321098",
        "relationship_type": "SPOUSE", "related_member_id": created.json()["family_head_id"],
    })
    step("Spouse is added with a relationship", spouse.status_code == 201, str(spouse.status_code))

    newborn = c.post("/life-events", headers=auth(fresh), json={
        "event_type": "BIRTH", "event_date": str(date.today()),
        "member_id": created.json()["family_head_id"], "related_member_id": spouse.json()["member_id"],
        "newborn": {"name": "Demo Newborn", "date_of_birth": str(date.today()), "gender": "FEMALE"},
    })
    step("Newborn is added without Aadhaar", newborn.status_code in (200, 201), str(newborn.status_code))
    if newborn.status_code in (200, 201):
        nb = newborn.json().get("member") or {}
        step("Newborn is provisional and sourced from the birth certificate",
             nb.get("member_status") == "PROVISIONAL" and not nb.get("aadhaar_linked"),
             f"{nb.get('member_status')}, identity source {nb.get('identity_source')}")

    submitted = c.post(f"/families/{fid}/submit", headers=auth(fresh))
    step("Family is submitted for verification", submitted.status_code == 200, str(submitted.status_code))

    # ---------------------------------------------------------------- officer verifies and issues the Family ID
    officer = login("9000000002")
    cases = c.get("/verification/cases", params={"status": "OPEN", "size": 100}, headers=auth(officer)).json()
    mine = [x for x in cases["items"] if x.get("family_id") == fid and x["case_type"] == "FAMILY_VERIFICATION"]
    step("Verification case reaches the officer queue", bool(mine), f"{cases['total']} open case(s) in total")
    if mine:
        detail = c.get(f"/verification/cases/{mine[0]['case_id']}", headers=auth(officer))
        step("Case detail returns the family and comparison view", detail.status_code == 200)
        acted = c.post(f"/verification/cases/{mine[0]['case_id']}/action", headers=auth(officer),
                       json={"action": "APPROVE", "resolution": "Records and documents verified."})
        step("Officer approves the family", acted.status_code == 200, str(acted.status_code))
        after = c.get(f"/families/{fid}", headers=auth(officer)).json()
        step("Unique Family ID is generated on approval", bool(after.get("family_code")), str(after.get("family_code")))

    # ---------------------------------------------------------------- duplicate identity is caught
    dup = c.post(f"/families/{fid}/members", headers=auth(fresh), json={
        "name": "Ramesh Patel", "date_of_birth": fam["members"][0]["date_of_birth"], "gender": "MALE",
        "aadhaar_reference": "111122223333",  # a different Aadhaar for the "same person, second identity" case
        "relationship_type": "BROTHER", "related_member_id": created.json()["family_head_id"],
    })
    flagged = dup.status_code == 409 or (dup.status_code == 201 and dup.json().get("duplicate_warnings"))
    step("A person already enrolled elsewhere is flagged, not silently duplicated", flagged, f"HTTP {dup.status_code}")

    # ---------------------------------------------------------------- benefit chain and grievance
    ben = c.get("/benefits/mine", headers=auth(ramesh)).json()
    ben = ben.get("items", ben) if isinstance(ben, dict) else ben
    step("Citizen can see benefit records with a delivery status", isinstance(ben, list),
         f"{len(ben) if isinstance(ben, list) else 0} benefit record(s)")
    target = next((b for b in ben if b.get("delivery_status") in ("DISBURSED", "DELIVERED")), None) if isinstance(ben, list) else None
    if target:
        conf = c.post(f"/benefits/{target['benefit_id']}/delivery", headers=auth(ramesh),
                      json={"status": "RECEIVED_CONFIRMED", "note": "Received in full."})
        step("Citizen confirms the benefit was received", conf.status_code == 200, str(conf.status_code))
    grv = c.post("/grievances", headers=auth(ramesh), json={
        "category": "APPLICATION_DELAY", "description": "The application has not moved for three weeks."})
    step("Grievance can be raised", grv.status_code in (200, 201), str(grv.status_code))
    if grv.status_code in (200, 201):
        gid = grv.json()["grievance_id"]
        dept = login("9000000003")
        res = c.post(f"/grievances/{gid}/action", headers=auth(dept),
                     json={"action": "RESOLVE", "note": "Application processed and approved."})
        step("Officer resolves the grievance", res.status_code == 200, str(res.status_code))

    # ---------------------------------------------------------------- dashboards, reports, map, audit
    summary = c.get("/dashboard/summary", headers=auth(officer))
    step("Officer dashboard summary loads", summary.status_code == 200,
         f"{summary.json().get('total_families')} families" if summary.status_code == 200 else "")
    for path in ("/dashboard/reports/district", "/dashboard/reports/schemes", "/dashboard/reports/applications",
                 "/dashboard/reports/benefits", "/dashboard/reports/cases", "/map/districts", "/map/points", "/map/locations"):
        step(f"Report endpoint {path} responds", c.get(path, headers=auth(officer)).status_code == 200)
    step("Audit log records the actions", c.get("/audit", params={"family_id": fid}, headers=auth(officer)).json()["total"] > 0)
    step("Notifications reach the citizen", len(c.get("/notifications", headers=auth(fresh)).json()["items"]) > 0)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} step(s) failed: " + "; ".join(FAILURES))
        return 1
    print("All demo steps passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
