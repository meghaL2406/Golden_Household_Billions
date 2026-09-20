# Family ID — API Contract (FastAPI, base URL http://localhost:8000/api)

All responses are JSON. Entities are serialised with every column of the SQLAlchemy model (see
`backend/app/models/entities.py`) plus any extra keys listed here. UUIDs, dates and datetimes are ISO strings.
Auth: `Authorization: Bearer <token>`. Roles: CITIZEN, SERVICE_OPERATOR, VERIFICATION_OFFICER,
DEPARTMENT_OFFICER, ADMIN. "Officer" = any non-CITIZEN role. Errors: `{"detail": "..."}` or
`{"detail": {"message": "...", "candidates": [...]}}` for 409 duplicate conflicts.
Pagination lists return `{"total", "items", "page", "size"}`.

## auth  (implemented: backend/app/routers/auth.py)
POST /auth/request-otp  {channel: "MOBILE"|"EMAIL", identifier} -> {challenge_id, channel, delivered, expires_in_seconds, dev_otp?, known_user}
POST /auth/verify-otp   {challenge_id, code, name?} -> {token, user, family_id}
GET  /auth/me -> {user, family_id, family_code, family_status}
Demo OTP in DEV_MODE is 123456.

## families (implemented: backend/app/routers/families.py)
GET  /families/search-existing?mobile&aadhaar&name&ration_card -> {existing_members:[{member_id,family_id,family_code,name,date_of_birth,gender,district,score,reasons[],level}], ration_records:[{external_reference_id, card_type, head_name, members:[{name,dob,gender,relation}], address, district}]}
GET  /families/mine -> FamilyDetail | null
POST /families  FamilyCreate -> FamilyDetail (+duplicate_warnings[], ration_suggested_members[])
     FamilyCreate = {declared_member_count, family_type, income_category?, annual_income?, ration_card_type?, address:{address_type,address_line,village?,taluka?,district,state,pincode?,latitude?,longitude?}, head: MemberIn, claim_ration_reference?}
     MemberIn = {name, father_or_husband_name?, date_of_birth?, gender?, mobile_number?, email?, aadhaar_reference?, identity_source?, marital_status?, occupation?, education_level?, is_student, disability_type?, disability_percentage?, udid_reference?, annual_income?, bank_linked, is_pregnant_or_lactating, citizenship_status, relationship_type?, related_member_id?, force}
GET  /families?q&district&status&page&size (officer) -> paginated Family (+head_name, member_count, open_cases)
GET  /families/{id} -> FamilyDetail
PATCH /families/{id} {family_type?, income_category?, annual_income?, ration_card_type?, declared_member_count?, notes?} -> FamilyDetail
POST /families/{id}/members MemberIn -> Member (+duplicate_warnings[]) ; 409 on blocking duplicate unless force=true
PATCH /families/{id}/members/{mid} MemberUpdate -> Member
DELETE /families/{id}/members/{mid}?reason -> {ok}
POST /families/{id}/relationships {member_id, related_member_id, relationship_type, start_date?, evidence_document_id?} -> Relationship
DELETE /families/{id}/relationships/{rid} -> {ok}
POST /families/{id}/consents {member_id, data_source, purpose?} -> {consent, records[]}
POST /families/{id}/members/{mid}/fetch/{source}  (source: AADHAAR | RATION_PDS | CIVIL_REGISTRATION | INCOME | UDID | EDUCATION) -> {records[], message?}
POST /families/{id}/run-checks -> {cases[], duplicate_families[]}
POST /families/{id}/submit -> {family: FamilyDetail, verification_case, conflicts[]}
FamilyDetail = Family columns + {members:[Member+{age, aadhaar_reference (masked), aadhaar_linked}], relationships:[Relationship+{member_name, related_member_name}], documents[], addresses[], external_records[], verification_cases[], life_events[], active_member_count, completeness:{steps:[{label,done}], percent}}
Family statuses: DRAFT, PENDING_VERIFICATION, VERIFIED, REJECTED, MERGED, INACTIVE. family_code (public Family ID like GJ-AHM-26-000123) is issued when an officer approves the FAMILY_VERIFICATION case.
Relationship types: SPOUSE, FATHER, MOTHER, SON, DAUGHTER, BROTHER, SISTER, GUARDIAN, WARD, GRANDFATHER, GRANDMOTHER, GRANDSON, GRANDDAUGHTER, OTHER.

