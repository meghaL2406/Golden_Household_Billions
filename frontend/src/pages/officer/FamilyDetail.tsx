import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Icon,
  KeyValue,
  Notice,
  PageHeader,
  Skeleton,
  StatRow,
  StatTile,
  StatusTag,
  Table,
  Tabs,
  Tag,
  Timeline,
} from "../../components";
import { api } from "../../lib/api";
import { useApi, useToast } from "../../lib/hooks";
import { fmtDate, fmtDateTime, fmtMoney, titleCase } from "../../lib/format";
import { DateTime, DocumentGallery, errMsg, JsonBlock, priorityTone, shortId, Unit, type Paginated } from "./_shared";

const TABS = [
  { key: "members", label: "Members" },
  { key: "relationships", label: "Relationships" },
  { key: "documents", label: "Documents" },
  { key: "external", label: "External records" },
  { key: "cases", label: "Cases" },
  { key: "events", label: "Life events" },
  { key: "eligibility", label: "Eligibility" },
  { key: "audit", label: "Audit" },
];

export default function FamilyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState("members");
  const [busy, setBusy] = useState(false);
  const { data: f, loading, error, reload } = useApi<any>(id ? `/families/${id}` : null, undefined, [id]);

  async function runChecks() {
    if (!id) return;
    setBusy(true);
    try {
      const res = await api<{ cases: any[]; duplicate_families: any[] }>(`/families/${id}/run-checks`, { method: "POST" });
      toast.push(`Checks completed. ${res.cases?.length ?? 0} cases opened or updated.`, "success");
      reload();
    } catch (e) {
      toast.push(errMsg(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !f) return <Skeleton rows={10} />;
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!f) return <Notice tone="warning">The family could not be found.</Notice>;

  const members: any[] = f.members ?? [];
  const head = members.find((m) => m.is_head);
  const openCases = (f.verification_cases ?? []).filter((c: any) => !["APPROVED", "REJECTED", "CLOSED"].includes(c.case_status));
  const verifiedDocs = (f.documents ?? []).filter((d: any) => d.verification_status === "VERIFIED").length;

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader
        eyebrow="FAMILY PROFILE"
        title={f.family_code ?? "Provisional family"}
        description={`${head?.name ?? "No head recorded"} · ${f.district ?? "District not recorded"}${f.village ? ` · ${f.village}` : ""}`}
        action={
          <div className="row gap-8">
            <StatusTag status={f.family_status} />
            <Button variant="outline" icon={<Icon name="refresh" size={15} />} loading={busy} onClick={runChecks}>
              Run checks
            </Button>
          </div>
        }
      />

      <StatRow>
        <StatTile label="Active members" value={f.active_member_count ?? members.length} unit="members" />
        <StatTile label="Open cases" value={openCases.length} unit="cases" />
        <StatTile label="Verified documents" value={verifiedDocs} unit={`of ${(f.documents ?? []).length}`} />
        <StatTile label="Completeness" value={f.completeness?.percent ?? 0} unit="%" note={`${(f.completeness?.steps ?? []).filter((s: any) => s.done).length} of ${(f.completeness?.steps ?? []).length} steps done`} />
      </StatRow>

      <Card eyebrow="HOUSEHOLD" title="Household details">
        <KeyValue
          columns={3}
          items={[
            { label: "Family type", value: f.family_type ? titleCase(f.family_type) : "—" },
            { label: "Income category", value: f.income_category ?? "—" },
            { label: "Annual income", value: f.annual_income ? <span className="tabular">{fmtMoney(Number(f.annual_income))}<Unit>per year</Unit></span> : "—" },
            { label: "Ration card", value: f.ration_card_type ?? "—" },
            { label: "Declared members", value: <span className="tabular">{f.declared_member_count ?? "—"}</span> },
            { label: "Verification", value: <StatusTag status={f.verification_status} /> },
            { label: "Taluka", value: f.taluka ?? "—" },
            { label: "Pincode", value: <span className="mono">{f.pincode ?? "—"}</span> },
            { label: "Created", value: <DateTime iso={f.created_at} /> },
          ]}
        />
      </Card>

      <Tabs
        tabs={TABS.map((t) => ({
          ...t,
          count:
            t.key === "members" ? members.length
            : t.key === "relationships" ? (f.relationships ?? []).length
            : t.key === "documents" ? (f.documents ?? []).length
            : t.key === "external" ? (f.external_records ?? []).length
            : t.key === "cases" ? (f.verification_cases ?? []).length
            : t.key === "events" ? (f.life_events ?? []).length
            : undefined,
        }))}
        active={tab}
        onChange={setTab}
      />

      {tab === "members" && (
        <Card eyebrow="MEMBERS" title="Household members">
          <Table
            columns={[
              { key: "name", header: "Name", render: (m: any) => <span className={m.is_head ? "emph" : undefined}>{m.name}{m.is_head ? " (head)" : ""}</span> },
              { key: "dob", header: "Born", render: (m: any) => (m.date_of_birth ? `${fmtDate(m.date_of_birth)}` : "—") },
              { key: "age", header: "Age", align: "right", render: (m: any) => (m.age !== undefined && m.age !== null ? <span className="tabular">{m.age}<Unit>years</Unit></span> : "—") },
              { key: "gender", header: "Gender", render: (m: any) => (m.gender ? titleCase(m.gender) : "—") },
              { key: "aadhaar", header: "Aadhaar", render: (m: any) => (m.aadhaar_linked ? <span className="mono">{m.aadhaar_reference ?? "linked"}</span> : <Tag tone="neutral">Not linked</Tag>) },
              { key: "mstatus", header: "Member status", render: (m: any) => <StatusTag status={m.member_status} /> },
              { key: "vstatus", header: "Verification", render: (m: any) => <StatusTag status={m.verification_status} /> },
              { key: "source", header: "Identity source", render: (m: any) => (m.identity_source ? titleCase(m.identity_source) : "—") },
            ]}
            rows={members}
            rowKey={(m: any) => m.member_id}
            empty="No members recorded."
          />
        </Card>
      )}

      {tab === "relationships" && (
        <Card eyebrow="RELATIONSHIPS" title="Declared relationships">
          <Table
            columns={[
              { key: "a", header: "Member", render: (r: any) => r.member_name },
              { key: "type", header: "Is the", render: (r: any) => <Tag tone="blue">{titleCase(r.relationship_type)}</Tag> },
              { key: "b", header: "Of", render: (r: any) => r.related_member_name },
              { key: "start", header: "Since", render: (r: any) => (r.start_date ? fmtDate(r.start_date) : "—") },
              { key: "status", header: "Status", render: (r: any) => <StatusTag status={r.verification_status} /> },
            ]}
            rows={f.relationships ?? []}
            rowKey={(r: any) => r.relationship_id}
            empty="No relationships recorded."
          />
        </Card>
      )}

      {tab === "documents" && (
        <Card eyebrow="DOCUMENTS" title="Uploaded documents" subnote="Verify or reject pending documents; the family is notified.">
          <DocumentGallery documents={f.documents ?? []} onChanged={reload} />
        </Card>
      )}

      {tab === "external" && (
        <Card eyebrow="EXTERNAL RECORDS" title="Records fetched from source systems">
          <Table
            columns={[
              { key: "src", header: "Source", render: (r: any) => <Tag tone="neutral">{titleCase(r.source_system)}</Tag> },
              { key: "type", header: "Record type", render: (r: any) => titleCase(r.record_type) },
              { key: "ref", header: "Reference", render: (r: any) => <span className="mono">{r.external_reference_id ?? "—"}</span> },
              { key: "member", header: "Member", render: (r: any) => members.find((m) => m.member_id === r.member_id)?.name ?? "Family" },
              { key: "match", header: "Match", render: (r: any) => <StatusTag status={r.match_status} /> },
              { key: "score", header: "Score", align: "right", render: (r: any) => (r.match_score !== null && r.match_score !== undefined ? <span className="tabular">{Number(r.match_score)}<Unit>%</Unit></span> : "—") },
              { key: "at", header: "Fetched", render: (r: any) => <DateTime iso={r.last_verified_at ?? r.created_at} /> },
            ]}
            rows={f.external_records ?? []}
            rowKey={(r: any) => r.external_record_id ?? r.record_id ?? `${r.source_system}-${r.external_reference_id}`}
            empty="No external records have been fetched."
          />
        </Card>
      )}

      {tab === "cases" && (
        <Card eyebrow="VERIFICATION CASES" title="Cases for this family">
          <Table
            columns={[
              { key: "no", header: "Case", render: (c: any) => <span className="mono">{c.case_number}</span> },
              { key: "type", header: "Type", render: (c: any) => <Tag tone="blue">{titleCase(c.case_type)}</Tag> },
              { key: "reason", header: "Reason", render: (c: any) => c.reason ?? "—" },
              { key: "priority", header: "Priority", render: (c: any) => <Tag tone={priorityTone(c.priority)}>{titleCase(c.priority)}</Tag> },
              { key: "status", header: "Status", render: (c: any) => <StatusTag status={c.case_status} /> },
              { key: "at", header: "Opened", render: (c: any) => <DateTime iso={c.created_at} /> },
            ]}
            rows={f.verification_cases ?? []}
            rowKey={(c: any) => c.case_id}
            onRowClick={(c: any) => nav(`/officer/cases/${c.case_id}`)}
            empty="No verification cases exist for this family."
          />
        </Card>
      )}

      {tab === "events" && (
        <Card eyebrow="LIFE EVENTS" title="Reported life events">
          <Table
            columns={[
              { key: "type", header: "Event", render: (e: any) => <Tag tone="blue">{titleCase(e.event_type)}</Tag> },
              { key: "date", header: "Event date", render: (e: any) => (e.event_date ? fmtDate(e.event_date) : "—") },
              { key: "member", header: "Member", render: (e: any) => members.find((m) => m.member_id === e.member_id)?.name ?? "—" },
              { key: "status", header: "Status", render: (e: any) => <StatusTag status={e.verification_status} /> },
              { key: "applied", header: "Applied", render: (e: any) => (e.applied ? <Tag tone="success">Applied</Tag> : <Tag tone="neutral">Not applied</Tag>) },
              { key: "at", header: "Reported", render: (e: any) => <DateTime iso={e.created_at} /> },
            ]}
            rows={f.life_events ?? []}
            rowKey={(e: any) => e.event_id ?? e.life_event_id}
            empty="No life events have been reported."
          />
        </Card>
      )}

      {tab === "eligibility" && id && <EligibilityTab familyId={id} />}
      {tab === "audit" && id && <AuditTab familyId={id} />}
    </div>
  );
}

