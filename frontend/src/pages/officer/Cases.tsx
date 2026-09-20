import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Notice, PageHeader, Select, Skeleton, Table, Tabs, Tag } from "../../components";
import { useApi } from "../../lib/hooks";
import { titleCase } from "../../lib/format";
import { ageOf, FilterBar, Options, Pager, priorityTone, useEnums, type Paginated } from "./_shared";

const STATUS_TABS = [
  { key: "OPEN", label: "Open" },
  { key: "ASSIGNED", label: "Assigned" },
  { key: "INFO_REQUESTED", label: "Info requested" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

const PRIORITIES = ["HIGH", "NORMAL", "LOW"];

export default function Cases() {
  const nav = useNavigate();
  const enums = useEnums();
  const [status, setStatus] = useState("OPEN");
  const [caseType, setCaseType] = useState("");
  const [priority, setPriority] = useState("");
  const [district, setDistrict] = useState("");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const size = 25;

  const summary = useApi<any>("/verification/summary");
  const { data, loading, error } = useApi<Paginated<any>>(
    "/verification/cases",
    { status, case_type: caseType, priority, district, assigned: mine ? "me" : undefined, page, size },
    [status, caseType, priority, district, mine, page],
  );

  const counts: Record<string, number | undefined> = {
    OPEN: summary.data?.open,
    ASSIGNED: summary.data?.assigned,
    INFO_REQUESTED: summary.data?.info_requested,
    APPROVED: summary.data?.approved_today,
  };

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader
        eyebrow="VERIFICATION"
        title="Verification cases"
        description="Duplicate checks, mismatches and life events that need an officer decision."
      />

      <Tabs
        tabs={STATUS_TABS.map((t) => ({ ...t, count: counts[t.key] }))}
        active={status}
        onChange={(k) => {
          setStatus(k);
          setPage(1);
        }}
      />

      <FilterBar
        right={
          <Button variant={mine ? "primary" : "outline"} size="sm" onClick={() => { setMine(!mine); setPage(1); }}>
            Assigned to me
          </Button>
        }
      >
        <Select label="Case type" value={caseType} onChange={(e) => { setCaseType(e.target.value); setPage(1); }}>
          <Options values={enums.case_types} allLabel="All types" />
        </Select>
        <Select label="Priority" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
          <Options values={PRIORITIES} allLabel="All priorities" />
        </Select>
        <Select label="District" value={district} onChange={(e) => { setDistrict(e.target.value); setPage(1); }}>
          <Options values={enums.districts} allLabel="All districts" raw />
        </Select>
      </FilterBar>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={8} />
      ) : (
        <>
          <Table
            columns={[
              { key: "no", header: "Case", render: (c: any) => <span className="mono">{c.case_number}</span> },
              { key: "type", header: "Type", render: (c: any) => <Tag tone="blue">{titleCase(c.case_type)}</Tag> },
              { key: "family", header: "Family", render: (c: any) => (
                <span className="col">
                  <span>{c.head_name ?? "—"}</span>
                  <span className="caption mono">{c.family_code ?? "Provisional"}</span>
                </span>
              ) },
              { key: "member", header: "Member", render: (c: any) => c.member_name ?? "—" },
              { key: "district", header: "District", render: (c: any) => c.district ?? "—" },
              { key: "priority", header: "Priority", render: (c: any) => <Tag tone={priorityTone(c.priority)}>{titleCase(c.priority)}</Tag> },
              { key: "age", header: "Age", align: "right", render: (c: any) => <span className="tabular">{ageOf(c.created_at)}</span> },
              { key: "officer", header: "Assigned officer", render: (c: any) => c.assigned_officer_name ?? <span className="muted">Unassigned</span> },
            ]}
            rows={data?.items ?? []}
            rowKey={(c: any) => c.case_id}
            onRowClick={(c: any) => nav(`/officer/cases/${c.case_id}`)}
            empty="No cases match the current filters."
          />
          <Pager page={page} size={size} total={data?.total ?? 0} onPage={setPage} unit="cases" />
        </>
      )}
    </div>
  );
}
