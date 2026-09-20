import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Icon, KeyValue, Notice, PageHeader, Skeleton, StatusTag, Tag, Timeline } from "../../components";
import { api } from "../../lib/api";
import { useApi, useToast } from "../../lib/hooks";
import { fmtDate, fmtDateTime, fmtMoney, titleCase } from "../../lib/format";
import { ActionModal, ageOf, FamilySummaryCard, priorityTone, useOfficers, type ActionField } from "./_shared";

type ActionKind = "ASSIGN" | "IN_PROGRESS" | "ESCALATE" | "RESOLVE" | "CLOSE";

const CLOSED = ["RESOLVED", "CLOSED"];

export default function GrievanceDetail() {
  const { id } = useParams();
  const toast = useToast();
  const officers = useOfficers();
  const { data, loading, error, reload } = useApi<any>(id ? `/grievances/${id}` : null, undefined, [id]);
  const [action, setAction] = useState<ActionKind | null>(null);

  if (loading && !data) return <Skeleton rows={10} />;
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <Notice tone="warning">The grievance could not be found.</Notice>;

  const g = data.grievance;
  const family = data.family;
  const application = data.application;
  const benefit = data.benefit;
  const scheme = data.scheme;
  const closed = CLOSED.includes(g.status);
  const history: any[] = g.history ?? [];

  const titles: Record<ActionKind, string> = {
    ASSIGN: "Assign grievance",
    IN_PROGRESS: "Mark in progress",
    ESCALATE: "Escalate grievance",
    RESOLVE: "Resolve grievance",
    CLOSE: "Close grievance",
  };

  const fieldsFor = (kind: ActionKind): ActionField[] => {
    switch (kind) {
      case "ASSIGN":
        return [
          {
            key: "assign_to_user_id",
            label: "Officer",
            kind: "select",
            required: true,
            options: officers.map((o: any) => ({ value: o.user_id, label: `${o.name} · ${titleCase(o.role)}${o.district ? ` · ${o.district}` : ""}` })),
          },
        ];
      case "RESOLVE":
        return [{ key: "note", label: "Resolution", kind: "textarea", required: true }];
      case "ESCALATE":
        return [{ key: "note", label: "Reason for escalation", kind: "textarea", required: true }];
      default:
        return [{ key: "note", label: "Note", kind: "textarea" }];
    }
  };

  async function submit(kind: ActionKind, v: Record<string, string>) {
    const body: any = { action: kind };
    if (v.note) body.note = v.note;
    if (v.assign_to_user_id) body.assign_to_user_id = v.assign_to_user_id;
    await api(`/grievances/${id}/action`, { method: "POST", body });
    toast.push(`${titles[kind]} completed.`, "success");
    reload();
  }

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader
        eyebrow="GRIEVANCE"
        title={g.grievance_number}
        description={`${titleCase(g.category)} · raised ${ageOf(g.created_at)} ago${g.due_at ? ` · due ${fmtDate(g.due_at)}` : ""}`}
        action={
          <div className="row gap-8">
            {g.priority && <Tag tone={priorityTone(g.priority)}>{titleCase(g.priority)} priority</Tag>}
            {g.overdue && <Tag tone="danger">Overdue</Tag>}
            <StatusTag status={g.status} />
          </div>
        }
      />

      {!closed && (
        <Card eyebrow="ACTIONS" title="Handle this grievance" subnote="Every action is recorded and notifies the citizen where applicable.">
          <div className="row gap-8 wrap">
            <Button variant="outline" icon={<Icon name="user-plus" size={15} />} onClick={() => setAction("ASSIGN")}>
              Assign
            </Button>
            <Button variant="outline" icon={<Icon name="clock" size={15} />} onClick={() => setAction("IN_PROGRESS")}>
              In progress
            </Button>
            <Button variant="outline" icon={<Icon name="alert" size={15} />} onClick={() => setAction("ESCALATE")}>
              Escalate
            </Button>
            <Button icon={<Icon name="check" size={15} />} onClick={() => setAction("RESOLVE")}>
              Resolve
            </Button>
            <Button variant="ghost" onClick={() => setAction("CLOSE")}>
              Close
            </Button>
          </div>
        </Card>
      )}
      {g.resolution && <Notice tone="info">Resolution: {g.resolution}</Notice>}

      <Card eyebrow="DESCRIPTION" title="What the citizen reported" subnote={`Submitted ${fmtDateTime(g.created_at)}.`}>
        <p className="body-13">{g.description || "No description was provided."}</p>
      </Card>

      <Card eyebrow="LINKED RECORDS" title="Related scheme, application and benefit">
        <KeyValue
          columns={3}
          items={[
            { label: "Scheme", value: scheme?.scheme_name ?? "—" },
            { label: "Application", value: application ? <span className="mono">{application.application_number}</span> : "—" },
            { label: "Benefit", value: benefit ? <StatusTag status={benefit.delivery_status} /> : "—" },
            { label: "Benefit amount", value: benefit?.benefit_amount ? fmtMoney(Number(benefit.benefit_amount)) : "—" },
          ]}
        />
      </Card>

      {family && <FamilySummaryCard family={family} title="Family" />}

      <Card eyebrow="HISTORY" title="Grievance history">
        {history.length === 0 ? (
          <p className="caption">No history has been recorded.</p>
        ) : (
          <Timeline
            items={history.map((h: any) => ({
              title: titleCase(h.action ?? h.status ?? "Update"),
              at: h.at ?? h.timestamp,
              note: h.note ?? undefined,
            }))}
          />
        )}
      </Card>

      <ActionModal
        open={!!action}
        title={action ? titles[action] : ""}
        fields={action ? fieldsFor(action) : []}
        confirmLabel={action ? titles[action].split(" ")[0] : "Confirm"}
        onClose={() => setAction(null)}
        onConfirm={(v) => (action ? submit(action, v) : Promise.resolve())}
      />
    </div>
  );
}
