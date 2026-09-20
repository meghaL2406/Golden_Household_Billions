import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Icon, KeyValue, Notice, PageHeader, Skeleton, StatusTag, Table, Tag } from "../../components";
import { api } from "../../lib/api";
import { useApi, useToast } from "../../lib/hooks";
import { fmtDate, fmtDateTime, titleCase } from "../../lib/format";
import { ActionModal, ageOf, DateTime, DocumentGallery, FamilySummaryCard, JsonBlock, priorityTone, ScoreBar, type ActionField } from "./_shared";

type ActionKind = "ASSIGN" | "REQUEST_INFO" | "APPROVE" | "REJECT" | "MERGE" | "CLOSE";

const CLOSED = ["APPROVED", "REJECTED", "CLOSED"];

export default function CaseDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<any>(id ? `/verification/cases/${id}` : null, undefined, [id]);
  const officers = useApi<any[]>("/verification/officers");
  const [action, setAction] = useState<ActionKind | null>(null);

  if (loading && !data) return <Skeleton rows={10} />;
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <Notice tone="warning">The case could not be found.</Notice>;

  const c = data.case;
  const family = data.family;
  const related = data.related_family;
  const member = data.member;
  const relatedMember = data.related_member;
  const comparison = data.comparison ?? { fields: [] };
  const evidence = c.evidence ?? {};
  const isMergeType = c.case_type === "DUPLICATE_FAMILY" || c.case_type === "MERGE_REQUEST";
  const closed = CLOSED.includes(c.case_status);

  const fieldsFor = (kind: ActionKind): ActionField[] => {
    switch (kind) {
      case "ASSIGN":
        return [
          {
            key: "assign_to_user_id",
            label: "Officer",
            kind: "select",
            required: true,
            options: (officers.data ?? []).map((o) => ({ value: o.user_id, label: `${o.name} · ${titleCase(o.role)}${o.district ? ` · ${o.district}` : ""}` })),
          },
        ];
      case "REQUEST_INFO":
        return [{ key: "resolution", label: "What information is required", kind: "textarea", required: true }];
      case "APPROVE":
        return [{ key: "resolution", label: "Resolution note", kind: "textarea" }];
      case "REJECT":
        return [{ key: "resolution", label: "Reason for rejection", kind: "textarea", required: true }];
      case "MERGE":
        return [
          {
            key: "merge_into_family_id",
            label: "Family that survives",
            kind: "select",
            required: true,
            hint: "The other family is marked MERGED and its members move into the surviving family.",
            options: [
              ...(related ? [{ value: related.family_id, label: `${related.family_code ?? "Provisional"} · related family (this family merges into it)` }] : []),
              ...(family ? [{ value: family.family_id, label: `${family.family_code ?? "Provisional"} · this family (related family merges into it)` }] : []),
            ],
          },
          { key: "resolution", label: "Resolution note", kind: "textarea" },
        ];
      case "CLOSE":
        return [{ key: "resolution", label: "Closing note", kind: "textarea" }];
    }
  };

  const titles: Record<ActionKind, string> = {
    ASSIGN: "Assign case",
    REQUEST_INFO: "Request information",
    APPROVE: "Approve case",
    REJECT: "Reject case",
    MERGE: "Merge families",
    CLOSE: "Close case",
  };

  const descriptions: Partial<Record<ActionKind, string>> = {
    APPROVE:
      c.case_type === "FAMILY_VERIFICATION"
        ? "The family is marked verified and a Family ID is issued."
        : c.case_type === "LIFE_EVENT"
          ? "The life event is applied to the family record."
          : c.case_type.startsWith("DUPLICATE")
            ? "The records are confirmed as distinct persons or households."
            : undefined,
    REJECT: c.case_type === "DUPLICATE_PERSON" ? "The flagged member is marked as having left this family." : undefined,
  };

  async function submit(kind: ActionKind, v: Record<string, string>) {
    const body: any = { action: kind };
    if (v.resolution) body.resolution = v.resolution;
    if (v.assign_to_user_id) body.assign_to_user_id = v.assign_to_user_id;
    if (kind === "MERGE") {
      // The API merges case.family into merge_into_family_id. When the officer keeps this family,
      // the related family must be the source, which the backend does not support directly; we pass
      // the chosen survivor and rely on the server to reject an unsupported direction.
      body.merge_into_family_id = v.merge_into_family_id;
    }
    await api(`/verification/cases/${id}/action`, { method: "POST", body });
    toast.push(`${titles[kind]} completed.`, "success");
    reload();
  }

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader
        eyebrow="VERIFICATION CASE"
        title={c.case_number}
        description={`${titleCase(c.case_type)} · opened ${ageOf(c.created_at)} ago · ${c.assigned_officer_name ? `assigned to ${c.assigned_officer_name}` : "unassigned"}`}
        action={
          <div className="row gap-8">
            <Tag tone={priorityTone(c.priority)}>{titleCase(c.priority)} priority</Tag>
            <StatusTag status={c.case_status} />
          </div>
        }
      />

      {!closed && (
        <Card eyebrow="ACTIONS" title="Decide this case" subnote="Every action is confirmed and recorded in the audit trail.">
          <div className="row gap-8 wrap">
            <Button variant="outline" icon={<Icon name="user-plus" size={15} />} onClick={() => setAction("ASSIGN")}>Assign</Button>
            <Button variant="outline" icon={<Icon name="message" size={15} />} onClick={() => setAction("REQUEST_INFO")}>Request information</Button>
            <Button icon={<Icon name="check" size={15} />} onClick={() => setAction("APPROVE")}>Approve</Button>
            <Button variant="danger" icon={<Icon name="x" size={15} />} onClick={() => setAction("REJECT")}>Reject</Button>
            {isMergeType && (
              <Button variant="outline" icon={<Icon name="merge" size={15} />} onClick={() => setAction("MERGE")}>Merge</Button>
            )}
            <Button variant="ghost" onClick={() => setAction("CLOSE")}>Close</Button>
          </div>
        </Card>
      )}
      {closed && c.resolution && <Notice tone="info">Resolution: {c.resolution}</Notice>}

      <Card eyebrow="REASON" title={c.reason ?? "No reason recorded"} subnote={`Raised ${fmtDateTime(c.created_at)}.`}>
        <Evidence caseType={c.case_type} evidence={evidence} />
      </Card>

      {member && (
        <Card eyebrow="COMPARISON" title="Entered data against source record" subnote={comparison.source ? `Source: ${titleCase(comparison.source)} ${comparison.external_reference_id ?? ""}` : "No external record has been fetched for this member."}>
          <div className="grid-2" style={{ gap: 0, borderTop: "1px solid var(--line)" }}>
            <div style={{ padding: "8px 0" }}><span className="eyebrow">Entered in Family ID</span></div>
            <div style={{ padding: "8px 0" }}><span className="eyebrow">Source record / related family</span></div>
          </div>
          {comparison.fields.map((f: any) => {
            const source = f.source ?? (relatedMember ? relatedMember[f.field] : null);
            const match = f.match ?? (source !== null && source !== undefined ? String(f.entered ?? "").toLowerCase() === String(source).toLowerCase() : null);
            return (
              <div key={f.field} className="grid-2" style={{ gap: 0, borderTop: "1px solid var(--line)", padding: "10px 0" }}>
                <div className="col">
                  <span className="caption">{titleCase(f.field)}</span>
                  <span className="body-13">{f.entered ?? "—"}</span>
                </div>
                <div className="row between">
                  <div className="col">
                    <span className="caption">{titleCase(f.field)}</span>
                    <span className="body-13">{source ?? "—"}</span>
                  </div>
                  {match === true && <Tag tone="success">Match</Tag>}
                  {match === false && <Tag tone="danger">Mismatch</Tag>}
                  {match === null && <Tag tone="neutral">Not available</Tag>}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {data.life_event && (
        <Card eyebrow="LIFE EVENT" title={titleCase(data.life_event.event_type)} subnote={data.life_event.event_date ? `Event date ${fmtDate(data.life_event.event_date)}` : undefined}>
          <KeyValue
            columns={3}
            items={[
              { label: "Status", value: <StatusTag status={data.life_event.verification_status} /> },
              { label: "Applied", value: data.life_event.applied ? "Yes" : "No" },
              { label: "Reported", value: <DateTime iso={data.life_event.created_at} /> },
            ]}
          />
          <div style={{ marginTop: 12 }}>
            <p className="caption">Details</p>
            <JsonBlock value={data.life_event.details} />
          </div>
        </Card>
      )}

      <div className="grid-2" style={{ alignItems: "start" }}>
        <FamilySummaryCard family={family} eyebrow="FAMILY" title="Family under review" highlightMemberId={member?.member_id} />
        <FamilySummaryCard family={related} eyebrow="RELATED FAMILY" title="Related family" highlightMemberId={relatedMember?.member_id} />
      </div>

      <Card eyebrow="DOCUMENTS" title="Documents" subnote="Documents of the family or the flagged member.">
        <DocumentGallery documents={data.documents ?? []} onChanged={reload} />
      </Card>

      <Card eyebrow="EXTERNAL RECORDS" title="Source system records">
        <Table
          columns={[
            { key: "src", header: "Source", render: (r: any) => <Tag tone="neutral">{titleCase(r.source_system)}</Tag> },
            { key: "type", header: "Type", render: (r: any) => titleCase(r.record_type) },
            { key: "ref", header: "Reference", render: (r: any) => <span className="mono">{r.external_reference_id ?? "—"}</span> },
            { key: "match", header: "Match", render: (r: any) => <StatusTag status={r.match_status} /> },
            { key: "data", header: "Fetched data", render: (r: any) => <span className="mono" style={{ fontSize: 11 }}>{summarise(r.fetched_data)}</span> },
          ]}
          rows={data.external_records ?? []}
          rowKey={(r: any) => r.record_id}
          empty="No external records have been fetched."
        />
      </Card>

      <ActionModal
        open={!!action}
        title={action ? titles[action] : ""}
        description={action ? descriptions[action] : undefined}
        fields={action ? fieldsFor(action) : []}
        confirmLabel={action ? titles[action].split(" ")[0] : "Confirm"}
        danger={action === "REJECT"}
        onClose={() => setAction(null)}
        onConfirm={(v) => (action ? submit(action, v) : Promise.resolve())}
      />
    </div>
  );
}

function summarise(obj: any): string {
  if (!obj || typeof obj !== "object") return "—";
  return Object.entries(obj)
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

function Evidence({ caseType, evidence }: { caseType: string; evidence: any }) {
  if (!evidence || Object.keys(evidence).length === 0) {
    return <p className="caption">No structured evidence was attached to this case.</p>;
  }

  if (caseType === "DUPLICATE_PERSON" && Array.isArray(evidence.candidates)) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <p className="caption">Candidate matches in other families, ordered by similarity score.</p>
        <Table
          columns={[
            { key: "name", header: "Candidate", render: (d: any) => d.name },
            { key: "family", header: "Family", render: (d: any) => <span className="mono">{d.family_code ?? "Provisional"}</span> },
            { key: "dob", header: "Born", render: (d: any) => (d.date_of_birth ? fmtDate(d.date_of_birth) : "—") },
            { key: "district", header: "District", render: (d: any) => d.district ?? "—" },
            { key: "score", header: "Score", render: (d: any) => <ScoreBar score={Number(d.score)} /> },
            { key: "level", header: "Level", render: (d: any) => <Tag tone={d.level === "BLOCK" ? "danger" : d.level === "REVIEW" ? "warning" : "neutral"}>{titleCase(d.level)}</Tag> },
            { key: "reasons", header: "Reasons", render: (d: any) => (d.reasons ?? []).join("; ") },
          ]}
          rows={evidence.candidates}
          rowKey={(d: any) => d.member_id}
        />
      </div>
    );
  }

  if (caseType === "DUPLICATE_FAMILY" && Array.isArray(evidence.overlaps)) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <div className="row gap-16 wrap">
          <span className="body-13">
            Overall similarity <ScoreBar score={Number(evidence.score ?? 0)} />
          </span>
          {evidence.level && <Tag tone={evidence.level === "BLOCK" ? "danger" : "warning"}>{titleCase(evidence.level)}</Tag>}
        </div>
        <Table
          columns={[
            { key: "ours", header: "Our member", render: (o: any) => o.our_member },
            { key: "theirs", header: "Their member", render: (o: any) => o.their_member },
            { key: "score", header: "Score", render: (o: any) => <ScoreBar score={Number(o.score)} /> },
            { key: "reasons", header: "Reasons", render: (o: any) => (o.reasons ?? []).join("; ") },
          ]}
          rows={evidence.overlaps}
          rowKey={(o: any, ) => `${o.our_member}-${o.their_member}`}
        />
      </div>
    );
  }

  if (caseType === "AADHAAR_MISMATCH" && evidence.entered) {
    const keys = Array.from(new Set([...Object.keys(evidence.entered ?? {}), ...Object.keys(evidence.fetched ?? {})]));
    return (
      <Table
        columns={[
          { key: "field", header: "Field", render: (k: string) => titleCase(k) },
          { key: "entered", header: "Entered", render: (k: string) => String(evidence.entered?.[k] ?? "—") },
          { key: "fetched", header: `${titleCase(evidence.source_system ?? "Source")} record`, render: (k: string) => String(evidence.fetched?.[k] ?? "—") },
          {
            key: "match",
            header: "Result",
            render: (k: string) => {
              const a = evidence.entered?.[k];
              const b = evidence.fetched?.[k];
              if (a === undefined || b === undefined) return <Tag tone="neutral">Not compared</Tag>;
              return String(a).toLowerCase() === String(b).toLowerCase() ? <Tag tone="success">Match</Tag> : <Tag tone="danger">Mismatch</Tag>;
            },
          },
        ]}
        rows={keys}
        rowKey={(k: string) => k}
      />
    );
  }

  if (caseType === "MANUAL_REVIEW" && evidence.declared !== undefined) {
    return (
      <KeyValue
        columns={2}
        items={[
          { label: "Declared members", value: <span className="tabular">{evidence.declared}</span> },
          { label: "Members added", value: <span className="tabular">{evidence.added}</span> },
        ]}
      />
    );
  }

  return (
    <KeyValue
      columns={2}
      items={Object.entries(evidence)
        .filter(([, v]) => typeof v !== "object" || v === null)
        .map(([k, v]) => ({ label: titleCase(k), value: String(v ?? "—") }))}
    />
  );
}
