import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Notice, PageHeader, Select, Skeleton, StatusTag, Table, Tag } from "../../components";
import { useApi } from "../../lib/hooks";
import { FilterBar, Options, Pager, Unit, useEnums, type Paginated } from "./_shared";

const FAMILY_STATUSES = ["DRAFT", "PENDING_VERIFICATION", "VERIFIED", "REJECTED", "MERGED", "INACTIVE"];

export default function Families() {
  const nav = useNavigate();
  const enums = useEnums();
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const size = 25;

  const { data, loading, error } = useApi<Paginated<any>>("/families", { q, district, status, page, size }, [q, district, status, page]);

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader
        eyebrow="FAMILIES"
        title="Families"
        description="Every household registered in the state, with verification status and open cases."
      />

      <FilterBar>
        <Input
          label="Search"
          placeholder="Family ID, head name or mobile"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          style={{ minWidth: 260 }}
        />
        <Select
          label="District"
          value={district}
          onChange={(e) => {
            setDistrict(e.target.value);
            setPage(1);
          }}
        >
          <Options values={enums.districts} allLabel="All districts" raw />
        </Select>
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <Options values={FAMILY_STATUSES} allLabel="All statuses" />
        </Select>
      </FilterBar>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={8} />
      ) : (
        <>
          <Table
            columns={[
              {
                key: "code",
                header: "Family ID",
                render: (f: any) => (f.family_code ? <span className="mono">{f.family_code}</span> : <Tag tone="warning">Provisional</Tag>),
              },
              { key: "head", header: "Head", render: (f: any) => f.head_name ?? "—" },
              { key: "district", header: "District", render: (f: any) => f.district ?? "—" },
              {
                key: "members",
                header: "Members",
                align: "right",
                render: (f: any) => (
                  <span className="tabular">
                    {f.member_count ?? 0}
                    <Unit>members</Unit>
                  </span>
                ),
              },
              { key: "status", header: "Status", render: (f: any) => <StatusTag status={f.family_status} /> },
              {
                key: "cases",
                header: "Open cases",
                align: "right",
                render: (f: any) => (
                  <span className="tabular">
                    {f.open_cases ?? 0}
                    <Unit>cases</Unit>
                  </span>
                ),
              },
            ]}
            rows={data?.items ?? []}
            rowKey={(f: any) => f.family_id}
            onRowClick={(f: any) => nav(`/officer/families/${f.family_id}`)}
            empty="No families match the current filters."
          />
          <Pager page={page} size={size} total={data?.total ?? 0} onPage={setPage} unit="families" />
        </>
      )}
    </div>
  );
}
