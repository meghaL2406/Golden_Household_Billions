import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input, KeyValue, Modal, Notice, Select, StatusTag, Table, Tag, Textarea } from "../../components";
import { api, apiUrl } from "../../lib/api";
import { useApi, useToast } from "../../lib/hooks";
import { fmtDate, fmtDateTime, titleCase } from "../../lib/format";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Paginated<T> = { total: number; items: T[]; page: number; size: number };

export type Enums = {
  document_types: string[];
  relationship_types: string[];
  event_types: string[];
  grievance_categories: string[];
  districts: string[];
  scheme_categories: string[];
  departments: string[];
  case_types: string[];
};

export const EMPTY_ENUMS: Enums = {
  document_types: [],
  relationship_types: [],
  event_types: [],
  grievance_categories: [],
  districts: [],
  scheme_categories: [],
  departments: [],
  case_types: [],
};

export function useEnums(): Enums {
  const { data } = useApi<Enums>("/meta/enums");
  return data ?? EMPTY_ENUMS;
}

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

export function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as any).message === "string") {
    return (e as any).message;
  }
  return "The request could not be completed.";
}

export function shortId(id?: string | null, n = 8): string {
  if (!id) return "—";
  return String(id).slice(0, n);
}

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function fmtNum(v: unknown): string {
  return num(v).toLocaleString("en-IN");
}