## documents  (backend/app/routers/documents.py)
POST /documents  multipart form: file, owner_type (MEMBER|FAMILY), family_id, member_id?, document_type, document_reference?, issuing_authority?, issue_date?, expiry_date? -> Document
     document_type: BIRTH_CERTIFICATE, MARRIAGE_CERTIFICATE, DEATH_CERTIFICATE, INCOME_CERTIFICATE, ADDRESS_PROOF, DISABILITY_CERTIFICATE, RATION_CARD, EDUCATION_RECORD, COURT_ORDER, ADOPTION_ORDER, CASTE_CERTIFICATE, BANK_PASSBOOK, OTHER
     Uses app.services.storage.store_file; local files are served at http://localhost:8000/uploads/... (file_url is relative, prefix with API origin when not absolute).
GET  /documents?family_id&member_id&status -> Document[]
GET  /documents/{id} -> Document
POST /documents/{id}/verify {status: "VERIFIED"|"REJECTED", remarks?} (officer) -> Document ; recalculates eligibility; notifies family
DELETE /documents/{id} -> {ok} (only PENDING docs, by owner)

## verification cases  (backend/app/routers/verification.py) — officer only
GET  /verification/cases?status&case_type&district&priority&assigned=me&page&size -> paginated Case (+family_code, head_name, district, member_name, assigned_officer_name)
GET  /verification/cases/{id} -> {case, family: FamilyDetail, related_family: FamilyDetail|null, member, related_member, documents[], external_records[], life_event?, comparison:{fields:[{field, entered, source, match:bool}]}}
POST /verification/cases/{id}/action {action: ASSIGN|APPROVE|REJECT|REQUEST_INFO|MERGE|CLOSE, resolution?, assign_to_user_id?, merge_into_family_id?} -> Case
     APPROVE on FAMILY_VERIFICATION: set family VERIFIED, issue family_code via services.common.generate_family_code, set members VERIFIED (unless FLAGGED with other open cases), recalc eligibility, notify FAMILY_ID_CREATED.
     APPROVE on LIFE_EVENT: services.life_events.apply_life_event.
     APPROVE on DUPLICATE_*: marks the member/family as reviewed-distinct (verification_status VERIFIED). REJECT on DUPLICATE_PERSON: member_status LEFT + note. MERGE: services.life_events.merge_families(source=case.family, target=merge_into_family_id).
     REJECT on FAMILY_VERIFICATION: family REJECTED, notify. REQUEST_INFO: case INFO_REQUESTED + notify DOCUMENT_REQUIRED.
GET  /verification/officers -> [{user_id, name, role, district}] for assignment dropdown
GET  /verification/summary -> {open, assigned, info_requested, approved_today, by_type:{...}}

## life events  (backend/app/routers/life_events.py)
POST /life-events  {event_type, event_date?, member_id?, related_member_id?, document_id?, details{}, newborn?: MemberIn} -> {event, case, member?}
     event_type: BIRTH, MARRIAGE, DEATH, DIVORCE, SEPARATION, ADOPTION, GUARDIANSHIP, ADDRESS_CHANGE, MIGRATION, SPLIT
     BIRTH creates the newborn immediately as PROVISIONAL member (identity_source BIRTH_CERTIFICATE, Aadhaar NULL) with FATHER/MOTHER relationships to member_id and related_member_id (parents), then opens a LIFE_EVENT case. Other types open a LIFE_EVENT verification case; officer approval applies them.
     For MARRIAGE where spouse is new: details.new_spouse = MemberIn -> create the member in the family and set related_member_id.
     ADDRESS_CHANGE details = {address_line, village, taluka, district, pincode, address_type}
     Citizen's family is inferred from token (or family_id in details for officers).
