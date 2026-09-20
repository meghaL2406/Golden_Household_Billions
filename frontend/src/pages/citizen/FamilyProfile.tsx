import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Drawer,
  Input,
  KeyValue,
  Modal,
  Notice,
  PageHeader,
  Select,
  Skeleton,
  StatusTag,
  Table,
  Tabs,
  Tag,
  Timeline,
} from "../../components";
import { api } from "../../lib/api";
import { fmtDate, fmtDateTime, titleCase } from "../../lib/format";
import { useApi, useToast } from "../../lib/hooks";
import {
  AddressFields,
  CandidateList,
  ConflictModal,
  DocumentList,
  FetchRecordsModal,
  Grid,
  LifeEventModal,
  MONO,
  MemberFields,
  Mono,
  Muted,
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
  memberOptions,
  memberPayload,
  options,
  relationToHead,
  useEnums,
  type AddressForm,
  type FamilyDetail,
  type Member,
  type MemberForm,
} from "./_shared";

const TABS = [
  { key: "members", label: "Members" },
  { key: "relationships", label: "Relationships" },
  { key: "documents", label: "Documents" },
  { key: "addresses", label: "Addresses" },
  { key: "verification", label: "Verification" },
  { key: "timeline", label: "Timeline" },
];

export default function FamilyProfile() {
  const navigate = useNavigate();
  const toast = useToast();
  const { districts } = useEnums();
  const fam = useApi<FamilyDetail | null>("/families/mine");
  const family = fam.data || null;

  const [tab, setTab] = useState("members");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addRelOpen, setAddRelOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lifeEventOpen, setLifeEventOpen] = useState(false);
  const [fetchFor, setFetchFor] = useState<Member | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<any>(null);

  const audit = useApi<any>(family ? "/audit" : null, family ? { family_id: family.family_id, page: 1, size: 50 } : undefined, [family?.family_id]);

  if (fam.loading && fam.data === undefined) {
    return (
      <>
        <PageHeader eyebrow="Citizen portal" title="Family profile" description="Members, relationships, documents and verification status." />
        <Skeleton rows={8} />
      </>
    );
  }

  if (fam.error) {
    return (
      <>
        <PageHeader eyebrow="Citizen portal" title="Family profile" description="Members, relationships, documents and verification status." />
        <Notice tone="danger">{fam.error}</Notice>
      </>
    );
  }

  if (!family) {
    return (
      <>
        <PageHeader eyebrow="Citizen portal" title="Family profile" description="Members, relationships, documents and verification status." />
        <Notice tone="info">
          You do not have a family record yet.{" "}
          <a href="/enrol" onClick={(e) => (e.preventDefault(), navigate("/enrol"))} style={{ color: "var(--blue)", fontWeight: 550 }}>
            Begin enrolment
          </a>
          .
        </Notice>
      </>
    );
  }

  const members = activeMembers(family);
  const canSubmit = family.family_status === "DRAFT" || family.family_status === "REJECTED";

  const runChecks = async () => {
    setCheckBusy(true);
    try {
      const r = await api(`/families/${family.family_id}/run-checks`, { method: "POST" });
      setCheckResult(r);
      toast.push("Duplicate check completed.", "success");
      fam.reload();
    } catch (e) {
      toast.push(errorMessage(e), "danger");
    } finally {
      setCheckBusy(false);
    }
  };

  const submitForVerification = async () => {
    setSubmitBusy(true);
    setSubmitError(null);
    try {
      const r = await api(`/families/${family.family_id}/submit`, { method: "POST" });
      setSubmitResult(r);
      toast.push("Your family record was submitted for verification.", "success");
      fam.reload();
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setSubmitBusy(false);
    }
  };

  const timelineItems = [
    ...(family.life_events || []).map((ev: any) => ({
      title: `${titleCase(ev.event_type)} reported`,
      at: ev.event_date || ev.created_at,
      note: ev.details?.note,
      tone: "blue" as const,
    })),
    ...((audit.data?.items as any[]) || []).map((a: any) => ({
      title: `${titleCase(a.action)} · ${titleCase(a.entity_type)}`,
      at: a.timestamp,
      note: a.actor_label ? `By ${a.actor_label}` : undefined,
      tone: "neutral" as const,
    })),
  ].sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());

  return (
    <>
      <PageHeader
        eyebrow="Citizen portal"
        title="Family profile"
        description="Members, relationships, documents and verification status."
        action={
          <Row gap={8}>
            <Button variant="outline" onClick={() => setLifeEventOpen(true)}>
              Report life event
            </Button>
            <Button variant="outline" onClick={runChecks} loading={checkBusy}>
              Run duplicate check
            </Button>
            {canSubmit && (
              <Button onClick={submitForVerification} loading={submitBusy}>
                Submit for verification
              </Button>
            )}
          </Row>
        }
      />

      <Stack gap={22}>
        <Card padding={22}>
          <Row justify="space-between" gap={16}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 500, letterSpacing: "0.02em", color: "var(--ink)" }}>
                {family.family_code || "Provisional"}
              </div>
              <Muted>{family.district ? `${family.district}, Gujarat` : "District not recorded"}</Muted>
            </div>
            <Row gap={8}>
              <StatusTag status={family.family_status} />
              {family.completeness && <Tag tone="neutral">{family.completeness.percent} % complete</Tag>}
            </Row>
          </Row>
        </Card>

        {submitError && <Notice tone="danger">{submitError}</Notice>}
        {submitResult && (submitResult.conflicts || []).length > 0 && (
          <Notice tone="warning">
            {submitResult.conflicts.length} verification case{submitResult.conflicts.length === 1 ? " was" : "s were"} opened for review.
          </Notice>
        )}
        {checkResult && (
          <Notice tone={((checkResult.cases || []).length || (checkResult.duplicate_families || []).length) ? "warning" : "success"}>
            {((checkResult.cases || []).length || (checkResult.duplicate_families || []).length) > 0
              ? `The check opened ${(checkResult.cases || []).length} case(s) and found ${(checkResult.duplicate_families || []).length} possible duplicate family match(es).`
              : "No duplicates or conflicts were found."}
          </Notice>
        )}

        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {tab === "members" && (
          <Card
            eyebrow="Members"
            title="Family members"
            subnote={`${members.length} active member${members.length === 1 ? "" : "s"}`}
            action={
              <Button size="sm" onClick={() => setAddMemberOpen(true)}>
                Add member
              </Button>
            }
          >
            <Stack gap={10}>
              {members.map((m) => (
                <div key={m.member_id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                  <Row justify="space-between" gap={12}>
                    <div>
                      <Row gap={8}>
                        <span style={{ fontSize: 13, fontWeight: 550 }}>{m.name}</span>
                        {m.is_head && <Tag tone="blue">Head</Tag>}
                      </Row>
                      <Muted>
                        {relationToHead(family, m)}
                        {m.date_of_birth ? ` · ${ageFromDob(m.date_of_birth)} yrs` : ""}
                        {m.gender ? ` · ${titleCase(m.gender)}` : ""}
                        {" · "}
                        {m.aadhaar_linked ? "Aadhaar linked" : "Aadhaar not linked"}
                      </Muted>
                    </div>
                    <Row gap={8}>
                      <StatusTag status={m.verification_status} />
                      <Button size="sm" variant="outline" onClick={() => setFetchFor(m)}>
                        Fetch records
                      </Button>
                    </Row>
                  </Row>
                </div>
              ))}
              {members.length === 0 && <Muted>No members recorded yet.</Muted>}
            </Stack>
          </Card>
        )}

        {tab === "relationships" && (
          <Card
            eyebrow="Relationships"
            title="Relationships"
            action={
              <Button size="sm" onClick={() => setAddRelOpen(true)}>
                Add relationship
              </Button>
            }
          >
            <Table
              columns={[
                { key: "member_name", header: "Member" },
                { key: "relationship_type", header: "Relationship", render: (r: any) => titleCase(r.relationship_type) },
                { key: "related_member_name", header: "Related to" },
                { key: "start_date", header: "Since", render: (r: any) => fmtDate(r.start_date) },
                { key: "verification_status", header: "Status", render: (r: any) => <StatusTag status={r.verification_status} /> },
              ]}
              rows={family.relationships || []}
              rowKey={(r: any) => r.relationship_id}
              empty="No relationships recorded yet."
            />
          </Card>
        )}

        {tab === "documents" && (
          <Card
            eyebrow="Documents"
            title="Documents"
            subnote={`${family.documents.length} uploaded`}
            action={
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                Upload document
              </Button>
            }
          >
            <Table
              columns={[
                { key: "document_type", header: "Type", render: (d: any) => titleCase(d.document_type) },
                {
                  key: "owner",
                  header: "Belongs to",
                  render: (d: any) => (d.owner_type === "MEMBER" ? members.find((m) => m.member_id === d.member_id)?.name || "Member" : "Family"),
                },
                { key: "document_reference", header: "Reference", render: (d: any) => <Mono size={11}>{d.document_reference || "—"}</Mono> },
                { key: "issue_date", header: "Issued", render: (d: any) => fmtDate(d.issue_date) },
                { key: "verification_status", header: "Status", render: (d: any) => <StatusTag status={d.verification_status} /> },
                {
                  key: "file_url",
                  header: "",
                  align: "right",
                  render: (d: any) =>
                    d.file_url ? (
                      <a href={d.file_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", fontSize: 12, fontWeight: 550 }}>
                        View
                      </a>
                    ) : (
                      "—"
                    ),
                },
              ]}
              rows={family.documents || []}
              rowKey={(d: any) => d.document_id}
              empty="No documents uploaded yet."
            />
          </Card>
        )}

        {tab === "addresses" && (
          <Card eyebrow="Addresses" title="Addresses on record">
            <Stack gap={10}>
              {(family.addresses || []).map((a: any) => (
                <div key={a.address_id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                  <Row justify="space-between" gap={12}>
                    <div>
                      <div style={{ fontSize: 13 }}>{a.address_line}</div>
                      <Muted>
                        {[a.village, a.taluka, a.district, a.state, a.pincode].filter(Boolean).join(", ")}
                      </Muted>
                    </div>
                    <Row gap={8}>
                      <Tag tone="neutral">{titleCase(a.address_type)}</Tag>
                      {a.is_current && <Tag tone="success">Current</Tag>}
                    </Row>
                  </Row>
                </div>
              ))}
              {(family.addresses || []).length === 0 && <Muted>No addresses recorded yet.</Muted>}
            </Stack>
          </Card>
        )}

        {tab === "verification" && (
          <Card eyebrow="Verification" title="Verification cases">
            <Table
              columns={[
                { key: "case_number", header: "Case", render: (c: any) => <Mono size={11}>{c.case_number}</Mono> },
                { key: "case_type", header: "Type", render: (c: any) => titleCase(c.case_type) },
                { key: "reason", header: "Reason", render: (c: any) => c.reason || "—" },
                { key: "priority", header: "Priority", render: (c: any) => titleCase(c.priority) },
                { key: "case_status", header: "Status", render: (c: any) => <StatusTag status={c.case_status} /> },
              ]}
              rows={family.verification_cases || []}
              rowKey={(c: any) => c.case_id}
              empty="No verification cases have been opened."
            />
          </Card>
        )}

        {tab === "timeline" && (
          <Card eyebrow="Timeline" title="Life events and activity">
            {timelineItems.length === 0 ? <Muted>Nothing has been recorded yet.</Muted> : <Timeline items={timelineItems} />}
          </Card>
        )}
      </Stack>

      <AddMemberModal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        family={family}
        onDone={() => {
          fam.reload();
          toast.push("Member added.", "success");
        }}
      />
      <AddRelationshipModal
        open={addRelOpen}
        onClose={() => setAddRelOpen(false)}
        family={family}
        onDone={() => {
          fam.reload();
          toast.push("Relationship added.", "success");
        }}
      />
      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        familyId={family.family_id}
        members={members}
        onUploaded={() => {
          fam.reload();
          toast.push("Document uploaded.", "success");
        }}
      />
      <LifeEventModal
        open={lifeEventOpen}
        onClose={() => setLifeEventOpen(false)}
        family={family}
        districts={districts}
        onDone={() => {
          fam.reload();
          toast.push("Life event reported.", "success");
        }}
      />
      <FetchRecordsModal open={fetchFor !== null} onClose={() => setFetchFor(null)} family={family} member={fetchFor} onFetched={() => fam.reload()} />
    </>
  );
}

function AddMemberModal({ open, onClose, family, onDone }: { open: boolean; onClose: () => void; family: FamilyDetail; onDone: () => void }) {
  const members = activeMembers(family);
  const head = headOf(family);
  const [form, setForm] = useState<MemberForm>(emptyMember({ related_member_id: head?.member_id || "" }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<any[] | null>(null);

  useEffect(() => {
    if (open) {
      setForm(emptyMember({ related_member_id: head?.member_id || "" }));
      setError(null);
      setConflict(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (force = false) => {
    if (!form.name.trim()) return setError("Please enter the member's name.");
    if (!form.relationship_type) return setError("Please choose the relationship.");
    if (!isNewborn(form.date_of_birth) && !form.aadhaar_reference.trim()) {
      return setError("Aadhaar number is required. Only a newborn under one year old may be added with a birth certificate instead.");
    }
    setBusy(true);
    setError(null);
    try {
      const payload = memberPayload({ ...form, force }, { includeRelationship: true });
      await api(`/families/${family.family_id}/members`, { method: "POST", body: payload });
      setConflict(null);
      onDone();
      onClose();
    } catch (e) {
      const cands = conflictCandidates(e);
      if (cands) setConflict(cands);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        title="Add a family member"
        onClose={onClose}
        footer={
          <Row gap={8} justify="flex-end">
            <Button variant="outline" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button onClick={() => submit(false)} loading={busy} type="button">
              Add member
            </Button>
          </Row>
        }
      >
        <Stack gap={12}>
          {error && <Notice tone="danger">{error}</Notice>}
          <MemberFields value={form} onChange={setForm} mode="member" members={members} />
        </Stack>
      </Modal>
      <ConflictModal open={conflict !== null} candidates={conflict || []} onClose={() => setConflict(null)} onContinue={() => submit(true)} busy={busy} />
    </>
  );
}

function AddRelationshipModal({ open, onClose, family, onDone }: { open: boolean; onClose: () => void; family: FamilyDetail; onDone: () => void }) {
  const members = activeMembers(family);
  const [memberId, setMemberId] = useState("");
  const [relatedId, setRelatedId] = useState("");
  const [relType, setRelType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMemberId("");
      setRelatedId("");
      setRelType("");
      setStartDate("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!memberId || !relatedId) return setError("Please choose both members.");
    if (memberId === relatedId) return setError("Please choose two different members.");
    if (!relType) return setError("Please choose the relationship type.");
    setBusy(true);
    setError(null);
    try {
      await api(`/families/${family.family_id}/relationships`, {
        method: "POST",
        body: { member_id: memberId, related_member_id: relatedId, relationship_type: relType, start_date: startDate || undefined },
      });
      onDone();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Add a relationship"
      onClose={onClose}
      footer={
        <Row gap={8} justify="flex-end">
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} type="button">
            Add relationship
          </Button>
        </Row>
      }
    >
      <Stack gap={12}>
        {error && <Notice tone="danger">{error}</Notice>}
        <Grid cols={2}>
          <Select label="Member" value={memberId} onChange={(e: any) => setMemberId(e.target.value)}>
            {memberOptions(members, "Select")}
          </Select>
          <Select label="Related to" value={relatedId} onChange={(e: any) => setRelatedId(e.target.value)}>
            {memberOptions(members, "Select")}
          </Select>
          <Select label="Relationship type" value={relType} onChange={(e: any) => setRelType(e.target.value)}>
            {options(RELATIONSHIP_TYPES, "Select")}
          </Select>
          <Input label="Since (optional)" type="date" value={startDate} onChange={(e: any) => setStartDate(e.target.value)} />
        </Grid>
      </Stack>
    </Modal>
  );
}
