import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Notice, PageHeader, Select, Skeleton, StatusTag, Table } from "../../components";
import { useApi } from "../../lib/hooks";
import { fmtDate } from "../../lib/format";
import { FilterBar, Options, Pager, useEnums, type Paginated } from "./_shared";

const STATUSES = ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "APPROVED", "REJECTED", "WITHDRAWN"];

export default function Applications() {
  const nav = useNavigate();
  const enums = useEnums();
  const schemes = useApi<any[]>("/schemes");
  const [status, setStatus] = useState("");
  const [schemeId, setSchemeId] = useState("");
  const [district, setDistrict] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);
  const size = 25;

  const { data, loading, error } = useApi<Paginated<any>>(
    "/applications",
    { status, scheme_id: schemeId, district, department, page, size },
    [status, schemeId, district, department, page],
  );

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader eyebrow="APPLICATIONS" title="Applications" description="Scheme applications submitted by citizens, awaiting review or decision." />

      <FilterBar>
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <Options values={STATUSES} allLabel="All statuses" />
        </Select>
        <Select label="Scheme" value={schemeId} onChange={(e) => { setSchemeId(e.target.value); setPage(1); }} style={{ minWidth: 200 }}>
          <option value="">All schemes</option>
          {(schemes.data ?? []).map((s: any) => (
            <option key={s.scheme_id} value={s.scheme_id}>
              {s.scheme_name}
            </option>
          ))}
        </Select>
        <Select label="District" value={district} onChange={(e) => { setDistrict(e.target.value); setPage(1); }}>
          <Options values={enums.districts} allLabel="All districts" raw />
        </Select>
        <Select label="Department" value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }}>
          <Options values={enums.departments} allLabel="All departments" raw />
        </Select>
      </FilterBar>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={8} />
      ) : (
        <>
          <Table
            columns={[
              { key: "no", header: "Application", render: (a: any) => <span className="mono">{a.application_number}</span> },
              { key: "scheme", header: "Scheme", render: (a: any) => a.scheme_name ?? "—" },
              {
                key: "family",
                header: "Family",
                render: (a: any) => (
                  <span className="col">
                    <span>{a.head_name ?? a.member_name ?? "—"}</span>
                    <span className="caption mono">{a.family_code ?? "Provisional"}</span>
                  </span>
                ),
              },
              { key: "district", header: "District", render: (a: any) => a.district ?? "—" },
              { key: "status", header: "Status", render: (a: any) => <StatusTag status={a.application_status} /> },
              { key: "at", header: "Submitted", render: (a: any) => fmtDate(a.created_at) },
            ]}
            rows={data?.items ?? []}
            rowKey={(a: any) => a.application_id}
            onRowClick={(a: any) => nav(`/officer/applications/${a.application_id}`)}
            empty="No applications match the current filters."
          />
          <Pager page={page} size={size} total={data?.total ?? 0} onPage={setPage} unit="applications" />
        </>
      )}
    </div>
  );
}
