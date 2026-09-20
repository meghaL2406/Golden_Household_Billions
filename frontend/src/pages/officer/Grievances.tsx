import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Notice, PageHeader, Select, Skeleton, StatusTag, Table, Tabs, Tag } from "../../components";
import { useApi } from "../../lib/hooks";
import { titleCase } from "../../lib/format";
import { ageOf, FilterBar, Options, Pager, useEnums, type Paginated } from "./_shared";

const TABS = [
  { key: "OPEN", label: "Open" },
  { key: "ASSIGNED", label: "Assigned" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "ESCALATED", label: "Escalated" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "CLOSED", label: "Closed" },
];

export default function Grievances() {
  const nav = useNavigate();
  const enums = useEnums();
  const [status, setStatus] = useState("OPEN");
  const [category, setCategory] = useState("");
  const [district, setDistrict] = useState("");
  const [page, setPage] = useState(1);
  const size = 25;

  const { data, loading, error } = useApi<Paginated<any>>(
    "/grievances",
    { status, category, district, page, size },
    [status, category, district, page],
  );

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader eyebrow="GRIEVANCES" title="Grievances" description="Citizen complaints about benefit delivery, applications and verification." />

      <Tabs tabs={TABS} active={status} onChange={(k) => { setStatus(k); setPage(1); }} />

      <FilterBar>
        <Select label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} style={{ minWidth: 200 }}>
          <Options values={enums.grievance_categories} allLabel="All categories" />
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
              { key: "no", header: "Grievance", render: (g: any) => <span className="mono">{g.grievance_number}</span> },
              { key: "category", header: "Category", render: (g: any) => <Tag tone="blue">{titleCase(g.category)}</Tag> },
              {
                key: "family",
                header: "Family",
                render: (g: any) => (
                  <span className="col">
                    <span>{g.head_name ?? "—"}</span>
                    <span className="caption mono">{g.family_code ?? "Provisional"}</span>
                  </span>
                ),
              },
              { key: "scheme", header: "Scheme", render: (g: any) => g.scheme_name ?? "—" },
              { key: "status", header: "Status", render: (g: any) => <StatusTag status={g.status} /> },
              {
                key: "due",
                header: "Age / due",
                render: (g: any) => (
                  <span className="row gap-6">
                    <span className="tabular">{ageOf(g.created_at)}</span>
                    {g.overdue && <Tag tone="danger">Overdue</Tag>}
                  </span>
                ),
              },
              { key: "officer", header: "Assigned officer", render: (g: any) => g.assigned_officer_name ?? <span className="muted">Unassigned</span> },
            ]}
            rows={data?.items ?? []}
            rowKey={(g: any) => g.grievance_id}
            onRowClick={(g: any) => nav(`/officer/grievances/${g.grievance_id}`)}
            empty="No grievances match the current filters."
          />
          <Pager page={page} size={size} total={data?.total ?? 0} onPage={setPage} unit="grievances" />
        </>
      )}
      <p className="caption">
        Statuses shown as tabs are read from grievance status; due dates are set to submission plus <span className="tabular">7</span> days.
      </p>
    </div>
  );
}
