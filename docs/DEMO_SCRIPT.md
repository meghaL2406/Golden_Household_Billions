# Family ID — Demo Script (10 minutes)

Core idea to state first: existing government records + citizen documents → verification → one unified
family profile → unique Family ID → eligibility engine → schemes and benefits → continuous updates.

## Part 1 — New citizen enrols (login 9876500002, OTP 123456)
1. Home shows "Start your Family ID". Click Start.
2. Step 1 checks existing records: the Ration/PDS household GJ-RC-778812 is found. Choose "Use this household as a starting point".
3. Step 2: declare household size (panel suggestion) and address in Vadodara.
4. Step 3: head details, including Aadhaar. Grant consent so the Aadhaar demographic record can be fetched.
5. Step 4: add spouse and children from the ration suggestions in one click each; add a newborn with a
   Birth Certificate only (no Aadhaar) as a provisional member.
6. Step 5: upload documents (birth certificate, address proof, income certificate).
7. Step 6: review and submit. Automatic checks run: duplicate person, duplicate family, Aadhaar mismatch,
   relationship sanity, declared vs added member count.

## Part 2 — Officer verifies (login 9000000002)
1. Dashboard shows pending verification and duplicate cases.
2. Open the "Rakesh Kumar" DUPLICATE_PERSON case: the panel's multiple-identity scenario. Show the
   side-by-side comparison, similarity score and reasons (name variant, same date of birth, same father).
   Reject the duplicate; the person is not enrolled twice.
3. Open the new family's FAMILY_VERIFICATION case, review documents and source records, Approve.
   The Family ID (GJ-VAD-26-000xxx) is issued and eligibility recalculates.

## Part 3 — Schemes and benefits (login 9876500001, Ramesh Patel)
1. Schemes page: each scheme shows Eligible / Not eligible / Needs document / Under review with the reason.
2. Apply for Student Scholarship for Arjun: details are pre-filled from the verified profile.
3. Officer (9000000003) approves; a benefit record is sanctioned.
4. Officer marks Disbursed, then Delivered. Citizen confirms "I received this benefit".
   Show the full chain: Eligible → Applied → Under review → Approved → Sanctioned → Disbursed → Delivered → Received.
5. Alternatively click "I have not received it": a grievance opens automatically with a 7-day due date
   and escalation. Officer resolves it; citizen rates the resolution.

## Part 4 — Life events and continuous updates
1. Report a marriage or death with the certificate. Officer approves the LIFE_EVENT case.
2. The profile updates (relationships ended, widow status, head transfer) and eligibility recalculates,
   with history preserved.

## Part 5 — Reports and map
1. Reports: district-wise families, scheme-wise eligibility, applications over 30 days, benefits delivered, cases.
2. Map: district circles and offset points; no personal details are shown.
3. Audit log: every action with actor, entity and before/after values.
