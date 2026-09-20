import { useState } from "react";
import {
  Button,
  Card,
  Drawer,
  Icon,
  Input,
  KeyValue,
  Modal,
  Notice,
  PageHeader,
  Select,
  Skeleton,
  StatusTag,
  Table,
  Tag,
  Textarea,
} from "../../components";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useApi, useToast } from "../../lib/hooks";
import { fmtMoney, titleCase } from "../../lib/format";
import { CheckboxGroup, errMsg, FilterBar, JsonBlock, Options, Pager, Unit, useEnums, type Paginated } from "./_shared";

type RuleField = { field: string; label: string; type: string; ops: string[] };
type Rule = { field: string; op: string; value: string };

const CAN_EDIT_ROLES = new Set(["DEPARTMENT_OFFICER", "ADMIN"]);

export default function Schemes() {
  const { user } = useAuth();
  const enums = useEnums();
  const toast = useToast();
  const canEdit = CAN_EDIT_ROLES.has(user?.role ?? "");

  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");

  const { data: schemes, loading, error, reload } = useApi<any[]>(
    "/schemes",
    { department, category, status },
    [department, category, status],
  );
  const ruleFields = useApi<RuleField[]>("/schemes/rule-fields");

  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [eligibleFor, setEligibleFor] = useState<any | null>(null);

  async function toggle(scheme: any) {
    try {
      await api(`/schemes/${scheme.scheme_id}/toggle`, { method: "POST" });
      toast.push(`${scheme.scheme_name} is now ${scheme.status === "ACTIVE" ? "inactive" : "active"}.`, "success");
      reload();
    } catch (e) {
      toast.push(errMsg(e), "danger");
    }
  }

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader
        eyebrow="SCHEMES"
        title="Schemes"
        description="Every welfare scheme, its eligibility rule and its benefit configuration."
        action={
          canEdit ? (
            <Button icon={<Icon name="plus" size={15} />} onClick={() => setCreating(true)}>
              New scheme
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        <Select label="Department" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <Options values={enums.departments} allLabel="All departments" raw />
        </Select>
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <Options values={enums.scheme_categories} allLabel="All categories" raw />
        </Select>
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <Options values={["ACTIVE", "INACTIVE"]} allLabel="All statuses" />
        </Select>
      </FilterBar>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !schemes ? (
        <Skeleton rows={8} />
      ) : (
        <Table
          columns={[
            { key: "code", header: "Scheme", render: (s: any) => <span className="mono">{s.scheme_code}</span> },
            { key: "name", header: "Name", render: (s: any) => <span className="emph">{s.scheme_name}</span> },
            { key: "dept", header: "Department", render: (s: any) => (s.department ? titleCase(s.department) : "—") },
            { key: "cat", header: "Category", render: (s: any) => (s.category ? <Tag tone="blue">{titleCase(s.category)}</Tag> : "—") },
            {
              key: "benefit",
              header: "Benefit",
              render: (s: any) =>
                s.benefit_amount ? (
                  <span className="tabular">
                    {fmtMoney(Number(s.benefit_amount))}
                    <Unit>{s.benefit_frequency ? titleCase(s.benefit_frequency).toLowerCase() : ""}</Unit>
                  </span>
                ) : (
                  titleCase(s.benefit_type) || "—"
                ),
            },
            { key: "status", header: "Status", render: (s: any) => <StatusTag status={s.status} /> },
            {
              key: "actions",
              header: "",
              align: "right",
              render: (s: any) => (
                <div className="row gap-8" style={{ justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => setEligibleFor(s)}>
                    Eligible families
                  </Button>
                  {canEdit && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                        Edit
                      </Button>
                      <Button size="sm" variant={s.status === "ACTIVE" ? "danger" : "primary"} onClick={() => toggle(s)}>
                        {s.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </Button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
          rows={schemes ?? []}
          rowKey={(s: any) => s.scheme_id}
          empty="No schemes match the current filters."
        />
      )}

      {(creating || editing) && (
        <SchemeFormModal
          scheme={editing}
          schemes={schemes ?? []}
          ruleFields={ruleFields.data ?? []}
          documentTypes={enums.document_types}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}

      {eligibleFor && <EligibleFamiliesDrawer scheme={eligibleFor} onClose={() => setEligibleFor(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create / edit modal with rule builder                               */
/* ------------------------------------------------------------------ */

function SchemeFormModal({
  scheme,
  schemes,
  ruleFields,
  documentTypes,
  onClose,
  onSaved,
}: {
  scheme: any | null;
  schemes: any[];
  ruleFields: RuleField[];
  documentTypes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<any>(() => ({
    scheme_code: scheme?.scheme_code ?? "",
    scheme_name: scheme?.scheme_name ?? "",
    department: scheme?.department ?? "",
    category: scheme?.category ?? "",
    benefit_type: scheme?.benefit_type ?? "",
    benefit_amount: scheme?.benefit_amount ?? "",
    benefit_frequency: scheme?.benefit_frequency ?? "",
    description: scheme?.description ?? "",
  }));
  const [rules, setRules] = useState<Rule[]>(() => {
    const existing = scheme?.eligibility_rules;
    if (Array.isArray(existing)) return existing.map((r: any) => ({ field: r.field ?? "", op: r.op ?? "", value: String(r.value ?? "") }));
    return [];
  });
  const [requiredDocs, setRequiredDocs] = useState<string[]>(scheme?.required_documents ?? []);
  const [exclusiveWith, setExclusiveWith] = useState<string[]>(scheme?.exclusive_with ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewFamilyId, setPreviewFamilyId] = useState("");
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  function updateRule(i: number, patch: Partial<Rule>) {
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function fieldMeta(field: string): RuleField | undefined {
    return ruleFields.find((f) => f.field === field);
  }

  async function save() {
    if (!form.scheme_name.trim()) {
      setError("Scheme name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: any = {
        ...form,
        benefit_amount: form.benefit_amount === "" ? undefined : Number(form.benefit_amount),
        eligibility_rules: rules.filter((r) => r.field && r.op),
        required_documents: requiredDocs,
        exclusive_with: exclusiveWith,
      };
      if (scheme) {
        await api(`/schemes/${scheme.scheme_id}`, { method: "PATCH", body });
        toast.push("Scheme updated.", "success");
      } else {
        await api("/schemes", { method: "POST", body });
        toast.push("Scheme created.", "success");
      }
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (!scheme || !previewFamilyId.trim()) {
      setPreviewError("Enter a family ID to preview against.");
      return;
    }
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const res = await api(`/schemes/${scheme.scheme_id}/preview`, { method: "POST", body: { family_id: previewFamilyId.trim() } });
      setPreviewResult(res);
    } catch (e) {
      setPreviewError(errMsg(e));
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <Modal
      open
      title={scheme ? `Edit ${scheme.scheme_name}` : "New scheme"}
      onClose={onClose}
      width={760}
      footer={
        <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {scheme ? "Save changes" : "Create scheme"}
          </Button>
        </div>
      }
    >
      <div className="stack" style={{ gap: 18 }}>
        <div className="grid-2">
          <Input label="Scheme code" value={form.scheme_code} onChange={(e) => setForm((f: any) => ({ ...f, scheme_code: e.target.value }))} hint="Left blank to auto-generate." />
          <Input label="Scheme name (required)" value={form.scheme_name} onChange={(e) => setForm((f: any) => ({ ...f, scheme_name: e.target.value }))} />
          <Input label="Department" value={form.department} onChange={(e) => setForm((f: any) => ({ ...f, department: e.target.value }))} />
          <Input label="Category" value={form.category} onChange={(e) => setForm((f: any) => ({ ...f, category: e.target.value }))} />
          <Input label="Benefit type" value={form.benefit_type} onChange={(e) => setForm((f: any) => ({ ...f, benefit_type: e.target.value }))} />
          <Input label="Benefit amount" type="number" value={form.benefit_amount} onChange={(e) => setForm((f: any) => ({ ...f, benefit_amount: e.target.value }))} />
          <Input label="Benefit frequency" value={form.benefit_frequency} onChange={(e) => setForm((f: any) => ({ ...f, benefit_frequency: e.target.value }))} />
        </div>
        <Textarea label="Description" rows={3} value={form.description} onChange={(e) => setForm((f: any) => ({ ...f, description: e.target.value }))} />

        <div>
          <p className="eyebrow">Eligibility rule builder</p>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            {rules.map((r, i) => {
              const meta = fieldMeta(r.field);
              return (
                <div key={i} className="row gap-8 wrap" style={{ alignItems: "flex-end" }}>
                  <Select label="Field" value={r.field} onChange={(e) => updateRule(i, { field: e.target.value, op: "" })} style={{ minWidth: 180 }}>
                    <option value="">Select field</option>
                    {ruleFields.map((f) => (
                      <option key={f.field} value={f.field}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                  <Select label="Operator" value={r.op} onChange={(e) => updateRule(i, { op: e.target.value })} style={{ minWidth: 140 }} disabled={!meta}>
                    <option value="">Select operator</option>
                    {(meta?.ops ?? []).map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </Select>
                  <Input label="Value" value={r.value} onChange={(e) => updateRule(i, { value: e.target.value })} style={{ minWidth: 160 }} />
                  <Button variant="ghost" size="sm" icon={<Icon name="trash" size={14} />} onClick={() => setRules((rs) => rs.filter((_, idx) => idx !== i))}>
                    Remove
                  </Button>
                </div>
              );
            })}
            <Button variant="outline" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => setRules((rs) => [...rs, { field: "", op: "", value: "" }])}>
              Add rule
            </Button>
            {rules.length === 0 && <p className="caption">No rules are set. Every family will be treated as eligible.</p>}
          </div>
        </div>

        <div>
          <p className="eyebrow">Required documents</p>
          <div style={{ marginTop: 8 }}>
            <CheckboxGroup values={documentTypes} selected={requiredDocs} onChange={setRequiredDocs} />
          </div>
        </div>

        <div>
          <p className="eyebrow">Exclusive with</p>
          <p className="caption" style={{ marginBottom: 8 }}>
            A family already eligible for a selected scheme is excluded from this one.
          </p>
          <CheckboxGroup
            values={schemes.filter((s) => s.scheme_id !== scheme?.scheme_id).map((s) => s.scheme_id)}
            selected={exclusiveWith}
            onChange={setExclusiveWith}
            raw
          />
        </div>

        {error && <Notice tone="danger">{error}</Notice>}

        {scheme && (
          <Card eyebrow="PREVIEW" title="Preview against a family" subnote="Runs this scheme's eligibility rule against one household without saving anything.">
            <div className="row gap-8 wrap" style={{ alignItems: "flex-end" }}>
              <Input label="Family ID" placeholder="Paste a family_id" value={previewFamilyId} onChange={(e) => setPreviewFamilyId(e.target.value)} style={{ minWidth: 260 }} />
              <Button variant="outline" size="sm" loading={previewBusy} onClick={runPreview}>
                Run preview
              </Button>
            </div>
            {previewError && <Notice tone="danger" className="mt-8">{previewError}</Notice>}
            {previewResult && (
              <div style={{ marginTop: 12 }}>
                <JsonBlock value={previewResult} />
              </div>
            )}
          </Card>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Eligible families drawer                                            */
/* ------------------------------------------------------------------ */

function EligibleFamiliesDrawer({ scheme, onClose }: { scheme: any; onClose: () => void }) {
  const enums = useEnums();
  const [status, setStatus] = useState("");
  const [district, setDistrict] = useState("");
  const [page, setPage] = useState(1);
  const size = 20;
  const { data, loading, error } = useApi<Paginated<any>>(
    `/schemes/${scheme.scheme_id}/eligible-families`,
    { status, district, page, size },
    [scheme.scheme_id, status, district, page],
  );

  return (
    <Drawer open title={`Eligible families · ${scheme.scheme_name}`} onClose={onClose} width={620}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="row gap-8 wrap">
          <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <Options values={["ELIGIBLE", "NEEDS_DOCUMENT", "NOT_ELIGIBLE"]} allLabel="All statuses" />
          </Select>
          <Select label="District" value={district} onChange={(e) => { setDistrict(e.target.value); setPage(1); }}>
            <Options values={enums.districts} allLabel="All districts" raw />
          </Select>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        {loading && !data ? (
          <Skeleton rows={6} />
        ) : (
          <>
            <Table
              columns={[
                { key: "code", header: "Family ID", render: (f: any) => (f.family_code ? <span className="mono">{f.family_code}</span> : <Tag tone="warning">Provisional</Tag>) },
                { key: "head", header: "Head", render: (f: any) => f.head_name ?? "—" },
                { key: "member", header: "Member", render: (f: any) => f.member_name ?? "—" },
                { key: "district", header: "District", render: (f: any) => f.district ?? "—" },
                { key: "status", header: "Eligibility", render: (f: any) => <StatusTag status={f.eligibility_status} /> },
              ]}
              rows={data?.items ?? []}
              rowKey={(f: any) => `${f.family_code ?? "prov"}-${f.member_name ?? ""}-${f.head_name ?? ""}`}
              empty="No families are eligible under the current filters."
            />
            <Pager page={page} size={size} total={data?.total ?? 0} onPage={setPage} unit="families" />
          </>
        )}
      </div>
    </Drawer>
  );
}
