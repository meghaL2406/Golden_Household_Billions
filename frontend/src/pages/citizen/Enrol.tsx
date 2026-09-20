import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input, KeyValue, Notice, PageHeader, Select, Skeleton, StatusTag, Stepper, Tag } from "../../components";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDate, fmtMoney, titleCase } from "../../lib/format";
import { useToast } from "../../lib/hooks";
import {
  AddressFields,
  CandidateList,
  ConflictModal,
  DocumentList,
  FAMILY_TYPES,
  Grid,
  INCOME_CATEGORIES,
  MemberFields,
  Mono,
  Muted,
  RATION_CARD_TYPES,
  RELATIONSHIP_TYPES,
  Row,
  SectionEyebrow,
  Stack,
  UploadDocumentModal,
  activeMembers,
  addressPayload,
  ageFromDob,
  conflictCandidates,
  emptyAddress,
  emptyMember,
  errorMessage,
  headOf,
  isNewborn,
  memberPayload,
  options,
  relationToHead,
  useEnums,
  type AddressForm,
  type FamilyDetail,
  type Member,
  type MemberForm,
} from "./_shared";

const STEPS = ["Check existing records", "Household", "Head of family", "Members", "Documents", "Review and submit"];

type FamilyForm = {
  declared_member_count: number;
  family_type: string;
  income_category: string;
  annual_income: string;
  ration_card_type: string;
};

type Suggested = { name?: string; dob?: string; date_of_birth?: string; gender?: string; relation?: string; relationship_type?: string };