/** Age of a record in plain words, e.g. "3 days" or "5 hours". */
export function ageOf(iso?: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "0 hours";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))} minutes`;
  if (hours < 48) return `${hours} hours`;
  return `${Math.floor(hours / 24)} days`;
}

export function optionList(values: string[] | undefined, allLabel = "All"): { value: string; label: string }[] {
  return [{ value: "", label: allLabel }, ...(values ?? []).map((v) => ({ value: v, label: titleCase(v) }))];
}

/** Uniform options rendering for the shared Select component. */
export function Options({ values, allLabel, raw }: { values: string[]; allLabel?: string; raw?: boolean }) {
  return (
    <>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {values.map((v) => (
        <option key={v} value={v}>
          {raw ? v : titleCase(v)}
        </option>
      ))}
    </>
  );
}

export function priorityTone(p?: string | null): "danger" | "warning" | "neutral" {
  if (p === "HIGH" || p === "URGENT") return "danger";
  if (p === "NORMAL") return "warning";
  return "neutral";
}

export function Unit({ children }: { children: ReactNode }) {
  return <span className="subnote" style={{ marginLeft: 4 }}>{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Filters bar                                                         */
/* ------------------------------------------------------------------ */

export function FilterBar({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="row between wrap gap-12" style={{ alignItems: "flex-end" }}>
      <div className="row wrap gap-12" style={{ alignItems: "flex-end" }}>{children}</div>
      {right && <div className="row gap-8">{right}</div>}
    </div>
  );
}

/** Small pagination footer for paginated lists. */
export function Pager({
  page,
  size,
  total,
  onPage,
  unit = "rows",
}: {
  page: number;
  size: number;
  total: number;
  onPage: (p: number) => void;
  unit?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="row between" style={{ paddingTop: 12 }}>
      <span className="caption tabular">
        {total} {unit} · page {page} of {pages}
      </span>
      <div className="row gap-8">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Charts (inline SVG, --blue and #9fb6ea only)                        */
/* ------------------------------------------------------------------ */

const AXIS_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fill: "var(--muted)",
};

export type BarDatum = { label: string; value: number; secondary?: number };

export function BarChart({
  data,
  height = 220,
  unit,
  secondaryLabel,
  primaryLabel,
}: {
  data: BarDatum[];
  height?: number;
  unit?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  const width = 720;
  const pad = { l: 44, r: 12, t: 12, b: 48 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondary ?? 0)));
  const ticks = 4;
  const n = Math.max(1, data.length);
  const slot = innerW / n;
  const hasSecondary = data.some((d) => d.secondary !== undefined);
  const barW = hasSecondary ? slot * 0.3 : slot * 0.55;

  if (!data.length) {
    return <p className="caption">No data is available for this chart.</p>;
  }

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Bar chart">
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const y = pad.t + innerH - (innerH * i) / ticks;
          const v = Math.round((max * i) / ticks);
          return (
            <g key={i}>
              <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" style={AXIS_STYLE}>
                {v.toLocaleString("en-IN")}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x0 = pad.l + slot * i + slot / 2;
          const h1 = (innerH * d.value) / max;
          const h2 = (innerH * (d.secondary ?? 0)) / max;
          const label = d.label.length > 12 ? d.label.slice(0, 11) + "…" : d.label;
          return (
            <g key={i}>
              {hasSecondary ? (
                <>
                  <rect x={x0 - barW - 1} y={pad.t + innerH - h1} width={barW} height={h1} fill="var(--blue)" rx={2}>
                    <title>{`${d.label}: ${d.value}${unit ? " " + unit : ""}`}</title>
                  </rect>
                  <rect x={x0 + 1} y={pad.t + innerH - h2} width={barW} height={h2} fill="#9fb6ea" rx={2}>
                    <title>{`${d.label}: ${d.secondary ?? 0}${unit ? " " + unit : ""}`}</title>
                  </rect>
                </>
              ) : (
                <rect x={x0 - barW / 2} y={pad.t + innerH - h1} width={barW} height={h1} fill="var(--blue)" rx={2}>
                  <title>{`${d.label}: ${d.value}${unit ? " " + unit : ""}`}</title>
                </rect>
              )}
              <text
                x={x0}
                y={pad.t + innerH + 14}
                textAnchor="end"
                transform={`rotate(-30 ${x0} ${pad.t + innerH + 14})`}
                style={AXIS_STYLE}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      {(primaryLabel || secondaryLabel || unit) && (
        <div className="row gap-16 caption" style={{ marginTop: 4 }}>
          {primaryLabel && (
            <span className="row gap-6">
              <span style={{ width: 10, height: 10, background: "var(--blue)", borderRadius: 2, display: "inline-block" }} />
              {primaryLabel}
            </span>
          )}
          {secondaryLabel && (
            <span className="row gap-6">
              <span style={{ width: 10, height: 10, background: "#9fb6ea", borderRadius: 2, display: "inline-block" }} />
              {secondaryLabel}
            </span>
          )}
          {unit && <span>Values in {unit}</span>}
        </div>
      )}
    </div>
  );
}

export function LineChart({
  points,
  height = 220,
  unit,
}: {
  points: { label: string; value: number }[];
  height?: number;
  unit?: string;
}) {
  const width = 720;
  const pad = { l: 44, r: 12, t: 12, b: 34 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(1, ...points.map((p) => p.value));
  const ticks = 4;
  const n = Math.max(1, points.length - 1);
  const coords = points.map((p, i) => ({
    x: pad.l + (innerW * i) / n,
    y: pad.t + innerH - (innerH * p.value) / max,
    ...p,
  }));
  if (!points.length) return <p className="caption">No data is available for this chart.</p>;
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${path} L${coords[coords.length - 1].x.toFixed(1)},${pad.t + innerH} L${coords[0].x.toFixed(1)},${pad.t + innerH} Z`;
  const labelEvery = Math.ceil(points.length / 8);
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Line chart">
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const y = pad.t + innerH - (innerH * i) / ticks;
          const v = Math.round((max * i) / ticks);
          return (
            <g key={i}>
              <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" style={AXIS_STYLE}>
                {v}
              </text>
            </g>
          );
        })}
        <path d={area} fill="#9fb6ea" opacity={0.35} />
        <path d={path} fill="none" stroke="var(--blue)" strokeWidth={1.8} />
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={2.4} fill="var(--blue)">
              <title>{`${c.label}: ${c.value}${unit ? " " + unit : ""}`}</title>
            </circle>
            {i % labelEvery === 0 && (
              <text x={c.x} y={pad.t + innerH + 16} textAnchor="middle" style={AXIS_STYLE}>
                {c.label.slice(5)}
              </text>
            )}
          </g>
        ))}
      </svg>
      {unit && <p className="caption">Values in {unit}; axis labels show month-day.</p>}
    </div>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  return (
    <div className="row gap-8" style={{ minWidth: 140 }}>
      <div style={{ flex: 1, height: 6, background: "var(--line)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--blue)" }} />
      </div>
      <span className="mono tabular" style={{ fontSize: 11 }}>
        {pct}
        <Unit>%</Unit>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ActionModal                                                         */
/* ------------------------------------------------------------------ */

export type ActionField = {
  key: string;
  label: string;
  kind?: "text" | "textarea" | "select" | "number";
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  placeholder?: string;
};

export function ActionModal({
  open,
  title,
  description,
  fields = [],
  confirmLabel = "Confirm",
  danger,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  fields?: ActionField[];
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (values: Record<string, string>) => Promise<void> | void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = fields.filter((f) => f.required && !(values[f.key] ?? "").trim());

  async function submit() {
    if (missing.length) {
      setError(`Please complete: ${missing.map((m) => m.label).join(", ")}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(values);
      setValues({});
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={() => {
        setValues({});
        setError(null);
        onClose();
      }}
      footer={
        <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={submit} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="stack">
        {description && <p className="body-13 muted">{description}</p>}
        {fields.map((f) => {
          const common = {
            label: f.label + (f.required ? " (required)" : ""),
            hint: f.hint,
            value: values[f.key] ?? "",
            onChange: (e: any) => setValues((v) => ({ ...v, [f.key]: e.target.value })),
          };
          if (f.kind === "textarea") return <Textarea key={f.key} rows={4} placeholder={f.placeholder} {...common} />;
          if (f.kind === "select")
            return (
              <Select key={f.key} {...common}>
                <option value="">Select</option>
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            );
          return <Input key={f.key} type={f.kind === "number" ? "number" : "text"} placeholder={f.placeholder} {...common} />;
        })}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  );
}


/* ------------------------------------------------------------------ */
/* Documents gallery with verify / reject                              */
/* ------------------------------------------------------------------ */

export function DocumentGallery({ documents, onChanged }: { documents: any[]; onChanged?: () => void }) {
  const toast = useToast();
  const [target, setTarget] = useState<{ doc: any; status: "VERIFIED" | "REJECTED" } | null>(null);

  if (!documents?.length) return <p className="caption">No documents have been attached.</p>;

  return (
    <>
      <div className="grid-3">
        {documents.map((d) => {
          const url = d.file_url ? apiUrl(d.file_url) : null;
          const isImage = (d.mime_type ?? "").startsWith("image/");
          return (
            <Card key={d.document_id} padding={14}>
              <div className="stack" style={{ gap: 8 }}>
                {url && isImage ? (
                  <a href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt={titleCase(d.document_type)}
                      style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 11, border: "1px solid var(--line)" }}
                    />
                  </a>
                ) : (
                  <div
                    className="center row caption"
                    style={{ height: 120, borderRadius: 11, border: "1px solid var(--line)", background: "var(--paper)" }}
                  >
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        Open {d.mime_type === "application/pdf" ? "PDF" : "file"}
                      </a>
                    ) : (
                      "No preview"
                    )}
                  </div>
                )}
                <div className="row between">
                  <span className="body-12 emph">{titleCase(d.document_type)}</span>
                  <StatusTag status={d.verification_status} />
                </div>
                <span className="caption">
                  {d.document_reference ? <span className="mono">{d.document_reference}</span> : "No reference"} · {fmtDate(d.created_at)}
                </span>
                {d.remarks && <span className="caption">Remarks: {d.remarks}</span>}
                {d.verification_status === "PENDING" && (
                  <div className="row gap-8">
                    <Button size="sm" onClick={() => setTarget({ doc: d, status: "VERIFIED" })}>
                      Verify
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setTarget({ doc: d, status: "REJECTED" })}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <ActionModal
        open={!!target}
        title={target?.status === "VERIFIED" ? "Verify document" : "Reject document"}
        description={target ? `${titleCase(target.doc.document_type)} will be marked ${titleCase(target.status).toLowerCase()}.` : undefined}
        fields={[{ key: "remarks", label: "Remarks", kind: "textarea", required: target?.status === "REJECTED" }]}
        confirmLabel={target?.status === "VERIFIED" ? "Verify" : "Reject"}
        danger={target?.status === "REJECTED"}
        onClose={() => setTarget(null)}
        onConfirm={async (v) => {
          if (!target) return;
          await api(`/documents/${target.doc.document_id}/verify`, {
            method: "POST",
            body: { status: target.status, remarks: v.remarks || undefined },
          });
          toast.push(`Document marked ${titleCase(target.status).toLowerCase()}.`, "success");
          onChanged?.();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Family summary card                                                 */
/* ------------------------------------------------------------------ */

export function FamilySummaryCard({
  family,
  title = "Family",
  eyebrow = "FAMILY",
  highlightMemberId,
  link = true,
}: {
  family: any;
  title?: string;
  eyebrow?: string;
  highlightMemberId?: string | null;
  link?: boolean;
}) {
  const nav = useNavigate();
  if (!family) {
    return (
      <Card eyebrow={eyebrow} title={title}>
        <p className="caption">No family is linked.</p>
      </Card>
    );
  }
  const members: any[] = family.members ?? [];
  const head = members.find((m) => m.is_head);
  return (
    <Card
      eyebrow={eyebrow}
      title={title}
      action={
        link ? (
          <Button size="sm" variant="ghost" onClick={() => nav(`/officer/families/${family.family_id}`)}>
            Open profile
          </Button>
        ) : undefined
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <KeyValue
          columns={2}
          items={[
            {
              label: "Family ID",
              value: family.family_code ? <span className="mono">{family.family_code}</span> : <Tag tone="warning">Provisional</Tag>,
            },
            { label: "Status", value: <StatusTag status={family.family_status} /> },
            { label: "Head", value: head?.name ?? "—" },
            { label: "District", value: family.district ?? "—" },
            { label: "Village", value: family.village ?? "—" },
            {
              label: "Members",
              value: (
                <span className="tabular">
                  {family.active_member_count ?? members.length}
                  <Unit>members</Unit>
                </span>
              ),
            },
          ]}
        />
        <Table
          columns={[
            {
              key: "name",
              header: "Member",
              render: (m: any) => (
                <span className={m.member_id === highlightMemberId ? "emph" : undefined}>
                  {m.name}
                  {m.is_head ? " (head)" : ""}
                </span>
              ),
            },
            { key: "dob", header: "Born", render: (m: any) => (m.date_of_birth ? fmtDate(m.date_of_birth) : "—") },
            { key: "gender", header: "Gender", render: (m: any) => (m.gender ? titleCase(m.gender) : "—") },
            { key: "status", header: "Status", render: (m: any) => <StatusTag status={m.verification_status} /> },
          ]}
          rows={members}
          rowKey={(m: any) => m.member_id}
          empty="No members recorded."
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Misc presentational                                                 */
/* ------------------------------------------------------------------ */

export function JsonBlock({ value }: { value: unknown }) {
  const text = useMemo(() => {
    if (value === null || value === undefined) return "—";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <pre
      className="mono"
      style={{
        fontSize: 11,
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: 11,
        padding: 12,
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 320,
        overflow: "auto",
      }}
    >
      {text}
    </pre>
  );
}

export function DateTime({ iso }: { iso?: string | null }) {
  return <span className="tabular">{iso ? fmtDateTime(iso) : "—"}</span>;
}

/* ------------------------------------------------------------------ */
/* Officers (for assignment dropdowns)                                 */
/* ------------------------------------------------------------------ */

export function useOfficers(): any[] {
  const { data } = useApi<any[]>("/verification/officers");
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/* Checkbox group (multi-select for a list of string values)           */
/* ------------------------------------------------------------------ */

export function CheckboxGroup({
  values,
  selected,
  onChange,
  raw,
}: {
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  raw?: boolean;
}) {
  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  return (
    <div className="row wrap gap-8">
      {values.map((v) => {
        const active = selected.includes(v);
        return (
          <button
            type="button"
            key={v}
            onClick={() => toggle(v)}
            className={`fid-tag fid-tag--${active ? "blue" : "neutral"}`}
            style={{ cursor: "pointer", border: "none" }}
          >
            {raw ? v : titleCase(v)}
          </button>
        );
      })}
      {values.length === 0 && <span className="caption">No options are available.</span>}
    </div>
  );
}
