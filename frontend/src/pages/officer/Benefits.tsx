import { useState } from "react";
import { Drawer, Notice, PageHeader, Select, Skeleton, StatusTag, Stepper, Table, Timeline } from "../../components";
import { api } from "../../lib/api";
import { useApi, useToast } from "../../lib/hooks";
import { fmtDate, fmtMoney, titleCase } from "../../lib/format";
import { ActionModal, FilterBar, Options, Pager, useEnums, type ActionField, type Paginated } from "./_shared";

const DELIVERY_STATUSES = ["SANCTIONED", "DISBURSED", "DELIVERED", "RECEIVED_CONFIRMED", "NOT_RECEIVED", "DISPUTED"];
const STEP_ORDER = ["SANCTIONED", "DISBURSED", "DELIVERED", "RECEIVED_CONFIRMED"];

export default function Benefits() {
  const enums = useEnums();
  const schemes = useApi<any[]>("/schemes");
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [schemeId, setSchemeId] = useState("");
  const [district, setDistrict] = useState("");
  const [page, setPage] = useState(1);
  const size = 25;

  const { data, loading, error, reload } = useApi<Paginated<any>>(
    "/benefits",
    { delivery_status: deliveryStatus, scheme_id: schemeId, district, page, size },
    [deliveryStatus, schemeId, district, page],
  );

  const [selected, setSelected] = useState<any | null>(null);

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader eyebrow="BENEFITS" title="Benefits" description="Sanctioned benefits and their delivery status through to citizen confirmation." />

      <FilterBar>
        <Select label="Delivery status" value={deliveryStatus} onChange={(e) => { setDeliveryStatus(e.target.value); setPage(1); }}>
          <Options values={DELIVERY_STATUSES} allLabel="All delivery statuses" />
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
      </FilterBar>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={8} />
      ) : (
        <>
          <Table
            columns={[
              { key: "scheme", header: "Scheme", render: (b: any) => b.scheme_name ?? "—" },
              {
                key: "family",
                header: "Family",
                render: (b: any) => (
                  <span className="col">
                    <span>{b.head_name ?? b.member_name ?? "—"}</span>
                    <span className="caption mono">{b.family_code ?? "Provisional"}</span>
                  </span>
                ),
              },
              { key: "amount", header: "Amount", align: "right", render: (b: any) => (b.benefit_amount ? fmtMoney(Number(b.benefit_amount)) : "—") },
              { key: "status", header: "Delivery status", render: (b: any) => <StatusTag status={b.delivery_status} /> },
              { key: "at", header: "Updated", render: (b: any) => fmtDate(b.updated_at ?? b.created_at) },
            ]}
            rows={data?.items ?? []}
            rowKey={(b: any) => b.benefit_id}
            onRowClick={(b: any) => setSelected(b)}
            empty="No benefits match the current filters."
          />
          <Pager page={page} size={size} total={data?.total ?? 0} onPage={setPage} unit="benefits" />
        </>
      )}

      {selected && (
        <BenefitDrawer
          benefit={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            reload();
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function BenefitDrawer({ benefit, onClose, onChanged }: { benefit: any; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [action, setAction] = useState<"DISBURSED" | "DELIVERED" | null>(null);
  const log: any[] = benefit.delivery_log ?? [];

  const steps = STEP_ORDER.map((s) => {
    const idx = STEP_ORDER.indexOf(benefit.delivery_status);
    const thisIdx = STEP_ORDER.indexOf(s);
    return { label: titleCase(s), done: idx >= 0 && thisIdx <= idx && benefit.delivery_status !== "DISPUTED" && benefit.delivery_status !== "NOT_RECEIVED", active: s === benefit.delivery_status };
  });

  const fields: ActionField[] = [{ key: "note", label: "Note", kind: "textarea" }, { key: "reference", label: "Reference", kind: "text", hint: "Transaction or delivery reference, optional." }];

  async function submit(status: "DISBURSED" | "DELIVERED", v: Record<string, string>) {
    await api(`/benefits/${benefit.benefit_id}/delivery`, {
      method: "POST",
      body: { status, note: v.note || undefined, reference: v.reference || undefined },
    });
    toast.push(`Benefit marked ${titleCase(status).toLowerCase()}.`, "success");
    onChanged();
  }

  return (
    <Drawer open title={`Benefit · ${benefit.scheme_name ?? "Scheme"}`} onClose={onClose} width={560}>
      <div className="stack" style={{ gap: 18 }}>
        <div className="row between">
          <div className="col">
            <span className="body-13 emph">{benefit.head_name ?? benefit.member_name ?? "—"}</span>
            <span className="caption mono">{benefit.family_code ?? "Provisional"}</span>
          </div>
          <StatusTag status={benefit.delivery_status} />
        </div>

        <div>
          <p className="eyebrow">Delivery progress</p>
          <div style={{ marginTop: 8 }}>
            <Stepper steps={steps} />
          </div>
        </div>

        {(benefit.delivery_status === "DISPUTED" || benefit.delivery_status === "NOT_RECEIVED") && (
          <Notice tone="danger">
            This delivery has been disputed by the citizen. A grievance was raised automatically; review it from the Grievances page.
          </Notice>
        )}

        {benefit.delivery_status !== "DELIVERED" && benefit.delivery_status !== "RECEIVED_CONFIRMED" && (
          <div className="row gap-8">
            {benefit.delivery_status === "SANCTIONED" && (
              <button className="fid-btn fid-btn--primary" type="button" onClick={() => setAction("DISBURSED")}>
                <span className="fid-btn__label">Set disbursed</span>
              </button>
            )}
            {(benefit.delivery_status === "SANCTIONED" || benefit.delivery_status === "DISBURSED") && (
              <button className="fid-btn fid-btn--outline" type="button" onClick={() => setAction("DELIVERED")}>
                <span className="fid-btn__label">Set delivered</span>
              </button>
            )}
          </div>
        )}

        <div>
          <p className="eyebrow">Delivery log</p>
          <div style={{ marginTop: 8 }}>
            {log.length === 0 ? (
              <p className="caption">No delivery updates have been logged.</p>
            ) : (
              <Timeline
                items={log.map((l: any) => ({
                  title: titleCase(l.status ?? "Update"),
                  at: l.at ?? l.timestamp,
                  note: [l.note, l.reference ? `Reference: ${l.reference}` : null].filter(Boolean).join(" · ") || undefined,
                }))}
              />
            )}
          </div>
        </div>
      </div>

      <ActionModal
        open={!!action}
        title={action === "DISBURSED" ? "Mark benefit disbursed" : "Mark benefit delivered"}
        fields={fields}
        confirmLabel="Confirm"
        onClose={() => setAction(null)}
        onConfirm={(v) => (action ? submit(action, v) : Promise.resolve())}
      />
    </Drawer>
  );
}