export default function Enrol() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const { districts } = useEnums();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [family, setFamily] = useState<FamilyDetail | null>(null);
  const [blocked, setBlocked] = useState<FamilyDetail | null>(null);

  // step 1
  const [search, setSearch] = useState({ mobile: user?.mobile || "", aadhaar: "", ration_card: "" });
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [claimRation, setClaimRation] = useState<any>(null);

  // step 2
  const [fam, setFam] = useState<FamilyForm>({ declared_member_count: 1, family_type: "NUCLEAR", income_category: "", annual_income: "", ration_card_type: "" });
  const [address, setAddress] = useState<AddressForm>(emptyAddress());

  // step 3
  const [head, setHead] = useState<MemberForm>(emptyMember({ name: user?.name || "", mobile_number: user?.mobile || "", email: user?.email || "" }));
  const [consent, setConsent] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<any[] | null>(null);
  const [createWarnings, setCreateWarnings] = useState<any[]>([]);
  const [suggested, setSuggested] = useState<Suggested[]>([]);

  // step 4
  const [member, setMember] = useState<MemberForm>(emptyMember());
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberConflict, setMemberConflict] = useState<any[] | null>(null);
  const [memberWarnings, setMemberWarnings] = useState<any[]>([]);

  // step 5
  const [uploadFor, setUploadFor] = useState<{ ownerType: "MEMBER" | "FAMILY"; memberId?: string } | null>(null);

  // step 6
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    api<FamilyDetail | null>("/families/mine")
      .then((f) => {
        if (!alive) return;
        if (f && f.family_status === "DRAFT") {
          setFamily(f);
          setStep(4);
        } else if (f) {
          setBlocked(f);
        }
      })
      .catch((e) => alive && setLoadError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (family) {
      const h = headOf(family);
      setMember((m) => (m.related_member_id ? m : { ...m, related_member_id: h?.member_id || "" }));
    }
  }, [family]);

  const reloadFamily = async () => {
    if (!family) return;
    const f = await api<FamilyDetail>(`/families/${family.family_id}`);
    setFamily(f);
  };

  // ------------------------------------------------------------------ step 1
  const runSearch = async () => {
    setSearchBusy(true);
    setSearchError(null);
    try {
      const r = await api("/families/search-existing", { params: { mobile: search.mobile, aadhaar: search.aadhaar, ration_card: search.ration_card, name: head.name } });
      setSearchResult(r);
    } catch (e) {
      setSearchError(errorMessage(e));
    } finally {
      setSearchBusy(false);
    }
  };

  const seriousMatches: any[] = useMemo(
    () => (searchResult?.existing_members || []).filter((m: any) => m.level === "BLOCK" || m.level === "REVIEW"),
    [searchResult],
  );

  const useRation = (r: any) => {
    setClaimRation(r);
    setFam((f) => ({
      ...f,
      ration_card_type: r.card_type || f.ration_card_type,
      declared_member_count: Math.max(f.declared_member_count, (r.members || []).length || 1),
    }));
    if (r.district || r.address) setAddress((a) => ({ ...a, district: r.district || a.district, address_line: a.address_line || r.address || "" }));
    if (r.head_name) setHead((h) => ({ ...h, name: h.name || r.head_name }));
    setSuggested((r.members || []) as Suggested[]);
  };

  // ------------------------------------------------------------------ create
  const createFamily = async (force = false) => {
    setCreateBusy(true);
    setCreateError(null);
    try {
      const payload = {
        declared_member_count: fam.declared_member_count,
        family_type: fam.family_type,
        income_category: fam.income_category || undefined,
        annual_income: fam.annual_income.trim() === "" ? undefined : Number(fam.annual_income),
        ration_card_type: fam.ration_card_type || undefined,
        address: addressPayload(address),
        head: { ...memberPayload(head), force },
        claim_ration_reference: claimRation?.external_reference_id || undefined,
      };
      const created = await api<any>("/families", { method: "POST", body: payload });
      setCreateWarnings(created.duplicate_warnings || []);
      const sug = (created.ration_suggested_members || []) as Suggested[];
      if (sug.length) setSuggested(sug);
      setFamily(created);
      setConflict(null);
      await refresh().catch(() => undefined);
      setStep(4);
    } catch (e) {
      const cands = conflictCandidates(e);
      if (cands) setConflict(cands);
      else setCreateError(errorMessage(e));
    } finally {
      setCreateBusy(false);
    }
  };

  const validateStep2 = () => {
    if (!address.address_line.trim()) return "Please enter the address line.";
    if (!address.district) return "Please choose the district.";
    if (fam.declared_member_count < 1) return "The household must have at least one member.";
    return null;
  };

  const validateStep3 = () => {
    if (!head.name.trim()) return "Please enter the name of the head of family.";
    if (!isNewborn(head.date_of_birth) && !head.aadhaar_reference.trim()) return "Please enter the Aadhaar number of the head of family.";
    if (!consent) return "Please confirm the consent statement to continue.";
    return null;
  };

  // ------------------------------------------------------------------ members
  const addMember = async (force = false) => {
    if (!family) return;
    if (!member.name.trim()) return setMemberError("Please enter the member's name.");
    if (!member.relationship_type) return setMemberError("Please choose the relationship.");
    if (!isNewborn(member.date_of_birth) && !member.aadhaar_reference.trim()) {
      return setMemberError("Aadhaar number is required. Only a newborn under one year old may be added with a birth certificate instead.");
    }
    setMemberBusy(true);
    setMemberError(null);
    try {
      const h = headOf(family);
      const payload = memberPayload({ ...member, related_member_id: member.related_member_id || h?.member_id || "", force }, { includeRelationship: true });
      const created = await api<any>(`/families/${family.family_id}/members`, { method: "POST", body: payload });
      setMemberWarnings(created.duplicate_warnings || []);
      setMemberConflict(null);
      setSuggested((s) => s.filter((x) => (x.name || "").trim().toLowerCase() !== member.name.trim().toLowerCase()));
      setMember(emptyMember({ related_member_id: h?.member_id || "" }));
      toast.push(`${created.name || "Member"} was added to the family.`, "success");
      await reloadFamily();
    } catch (e) {
      const cands = conflictCandidates(e);
      if (cands) setMemberConflict(cands);
      else setMemberError(errorMessage(e));
    } finally {
      setMemberBusy(false);
    }
  };

  const prefillSuggested = (s: Suggested) => {
    const h = headOf(family);
    const rel = (s.relationship_type || s.relation || "").toUpperCase().replace(/\s+/g, "_");
    setMember(
      emptyMember({
        name: s.name || "",
        date_of_birth: s.dob || s.date_of_birth || "",
        gender: (s.gender || "").toUpperCase(),
        relationship_type: RELATIONSHIP_TYPES.includes(rel) ? rel : rel === "WIFE" || rel === "HUSBAND" ? "SPOUSE" : "",
        related_member_id: h?.member_id || "",
      }),
    );
  };

  // ------------------------------------------------------------------ submit
  const submitFamily = async () => {
    if (!family) return;
    setSubmitBusy(true);
    setSubmitError(null);
    try {
      const r = await api<any>(`/families/${family.family_id}/submit`, { method: "POST" });
      setSubmitResult(r);
      await refresh().catch(() => undefined);
      toast.push("Your family record was submitted for verification.", "success");
      if (!r.conflicts || r.conflicts.length === 0) navigate("/family");
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setSubmitBusy(false);
    }
  };

  // ------------------------------------------------------------------ render
  const header = <PageHeader eyebrow="Enrolment" title="Create your Family ID" description="Six short steps; you can stop and resume at any time." />;

  if (loading)
    return (
      <>
        {header}
        <Skeleton rows={8} />
      </>
    );
  if (loadError)
    return (
      <>
        {header}
        <Notice tone="danger">{loadError}</Notice>
      </>
    );
  if (blocked)
    return (
      <>
        {header}
        <Card>
          <Stack gap={12}>
            <Notice tone="info">
              A family record already exists for your login with status {titleCase(blocked.family_status)}; new members and changes are made from the family profile.
            </Notice>
            <div>
              <Button onClick={() => navigate("/family")}>Open family profile</Button>
            </div>
          </Stack>
        </Card>
      </>
    );

  const stepperSteps = STEPS.map((label, i) => ({ label, done: i + 1 < step, active: i + 1 === step }));
  const members = activeMembers(family);
  const headMember = headOf(family);

  return (
    <>
      {header}
      <Stack gap={22}>
        <Card padding={18}>
          <Stepper steps={stepperSteps} />
        </Card>

        {step === 1 && (
          <Card eyebrow="Step 1 of 6" title="Check existing records" subnote="This prevents a second family being created for the same person.">
            <Stack gap={14}>
              <Grid cols={3}>
                <Input label="Mobile number" value={search.mobile} onChange={(e: any) => setSearch({ ...search, mobile: e.target.value })} inputMode="numeric" />
                <Input label="Aadhaar number (optional)" value={search.aadhaar} onChange={(e: any) => setSearch({ ...search, aadhaar: e.target.value })} inputMode="numeric" maxLength={12} />
                <Input label="Ration card number (optional)" value={search.ration_card} onChange={(e: any) => setSearch({ ...search, ration_card: e.target.value })} />
              </Grid>
              <Row gap={8}>
                <Button variant="outline" onClick={runSearch} loading={searchBusy} type="button">
                  Search records
                </Button>
                <Muted>Searching is optional but recommended.</Muted>
              </Row>
              {searchError && <Notice tone="danger">{searchError}</Notice>}
              {searchResult && (
                <Stack gap={12}>
                  {seriousMatches.length > 0 ? (
                    <Card eyebrow="Warning" title="A family already contains this person" padding={18}>
                      <Stack gap={10}>
                        <Notice tone="warning">Do not create a second family; contact a service centre, or continue only if this is truly a different person.</Notice>
                        <CandidateList candidates={seriousMatches} />
                      </Stack>
                    </Card>
                  ) : (
                    <Notice tone="success">
                      {(searchResult.existing_members || []).length === 0
                        ? "No existing record matches these details."
                        : "Only weak matches were found, so you can continue."}
                    </Notice>
                  )}
                  {(searchResult.ration_records || []).length > 0 && (
                    <Stack gap={8}>
                      <SectionEyebrow>Ration card households found</SectionEyebrow>
                      {searchResult.ration_records.map((r: any) => (
                        <div key={r.external_reference_id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                          <Row justify="space-between" gap={12}>
                            <div style={{ fontSize: 12 }}>
                              <div style={{ fontWeight: 550 }}>
                                {r.head_name || "Household"} <Muted>· {titleCase(r.card_type || "card")}</Muted>
                              </div>
                              <Muted>
                                <Mono size={11}>{r.external_reference_id}</Mono> · {r.district || "—"} · {(r.members || []).length} listed members
                              </Muted>
                            </div>
                            {claimRation?.external_reference_id === r.external_reference_id ? (
                              <Tag tone="success">Selected as starting point</Tag>
                            ) : (
                              <Button size="sm" variant="outline" type="button" onClick={() => useRation(r)}>
                                Use this household as a starting point
                              </Button>
                            )}
                          </Row>
                        </div>
                      ))}
                    </Stack>
                  )}
                </Stack>
              )}
              <Row justify="flex-end">
                <Button onClick={() => setStep(2)} type="button">
                  Continue
                </Button>
              </Row>
            </Stack>
          </Card>
        )}

        {step === 2 && (
          <Card eyebrow="Step 2 of 6" title="Household" subnote="Tell us how many people live together and where.">
            <Stack gap={14}>
              {createError && <Notice tone="danger">{createError}</Notice>}
              <Grid cols={3}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>Number of members</div>
                  <Row gap={8} wrap={false}>
                    <Button variant="outline" size="sm" type="button" onClick={() => setFam({ ...fam, declared_member_count: Math.max(1, fam.declared_member_count - 1) })}>
                      −
                    </Button>
                    <span style={{ fontSize: 22, fontWeight: 550, minWidth: 36, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{fam.declared_member_count}</span>
                    <Button variant="outline" size="sm" type="button" onClick={() => setFam({ ...fam, declared_member_count: Math.min(30, fam.declared_member_count + 1) })}>
                      +
                    </Button>
                    <Muted size={11}>people</Muted>
                  </Row>
                </div>
                <Select label="Family type" value={fam.family_type} onChange={(e: any) => setFam({ ...fam, family_type: e.target.value })}>
                  {options(FAMILY_TYPES)}
                </Select>
                <Select label="Income category" value={fam.income_category} onChange={(e: any) => setFam({ ...fam, income_category: e.target.value })}>
                  {options(INCOME_CATEGORIES, "Select")}
                </Select>
                <Input label="Annual family income (₹)" type="number" value={fam.annual_income} onChange={(e: any) => setFam({ ...fam, annual_income: e.target.value })} />
                <Select label="Ration card type" value={fam.ration_card_type} onChange={(e: any) => setFam({ ...fam, ration_card_type: e.target.value })}>
                  {options(RATION_CARD_TYPES, "Select")}
                </Select>
              </Grid>
              <SectionEyebrow>Address</SectionEyebrow>
              <AddressFields value={address} onChange={setAddress} districts={districts} />
              <Row justify="space-between">
                <Button variant="outline" type="button" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const err = validateStep2();
                    if (err) setCreateError(err);
                    else {
                      setCreateError(null);
                      setStep(3);
                    }
                  }}
                >
                  Continue
                </Button>
              </Row>
            </Stack>
          </Card>
        )}

        {step === 3 && (
          <Card eyebrow="Step 3 of 6" title="Head of family" subnote="The head is the reference point for every relationship.">
            <Stack gap={14}>
              {createError && <Notice tone="danger">{createError}</Notice>}
              <MemberFields value={head} onChange={setHead} mode="head" />
              <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, lineHeight: 1.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, accentColor: "var(--blue)" }} />
                  <span>
                    I confirm that the details are true to my knowledge and I consent to the Family ID system fetching Aadhaar, ration card and civil registration records
                    for the members I add, solely to verify this family profile. I understand that Aadhaar is required for every member except a newborn under one year
                    old, and that I can revoke consent through a service centre.
                  </span>
                </label>
              </div>
              <Row justify="space-between">
                <Button variant="outline" type="button" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button
                  type="button"
                  loading={createBusy}
                  onClick={() => {
                    const err = validateStep3();
                    if (err) setCreateError(err);
                    else createFamily(false);
                  }}
                >
                  Create family and continue
                </Button>
              </Row>
            </Stack>
          </Card>
        )}

        {step === 4 && family && (
          <Grid cols={2} gap={22}>
            <Card eyebrow="Step 4 of 6" title="Add members" subnote={`${members.length} of ${family.declared_member_count ?? members.length} declared members added`}>
              <Stack gap={14}>
                {createWarnings.length > 0 && (
                  <Notice tone="warning">The head of family matched {createWarnings.length} existing record{createWarnings.length === 1 ? "" : "s"}; an officer will review this.</Notice>
                )}
                {memberError && <Notice tone="danger">{memberError}</Notice>}
                {memberWarnings.length > 0 && (
                  <Stack gap={6}>
                    <Notice tone="warning">The last member matched an existing record; the member was added and flagged for officer review.</Notice>
                    <CandidateList candidates={memberWarnings} />
                  </Stack>
                )}
                {suggested.length > 0 && (
                  <Stack gap={6}>
                    <SectionEyebrow>Suggested from the ration card</SectionEyebrow>
                    <Row gap={6}>
                      {suggested.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => prefillSuggested(s)}
                          style={{ border: "1px solid var(--line)", background: "#fff", borderRadius: 999, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
                        >
                          {s.name} <Muted size={11}>{[s.relation || s.relationship_type, s.gender].filter(Boolean).map((x) => titleCase(String(x))).join(" · ")}</Muted>
                        </button>
                      ))}
                    </Row>
                  </Stack>
                )}
                <MemberFields value={member} onChange={setMember} mode="member" members={members} />
                <Row justify="flex-end" gap={8}>
                  <Button type="button" loading={memberBusy} onClick={() => addMember(false)}>
                    Add member
                  </Button>
                </Row>
              </Stack>
            </Card>
            <Stack gap={16}>
              <Card eyebrow="Members so far" title="Family members">
                <Stack gap={8}>
                  {members.map((m) => (
                    <Row key={m.member_id} justify="space-between" gap={12}>
                      <div style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 550 }}>
                          {m.name} {m.is_head && <Tag tone="blue">Head</Tag>}
                        </div>
                        <Muted>
                          {relationToHead(family, m)}
                          {m.date_of_birth ? ` · ${ageFromDob(m.date_of_birth)} yrs` : ""}
                          {m.gender ? ` · ${titleCase(m.gender)}` : ""}
                        </Muted>
                      </div>
                      <StatusTag status={m.verification_status} />
                    </Row>
                  ))}
                </Stack>
              </Card>
              <Row justify="space-between">
                <Button variant="outline" type="button" onClick={() => navigate("/family")}>
                  Save and exit
                </Button>
                <Button type="button" onClick={() => setStep(5)}>
                  Continue to documents
                </Button>
              </Row>
            </Stack>
          </Grid>
        )}

        {step === 5 && family && (
          <Card eyebrow="Step 5 of 6" title="Documents" subnote="Upload what you have now; missing documents can be added later from the family profile.">
            <Stack gap={16}>
              <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                <Row justify="space-between" gap={12}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 550 }}>Family documents</div>
                    <Muted>Ration card, address proof, income certificate</Muted>
                  </div>
                  <Button size="sm" variant="outline" type="button" onClick={() => setUploadFor({ ownerType: "FAMILY" })}>
                    Upload
                  </Button>
                </Row>
                <div style={{ marginTop: 10 }}>
                  <DocumentList docs={family.documents.filter((d) => d.owner_type === "FAMILY")} />
                </div>
              </div>
              {members.map((m) => (
                <div key={m.member_id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                  <Row justify="space-between" gap={12}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 550 }}>{m.name}</div>
                      <Muted>
                        {relationToHead(family, m)} · {m.identity_source ? titleCase(m.identity_source) : "identity source not set"}
                      </Muted>
                    </div>
                    <Button size="sm" variant="outline" type="button" onClick={() => setUploadFor({ ownerType: "MEMBER", memberId: m.member_id })}>
                      Upload
                    </Button>
                  </Row>
                  <div style={{ marginTop: 10 }}>
                    <DocumentList docs={family.documents.filter((d) => d.member_id === m.member_id)} />
                  </div>
                </div>
              ))}
              <Row justify="space-between">
                <Button variant="outline" type="button" onClick={() => setStep(4)}>
                  Back
                </Button>
                <Button type="button" onClick={() => setStep(6)}>
                  Continue to review
                </Button>
              </Row>
            </Stack>
          </Card>
        )}

        {step === 6 && family && (
          <Stack gap={16}>
            {submitError && <Notice tone="danger">{submitError}</Notice>}
            {submitResult && (
              <Card eyebrow="Submitted" title="Your family record is with the verification officer">
                <Stack gap={10}>
                  {(submitResult.conflicts || []).length > 0 ? (
                    <Notice tone="warning">
                      {submitResult.conflicts.length} verification case{submitResult.conflicts.length === 1 ? " was" : "s were"} opened; an officer will review them before the
                      Family ID is issued.
                    </Notice>
                  ) : (
                    <Notice tone="success">No conflicts were found.</Notice>
                  )}
                  <Stack gap={6}>
                    {(submitResult.conflicts || []).map((c: any, i: number) => (
                      <Row key={c.case_id || i} justify="space-between">
                        <span style={{ fontSize: 12 }}>
                          {titleCase(c.case_type || "case")} <Muted>· {c.reason || ""}</Muted>
                        </span>
                        <StatusTag status={c.case_status || "OPEN"} />
                      </Row>
                    ))}
                  </Stack>
                  <div>
                    <Button onClick={() => navigate("/family")}>Open family profile</Button>
                  </div>
                </Stack>
              </Card>
            )}
            {!submitResult && (
              <>
                <Card eyebrow="Step 6 of 6" title="Review" subnote="Check every detail before submitting; changes after submission go through an officer.">
                  <Stack gap={18}>
                    <div>
                      <SectionEyebrow>Household</SectionEyebrow>
                      <KeyValue
                        columns={3}
                        items={[
                          { label: "Declared members", value: `${family.declared_member_count ?? members.length} people` },
                          { label: "Family type", value: titleCase(family.family_type || "—") },
                          { label: "Income category", value: family.income_category ? titleCase(family.income_category) : "—" },
                          { label: "Annual income", value: family.annual_income != null ? fmtMoney(Number(family.annual_income)) : "—" },
                          { label: "Ration card", value: family.ration_card_type ? titleCase(family.ration_card_type) : "—" },
                          { label: "District", value: family.district || address.district || "—" },
                          { label: "Address", value: (family.addresses || []).find((a: any) => a.is_current)?.address_line || address.address_line || "—" },
                          { label: "Pincode", value: <Mono>{family.pincode || address.pincode || "—"}</Mono> },
                        ]}
                      />
                    </div>
                    {headMember && (
                      <div>
                        <SectionEyebrow>Head of family</SectionEyebrow>
                        <KeyValue
                          columns={3}
                          items={[
                            { label: "Name", value: headMember.name },
                            { label: "Date of birth", value: headMember.date_of_birth ? fmtDate(headMember.date_of_birth) : "—" },
                            { label: "Gender", value: headMember.gender ? titleCase(headMember.gender) : "—" },
                            { label: "Mobile", value: <Mono>{headMember.mobile_number || "—"}</Mono> },
                            { label: "Aadhaar", value: headMember.aadhaar_linked ? `Linked (${headMember.aadhaar_reference || "masked"})` : "Not linked" },
                            { label: "Identity source", value: headMember.identity_source ? titleCase(headMember.identity_source) : "—" },
                          ]}
                        />
                      </div>
                    )}
                    <div>
                      <SectionEyebrow>Members ({members.length})</SectionEyebrow>
                      <Stack gap={6}>
                        {members.map((m: Member) => (
                          <Row key={m.member_id} justify="space-between">
                            <span style={{ fontSize: 12 }}>
                              <span style={{ fontWeight: 550 }}>{m.name}</span> <Muted>· {relationToHead(family, m)}</Muted>
                            </span>
                            <Muted>{family.documents.filter((d) => d.member_id === m.member_id).length} documents</Muted>
                          </Row>
                        ))}
                      </Stack>
                    </div>
                    <div>
                      <SectionEyebrow>Documents ({family.documents.length})</SectionEyebrow>
                      <DocumentList docs={family.documents} />
                    </div>
                    {family.completeness && (
                      <div>
                        <SectionEyebrow>Completeness · {family.completeness.percent} %</SectionEyebrow>
                        <Stepper steps={family.completeness.steps.map((s) => ({ label: s.label, done: s.done }))} />
                      </div>
                    )}
                  </Stack>
                </Card>
                <Row justify="space-between">
                  <Button variant="outline" type="button" onClick={() => setStep(5)}>
                    Back
                  </Button>
                  <Button type="button" loading={submitBusy} onClick={submitFamily}>
                    Submit for verification
                  </Button>
                </Row>
              </>
            )}
          </Stack>
        )}
      </Stack>

      <ConflictModal open={conflict !== null} candidates={conflict || []} onClose={() => setConflict(null)} onContinue={() => createFamily(true)} busy={createBusy} />
      <ConflictModal open={memberConflict !== null} candidates={memberConflict || []} onClose={() => setMemberConflict(null)} onContinue={() => addMember(true)} busy={memberBusy} />
      {family && uploadFor && (
        <UploadDocumentModal
          open
          onClose={() => setUploadFor(null)}
          familyId={family.family_id}
          members={members}
          defaultOwnerType={uploadFor.ownerType}
          defaultMemberId={uploadFor.memberId}
          onUploaded={() => {
            toast.push("Document uploaded.", "success");
            reloadFamily();
          }}
        />
      )}
    </>
  );
}
