import { useNavigate } from "react-router-dom";
import { Card, Icon, Notice, PageHeader, Skeleton, StatRow, StatTile, StatusTag, Table, Tag, Timeline } from "../../components";
import { useAuth } from "../../lib/auth";
import { useApi } from "../../lib/hooks";
import { fmtDateTime, titleCase } from "../../lib/format";
import { ageOf, BarChart, fmtNum, priorityTone, type Paginated } from "./_shared";

type Summary = {
  total_families: number;
  verified_families: number;
  pending_verification: number;
  duplicate_cases: number;
  active_members: number;
  applications: number;
  approved_benefits: number;
  pending_cases: number;
  open_grievances: number;
  benefits_delivered: number;
  benefits_disputed: number;
  provisional_members: number;
};

export default function Dashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const summary = useApi<Summary>("/dashboard/summary");
  const mine = useApi<Paginated<any>>("/verification/cases", { assigned: "me", status: "ASSIGNED", size: 8 });
  const highOpen = useApi<Paginated<any>>("/verification/cases", { status: "OPEN", priority: "HIGH", size: 8 });
  const districts = useApi<any[]>("/dashboard/reports/district");
  const activity = useApi<any[]>("/dashboard/activity", { limit: 12 });

  const s = summary.data;
  const top10 = [...(districts.data ?? [])].sort((a, b) => b.families - a.families).slice(0, 10);

  const caseColumns = [
    { key: "no", header: "Case", render: (c: any) => <span className="mono">{c.case_number}</span> },
    { key: "type", header: "Type", render: (c: any) => <Tag tone="blue">{titleCase(c.case_type)}</Tag> },
    { key: "family", header: "Family", render: (c: any) => c.head_name ?? c.family_code ?? "—" },
    { key: "priority", header: "Priority", render: (c: any) => <Tag tone={priorityTone(c.priority)}>{titleCase(c.priority)}</Tag> },
    { key: "age", header: "Age", render: (c: any) => <span className="tabular">{ageOf(c.created_at)}</span> },
  ];

  const links = [
    { to: "/officer/map", label: "Family map", note: "District circles and anonymised points.", icon: "map" as const },
    { to: "/officer/grievances", label: "Grievances", note: "Open, escalated and overdue tickets.", icon: "message" as const },
    { to: "/officer/audit", label: "Audit log", note: "Every change with actor and diff.", icon: "shield" as const },
    ...(user?.role === "ADMIN"
      ? [{ to: "/officer/users", label: "Users", note: "Officer accounts and roles.", icon: "users" as const }]
      : []),
  ];

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader
        eyebrow="OFFICER CONSOLE · GUJARAT"
        title={`Good day, ${user?.name ?? "officer"}`}
        description="A summary of families, verification work and benefit delivery across the state."
      />

      {summary.error && <Notice tone="danger">{summary.error}</Notice>}
      {summary.loading && !s ? (
        <Skeleton rows={3} />
      ) : (
        s && (
          <>
            <StatRow>
              <StatTile label="Total families" value={fmtNum(s.total_families)} unit="families" icon={<Icon name="home" size={14} />} />
              <StatTile label="Verified" value={fmtNum(s.verified_families)} unit="families" icon={<Icon name="check" size={14} />} />
              <StatTile label="Pending verification" value={fmtNum(s.pending_verification)} unit="families" icon={<Icon name="clock" size={14} />} />
              <StatTile label="Duplicate cases" value={fmtNum(s.duplicate_cases)} unit="cases" icon={<Icon name="split" size={14} />} />
            </StatRow>
            <StatRow>
              <StatTile label="Active members" value={fmtNum(s.active_members)} unit="members" note={`${fmtNum(s.provisional_members)} provisional`} icon={<Icon name="users" size={14} />} />
              <StatTile label="Applications" value={fmtNum(s.applications)} unit="applications" icon={<Icon name="file" size={14} />} />
              <StatTile label="Approved benefits" value={fmtNum(s.approved_benefits)} unit="benefits" icon={<Icon name="gift" size={14} />} />
              <StatTile label="Open grievances" value={fmtNum(s.open_grievances)} unit="tickets" icon={<Icon name="alert" size={14} />} />
            </StatRow>
          </>
        )
      )}

      <div className="grid-2" style={{ gridTemplateColumns: "2fr 1fr", alignItems: "start" }}>
        <Card
          eyebrow="WORK QUEUE"
          title="Cases needing attention"
          subnote="Cases assigned to you, followed by unassigned high-priority cases."
          action={<Tag tone="neutral">{(mine.data?.total ?? 0) + (highOpen.data?.total ?? 0)} cases</Tag>}
        >
          {mine.loading && highOpen.loading ? (
            <Skeleton rows={4} />
          ) : (
            <div className="stack" style={{ gap: 16 }}>
              <div>
                <p className="caption" style={{ marginBottom: 6 }}>
                  Assigned to me · {mine.data?.total ?? 0} cases
                </p>
                <Table
                  columns={caseColumns}
                  rows={mine.data?.items ?? []}
                  rowKey={(c: any) => c.case_id}
                  onRowClick={(c: any) => nav(`/officer/cases/${c.case_id}`)}
                  empty="No cases are assigned to you."
                />
              </div>
              <div>
                <p className="caption" style={{ marginBottom: 6 }}>
                  Unassigned high priority · {highOpen.data?.total ?? 0} cases
                </p>
                <Table
                  columns={caseColumns}
                  rows={highOpen.data?.items ?? []}
                  rowKey={(c: any) => c.case_id}
                  onRowClick={(c: any) => nav(`/officer/cases/${c.case_id}`)}
                  empty="No unassigned high-priority cases."
                />
              </div>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card eyebrow="BENEFIT DELIVERY" title="Delivered against disputed" subnote="Benefit records by delivery outcome.">
            {s ? (
              <div className="stack" style={{ gap: 12 }}>
                <DeliveryBar delivered={s.benefits_delivered} disputed={s.benefits_disputed} />
                <div className="row between body-12">
                  <span>
                    <span className="tabular emph">{fmtNum(s.benefits_delivered)}</span> <span className="subnote">delivered</span>
                  </span>
                  <span>
                    <span className="tabular emph">{fmtNum(s.benefits_disputed)}</span> <span className="subnote">disputed</span>
                  </span>
                </div>
                <p className="caption">
                  {fmtNum(s.pending_cases)} verification cases are still open across the state.
                </p>
              </div>
            ) : (
              <Skeleton rows={2} />
            )}
          </Card>
          {links.map((l) => (
            <Card key={l.to} onClick={() => nav(l.to)} padding={16}>
              <div className="row between">
                <div className="row gap-12">
                  <span style={{ color: "var(--blue)" }}>
                    <Icon name={l.icon} size={18} />
                  </span>
                  <div className="col">
                    <span className="body-13 emph">{l.label}</span>
                    <span className="caption">{l.note}</span>
                  </div>
                </div>
                <Icon name="arrow-right" size={14} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card eyebrow="DISTRICTS" title="Families by district" subnote="Top 10 districts by registered families. Source: /dashboard/reports/district.">
        {districts.loading ? (
          <Skeleton rows={4} />
        ) : (
          <BarChart
            data={top10.map((d) => ({ label: d.district ?? "Unknown", value: d.families, secondary: d.verified }))}
            unit="families"
            primaryLabel="Registered"
            secondaryLabel="Verified"
          />
        )}
      </Card>

      <Card eyebrow="RECENT ACTIVITY" title="Latest changes" subnote="Most recent audit entries.">
        {activity.loading ? (
          <Skeleton rows={5} />
        ) : (
          <Timeline
            items={(activity.data ?? []).map((a) => ({
              title: `${titleCase(a.action)} · ${titleCase(a.entity_type)}`,
              at: fmtDateTime(a.timestamp),
              note: `${a.actor_label ?? "System"}${a.actor_role ? ` (${titleCase(a.actor_role)})` : ""}`,
            }))}
          />
        )}
      </Card>

      <p className="caption row gap-8">
        Statuses use the shared scale <StatusTag status="VERIFIED" /> <StatusTag status="PENDING_VERIFICATION" /> <StatusTag status="REJECTED" />
      </p>
    </div>
  );
}

function DeliveryBar({ delivered, disputed }: { delivered: number; disputed: number }) {
  const total = Math.max(1, delivered + disputed);
  const pct = Math.round((delivered / total) * 100);
  return (
    <div>
      <div style={{ height: 10, borderRadius: 999, background: "#9fb6ea", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--blue)" }} />
      </div>
      <p className="caption" style={{ marginTop: 6 }}>
        {pct} % of concluded deliveries were delivered without dispute.
      </p>
    </div>
  );
}