GET  /life-events?family_id -> LifeEvent[]

## schemes + eligibility  (backend/app/routers/schemes.py)
GET  /schemes?status&department&category -> Scheme[]  (any authenticated)
POST /schemes SchemeIn (DEPARTMENT_OFFICER|ADMIN) -> Scheme
PATCH /schemes/{id} partial SchemeIn -> Scheme
POST /schemes/{id}/toggle -> Scheme (ACTIVE<->INACTIVE)
GET  /schemes/rule-fields -> [{field,label,type,ops[]}] from services.eligibility.FIELD_LABELS
GET  /schemes/{id}/eligible-families?status&district&page&size (officer) -> paginated {family_code, head_name, district, member_name, eligibility_status, eligibility_reason}
GET  /eligibility/mine -> {family_id, checked_at, items:[SchemeEligibility + {scheme:{scheme_id,scheme_code,scheme_name,department,category,benefit_type,benefit_amount,benefit_frequency,description,required_documents}, member_name, application?: {application_id, application_number, application_status}, benefit?: {benefit_id, delivery_status}}]}
GET  /eligibility/family/{family_id} (officer) -> same shape
POST /eligibility/recalculate/{family_id} -> same shape (services.eligibility.recalculate_family)
POST /schemes/{id}/preview  {family_id, member_id?} -> services.eligibility.evaluate output

## applications  (backend/app/routers/applications.py)
POST /applications {scheme_id, member_id?, attached_document_ids[], extra{}} -> Application. Rejects unless eligibility is ELIGIBLE or NEEDS_DOCUMENT(with docs now attached). prefilled_data = verified family/member snapshot (name, dob, gender, address, district, income, family_code, aadhaar_linked). application_number "APP-26-000001" via generate_number(db,"APP"). status_history appended. Notify APPLICATION_SUBMITTED.
GET  /applications/mine -> Application[] (+scheme_name, department, member_name, benefit?)
GET  /applications?status&scheme_id&district&department&page&size (officer) -> paginated (+scheme_name, family_code, head_name, member_name, district)
GET  /applications/{id} -> {application, scheme, family: FamilyDetail, documents[], eligibility, benefit?}
POST /applications/{id}/action {action: UNDER_REVIEW|REQUEST_INFO|APPROVE|REJECT|WITHDRAW, remarks?, benefit_amount?} -> Application. APPROVE creates BenefitRecord (delivery_status SANCTIONED, delivery_log entry) and notifies APPLICATION_APPROVED; REJECT sets rejected_at/rejection_reason and notifies APPLICATION_REJECTED; WITHDRAW citizen only.

## benefits  (backend/app/routers/benefits.py)
GET  /benefits/mine -> Benefit[] (+scheme_name, department, member_name, benefit_type, benefit_frequency)
GET  /benefits?status&delivery_status&scheme_id&district&page&size (officer) -> paginated (+scheme_name, family_code, head_name, member_name)
POST /benefits/{id}/delivery {status, note?, reference?} -> Benefit. Officers: SANCTIONED|DISBURSED|DELIVERED. Citizens: RECEIVED_CONFIRMED (sets citizen_confirmed_at) or NOT_RECEIVED (auto-creates a Grievance with category BENEFIT_NOT_RECEIVED and sets delivery_status DISPUTED). Appends delivery_log, notifies BENEFIT_STATUS.
Status chain to display: Eligible -> Applied -> Under review -> Approved -> Sanctioned -> Disbursed -> Delivered -> Received (confirmed by citizen).