function EligibilityTab({ familyId }: { familyId: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useApi<any>(`/eligibility/family/${familyId}`, undefined, [familyId]);

  async function recalc() {
    setBusy(true);
    try {
      await api(`/eligibility/recalculate/${familyId}`, { method: "POST" });
      toast.push("Eligibility has been recalculated.", "success");
      reload();
    } catch (e) {
      toast.push(errMsg(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  const items: any[] = data?.items ?? [];
  const groups = new Map<string, any[]>();
  for (const it of items) {
    const key = it.scheme?.scheme_name ?? it.scheme_id;
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }

  return (
    <Card
      eyebrow="ELIGIBILITY"
      title="Scheme eligibility"
      subnote={data?.checked_at ? `Last checked ${fmtDateTime(data.checked_at)}.` : undefined}
      action={
        <Button variant="outline" size="sm" icon={<Icon name="refresh" size={14} />} loading={busy} onClick={recalc}>
          Recalculate
        </Button>
      }
    >
      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={4} />
      ) : groups.size === 0 ? (
        <p className="caption">No eligibility results have been computed.</p>
      ) : (
        <div className="stack">
          {[...groups.entries()].map(([name, rows]) => (
            <div key={name}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="h2">{name}</span>
                <span className="caption mono">{rows[0]?.scheme?.scheme_code}</span>
              </div>
              <Table
                columns={[
                  { key: "member", header: "Member", render: (r: any) => r.member_name ?? "Family" },
                  { key: "status", header: "Status", render: (r: any) => <StatusTag status={r.eligibility_status} /> },
                  { key: "reason", header: "Reason", render: (r: any) => r.eligibility_reason ?? "—" },
                  { key: "app", header: "Application", render: (r: any) => (r.application ? <span className="mono">{r.application.application_number}</span> : "—") },
                  { key: "benefit", header: "Benefit", render: (r: any) => (r.benefit ? <StatusTag status={r.benefit.delivery_status} /> : "—") },
                ]}
                rows={rows}
                rowKey={(r: any) => r.eligibility_id ?? `${r.scheme_id}-${r.member_id}`}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AuditTab({ familyId }: { familyId: string }) {
  const { data, loading, error } = useApi<Paginated<any>>("/audit", { family_id: familyId, size: 50 }, [familyId]);
  const [open, setOpen] = useState<string | null>(null);
  const rows = data?.items ?? [];
  const selected = rows.find((r) => r.audit_id === open || r.log_id === open);
  return (
    <Card eyebrow="AUDIT" title="Audit trail" subnote="Click a row to view the recorded change.">
      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={5} />
      ) : (
        <div className="stack">
          <Timeline
            items={rows.map((a: any) => ({
              title: `${titleCase(a.action)} · ${titleCase(a.entity_type)} ${shortId(a.reference_id)}`,
              at: fmtDateTime(a.timestamp),
              note: `${a.actor_label ?? "System"}${a.actor_role ? ` (${titleCase(a.actor_role)})` : ""}`,
            }))}
          />
          <div className="row gap-8 wrap">
            {rows.slice(0, 12).map((a: any) => {
              const key = a.audit_id ?? a.log_id;
              return (
                <Button key={key} size="sm" variant={open === key ? "primary" : "outline"} onClick={() => setOpen(open === key ? null : key)}>
                  {titleCase(a.action)}
                </Button>
              );
            })}
          </div>
          {selected && (
            <div className="grid-2">
              <div>
                <p className="caption">Old value</p>
                <JsonBlock value={selected.old_value} />
              </div>
              <div>
                <p className="caption">New value</p>
                <JsonBlock value={selected.new_value} />
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
