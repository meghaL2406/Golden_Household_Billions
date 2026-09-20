import { useState } from "react";
import { Input, Notice, PageHeader, Select, Skeleton, Table, Tag } from "../../components";
import { useApi } from "../../lib/hooks";
import { fmtDateTime, titleCase } from "../../lib/format";
import { FilterBar, JsonBlock, Options, Pager, shortId, type Paginated } from "./_shared";

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "ASSIGN", "VERIFY"];
const ENTITY_TYPES = ["FAMILY", "MEMBER", "DOCUMENT", "APPLICATION", "BENEFIT", "GRIEVANCE", "SCHEME", "USER", "VERIFICATION_CASE"];

export default function Audit() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [actor, setActor] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const size = 30;

  const { data, loading, error } = useApi<Paginated<any>>(
    "/audit",
    { action, entity_type: entityType, actor, family_id: familyId, page, size },
    [action, entityType, actor, familyId, page],
  );

  const rows = data?.items ?? [];
  const keyOf = (a: any) => a.audit_id ?? a.log_id;
  const selected = rows.find((r) => keyOf(r) === open);

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader eyebrow="AUDIT" title="Audit log" description="Every recorded change across the platform, with actor, action and before/after values." />

      <FilterBar>
        <Select label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <Options values={ACTIONS} allLabel="All actions" />
        </Select>
        <Select label="Entity type" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
          <Options values={ENTITY_TYPES} allLabel="All entities" />
        </Select>
        <Input label="Actor" placeholder="User ID or name" value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} />
        <Input label="Family ID" placeholder="family_id" value={familyId} onChange={(e) => { setFamilyId(e.target.value); setPage(1); }} />
      </FilterBar>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={10} />
      ) : (
        <>
          <Table
            columns={[
              { key: "at", header: "Timestamp", render: (a: any) => <span className="tabular">{fmtDateTime(a.timestamp)}</span> },
              {
                key: "actor",
                header: "Actor",
                render: (a: any) => (
                  <span className="row gap-6">
                    {a.actor_label ?? "System"}
                    {a.actor_role && <Tag tone="neutral">{titleCase(a.actor_role)}</Tag>}
                  </span>
                ),
              },
              { key: "action", header: "Action", render: (a: any) => <span className="mono">{a.action}</span> },
              { key: "entity", header: "Entity", render: (a: any) => titleCase(a.entity_type) },
              { key: "ref", header: "Reference", render: (a: any) => <span className="mono">{shortId(a.reference_id)}</span> },
              {
                key: "diff",
                header: "Diff",
                render: (a: any) => (
                  <button
                    type="button"
                    className="fid-btn fid-btn--ghost fid-btn--sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(open === keyOf(a) ? null : keyOf(a));
                    }}
                  >
                    <span className="fid-btn__label">{open === keyOf(a) ? "Hide" : "View"}</span>
                  </button>
                ),
              },
            ]}
            rows={rows}
            rowKey={(a: any) => keyOf(a)}
            empty="No audit entries match the current filters."
          />
          <Pager page={page} size={size} total={data?.total ?? 0} onPage={setPage} unit="entries" />
        </>
      )}

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
  );
}
