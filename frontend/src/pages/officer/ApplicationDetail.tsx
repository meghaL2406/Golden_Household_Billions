import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Icon, KeyValue, Notice, PageHeader, Skeleton, StatusTag, Tag, Timeline } from "../../components";
import { api } from "../../lib/api";
import { useApi, useToast } from "../../lib/hooks";
import { fmtDateTime, fmtMoney, titleCase } from "../../lib/format";
import { ActionModal, DocumentGallery, FamilySummaryCard, type ActionField } from "./_shared";

type ActionKind = "UNDER_REVIEW" | "REQUEST_INFO" | "APPROVE" | "REJECT";

const CLOSED = ["APPROVED", "REJECTED", "WITHDRAWN"];

export default function ApplicationDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<any>(id ? `/applications/${id}` : null, undefined, [id]);
  const [action, setAction] = useState<ActionKind | null>(null);

  if (loading && !data) return <Skeleton rows={10} />;
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <Notice tone="warning">The application could not be found.</Notice>;

  const app = data.application;
  const scheme = data.scheme;
  const family = data.family;
  const eligibility = data.eligibility;
  const benefit = data.benefit;
  const closed = CLOSED.includes(app.application_status);
  const prefilled = app.prefilled_data ?? {};
  const history: any[] = app.status_history ?? [];

  const titles: Record<ActionKind, string> = {
    UNDER_REVIEW: "Move under review",
    REQUEST_INFO: "Request information",
    APPROVE: "Approve application",
    REJECT: "Reject application",
  };

  const fieldsFor = (kind: ActionKind): ActionField[] => {
    switch (kind) {
      case "REQUEST_INFO":
        return [{ key: "remarks", label: "What information is required", kind: "textarea", required: true }];
      case "APPROVE":
        return [
          { key: "benefit_amount", label: "Benefit amount", kind: "number", hint: "Leave blank to use the scheme's default amount." },
          { key: "remarks", label: "Remarks", kind: "textarea" },
        ];
      case "REJECT":
        return [{ key: "remarks", label: "Reason for rejection", kind: "textarea", required: true }];
      default:
        return [{ key: "remarks", label: "Remarks", kind: "textarea" }];
    }
  };

  async function submit(kind: ActionKind, v: Record<string, string>) {
    const body: any = { action: kind };
    if (v.remarks) body.remarks = v.remarks;
    if (kind === "APPROVE" && v.benefit_amount) body.benefit_amount = Number(v.benefit_amount);
    await api(`/applications/${id}/action`, { method: "POST", body });
    toast.push(`${titles[kind]} completed.`, "success");
    reload();
  }

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader
        eyebrow="APPLICATION"
        title={app.application_number}
        description={`${scheme?.scheme_name ?? "Scheme"} · submitted ${fmtDateTime(app.created_at)}`}
        action={<StatusTag status={app.application_status} />}
      />

      {!closed && (
        <Card eyebrow="ACTIONS" title="Decide this application" subnote="Every action is recorded in the status history and notifies the citizen.">
          <div className="row gap-8 wrap">
            <Button variant="outline" icon={<Icon name="clock" size={15} />} onClick={() => setAction("UNDER_REVIEW")}>
              Under review
            </Button>
            <Button variant="outline" icon={<Icon name="message" size={15} />} onClick={() => setAction("REQUEST_INFO")}>
              Request information
            </Button>
            <Button icon={<Icon name="check" size={15} />} onClick={() => setAction("APPROVE")}>
              Approve
            </Button>
            <Button variant="danger" icon={<Icon name="x" size={15} />} onClick={() => setAction("REJECT")}>
              Reject
            </Button>
          </div>
        </Card>
      )}
      {app.rejection_reason && <Notice tone="danger">Rejection reason: {app.rejection_reason}</Notice>}

      <Card eyebrow="SCHEME" title={scheme?.scheme_name ?? "Scheme"} subnote={scheme?.description}>
        <KeyValue
          columns={3}
          items={[
            { label: "Scheme code", value: <span className="mono">{scheme?.scheme_code ?? "—"}</span> },
            { label: "Department", value: scheme?.department ? titleCase(scheme.department) : "—" },
            { label: "Category", value: scheme?.category ? <Tag tone="blue">{titleCase(scheme.category)}</Tag> : "—" },
            { label: "Benefit type", value: scheme?.benefit_type ? titleCase(scheme.benefit_type) : "—" },
            { label: "Benefit amount", value: scheme?.benefit_amount ? fmtMoney(Number(scheme.benefit_amount)) : "—" },
            { label: "Frequency", value: scheme?.benefit_frequency ? titleCase(scheme.benefit_frequency) : "—" },
          ]}
        />
      </Card>

      <Card eyebrow="ELIGIBILITY" title="Eligibility at time of review">
        {eligibility ? (
          <KeyValue
            columns={2}
            items={[
              { label: "Status", value: <StatusTag status={eligibility.eligibility_status ?? eligibility.status} /> },
              { label: "Reason", value: eligibility.eligibility_reason ?? eligibility.reason ?? "—" },
            ]}
          />
        ) : (
          <p className="caption">No eligibility record was captured with this application.</p>
        )}
      </Card>

      <Card eyebrow="PRE-FILLED DATA" title="Data captured from the verified family record">
        {Object.keys(prefilled).length === 0 ? (
          <p className="caption">No pre-filled data was recorded.</p>
        ) : (
          <KeyValue columns={3} items={Object.entries(prefilled).map(([k, v]) => ({ label: titleCase(k), value: v === null || v === undefined ? "—" : String(v) }))} />
        )}
      </Card>

      <Card eyebrow="DOCUMENTS" title="Attached documents">
        <DocumentGallery documents={data.documents ?? []} onChanged={reload} />
      </Card>

      {family && <FamilySummaryCard family={family} title="Applicant family" />}

      {benefit && (
        <Card eyebrow="BENEFIT" title="Resulting benefit record">
          <KeyValue
            columns={3}
            items={[
              { label: "Delivery status", value: <StatusTag status={benefit.delivery_status} /> },
              { label: "Amount", value: benefit.benefit_amount ? fmtMoney(Number(benefit.benefit_amount)) : "—" },
              { label: "Sanctioned", value: benefit.sanctioned_at ? fmtDateTime(benefit.sanctioned_at) : "—" },
            ]}
          />
        </Card>
      )}

      <Card eyebrow="HISTORY" title="Status history">
        {history.length === 0 ? (
          <p className="caption">No status changes have been recorded.</p>
        ) : (
          <Timeline
            items={history.map((h: any) => ({
              title: titleCase(h.status ?? h.action ?? "Update"),
              at: h.at ?? h.timestamp,
              note: h.remarks ?? h.note ?? undefined,
            }))}
          />
        )}
      </Card>

      <ActionModal
        open={!!action}
        title={action ? titles[action] : ""}
        fields={action ? fieldsFor(action) : []}
        confirmLabel={action ? titles[action].split(" ")[0] : "Confirm"}
        danger={action === "REJECT"}
        onClose={() => setAction(null)}
        onConfirm={(v) => (action ? submit(action, v) : Promise.resolve())}
      />
    </div>
  );
}