## grievances  (backend/app/routers/grievances.py)
POST /grievances {category, description, application_id?, benefit_id?, scheme_id?, member_id?} -> Grievance (grievance_number "GRV-26-000001", due_at = now+7 days, history entry). Categories: BENEFIT_NOT_RECEIVED, WRONG_AMOUNT, APPLICATION_DELAY, WRONG_REJECTION, DATA_ERROR, VERIFICATION_DELAY, OTHER
GET  /grievances/mine -> Grievance[] (+scheme_name)
GET  /grievances?status&category&district&page&size (officer) -> paginated (+family_code, head_name, district, scheme_name, assigned_officer_name, overdue:bool)
GET  /grievances/{id} -> {grievance, family: FamilyDetail, application?, benefit?, scheme?}
POST /grievances/{id}/action {action: ASSIGN|IN_PROGRESS|ESCALATE|RESOLVE|CLOSE|REOPEN|RATE, note?, assign_to_user_id?, rating?} -> Grievance. ESCALATE increments escalation_level and sets priority HIGH. RESOLVE sets resolution/resolved_at and notifies GRIEVANCE_RESOLVED. REOPEN/RATE are citizen actions.

## notifications  (backend/app/routers/notifications.py)
GET  /notifications -> {unread, items: Notification[]}  (citizen: by family_id of my family or user_id; officer: user_id only)
POST /notifications/{id}/read -> Notification
POST /notifications/read-all -> {ok}

## dashboard / reports / map  (backend/app/routers/dashboard.py) — officer
GET  /dashboard/summary -> {total_families, verified_families, pending_verification, duplicate_cases, active_members, applications, approved_benefits, pending_cases, open_grievances, benefits_delivered, benefits_disputed, provisional_members}
GET  /dashboard/reports/district -> [{district, families, verified, pending, members, applications, benefits}]
GET  /dashboard/reports/schemes -> [{scheme_id, scheme_code, scheme_name, department, eligible, needs_document, under_review, not_eligible, applications, approved, delivered}]
GET  /dashboard/reports/applications?days=30 -> {by_status:{}, by_day:[{date, count}]}
GET  /dashboard/reports/benefits -> {by_delivery_status:{}, total_amount, by_scheme:[{scheme_name, count, amount}]}
GET  /dashboard/reports/cases -> {by_type:{}, by_status:{}, avg_resolution_hours}
GET  /dashboard/activity?limit=20 -> AuditLog[] recent
GET  /map/districts?scheme_id -> [{district, lat, lng, families, verified, eligible_families?}] using services.common.DISTRICT_CENTROIDS
GET  /map/points?district&taluka&village&status -> [{family_ref (family_code only), status, member_count, lat, lng}] — coordinates are jittered by up to 300 m and no names are returned. Uses PostGIS ST_ functions only when postgis_available(); otherwise plain columns.
GET  /map/locations -> {districts:[...], talukas:{district:[...]}, villages:{taluka:[...]}} from existing families

## audit + users  (backend/app/routers/admin.py)
GET  /audit?family_id&action&entity_type&actor&page&size (officer; citizens may pass only their own family_id) -> paginated AuditLog
GET  /users?role&status&q (ADMIN) -> User[]
POST /users UserIn (ADMIN) -> User
PATCH /users/{id} partial UserIn (ADMIN) -> User
GET  /meta/enums -> {document_types[], relationship_types[], event_types[], grievance_categories[], districts[], scheme_categories[], departments[], case_types[]}

## Seeded demo logins (all use OTP 123456)
CITIZEN            mobile 9876500001  (Ramesh Patel, verified family in Ahmedabad)
CITIZEN            mobile 9876500002  (new citizen, no family yet)
SERVICE_OPERATOR   mobile 9000000001
VERIFICATION_OFFICER mobile 9000000002
DEPARTMENT_OFFICER mobile 9000000003
ADMIN              mobile 9000000004  / email admin@familyid.gov.in

## ops  (backend/app/main.py)
GET  /api/health -> {status:"ok", cloudinary, smtp, dev_mode}  (no auth)
GET|HEAD /api/ping -> {ok:true, at}  (no auth, no database access) — keep-alive target for external monitors such as UptimeRobot; poll every 5–10 minutes to prevent free-tier spin-down.

## assistant — mock, "coming soon"  (backend/app/routers/assistant.py)
GET  /assistant/status -> {available:false, mode:"mock", title, message, suggestions[]}  (role-specific suggestions)
POST /assistant/chat {message} -> {reply, links:[{label,to}], mock:true, at}
     Answers come from fixed keyword rules until a language model is connected; the shapes above are final.
