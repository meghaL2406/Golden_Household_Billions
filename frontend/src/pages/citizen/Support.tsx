import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Drawer, Modal, Notice, PageHeader, Select, Skeleton, StatusTag, Table, Textarea, Timeline } from "../../components";
import { api } from "../../lib/api";
import { fmtDate, fmtDateTime, titleCase } from "../../lib/format";
import { useApi, useToast } from "../../lib/hooks";
import { GRIEVANCE_CATEGORIES, Muted, Row, Stack, errorMessage, options } from "./_shared";

export default function Support() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const list = useApi<any[]>("/grievances/mine");

  const [newOpen, setNewOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (params.get("applicationId") || params.get("benefitId") || params.get("schemeId")) {
      setNewOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const header = (
    <PageHeader
      eyebrow="Citizen portal"
      title="Support"
      description="Raise a grievance about an application or benefit, and follow it through resolution."
      action={<Button onClick={() => setNewOpen(true)}>New grievance</Button>}
    />
  );

  const openRow = async (row: any) => {
    setOpenId(row.grievance_id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const d = await api(`/grievances/${row.grievance_id}`);
      setDetail(d);
    } catch (e) {
      setDetailError(errorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const reload = () => {
    list.reload();
    if (openId) openRow({ grievance_id: openId });
  };

  if (list.loading && list.data === undefined) {
    return (
      <>
        {header}
        <Skeleton rows={8} />
      </>
    );
  }

  if (list.error) {
    return (
      <>
        {header}
        <Notice tone="danger">{list.error}</Notice>
      </>
    );
  }

  const rows = list.data || [];

  return (
    <>
      {header}
      <Table
        columns={[
          { key: "grievance_number", header: "Grievance" },
          { key: "category", header: "Category", render: (r: any) => titleCase(r.category) },
          { key: "scheme_name", header: "Scheme", render: (r: any) => r.scheme_name || "—" },
          { key: "created_at", header: "Raised", render: (r: any) => fmtDate(r.created_at) },
          { key: "status", header: "Status", render: (r: any) => <StatusTag status={r.status} /> },
        ]}
        rows={rows}
        rowKey={(r: any) => r.grievance_id}
        onRowClick={openRow}
        empty="You have not raised any grievances yet."
      />

      <Drawer
        open={openId !== null}
        title="Grievance"
        onClose={() => {
          setOpenId(null);
          setDetail(null);
        }}
      >
        {detailLoading && <Skeleton rows={6} />}
        {detailError && <Notice tone="danger">{detailError}</Notice>}
        {detail && <GrievanceDetail detail={detail} onChanged={reload} />}
      </Drawer>

      <NewGrievanceModal
        open={newOpen}
        onClose={() => {
          setNewOpen(false);
          if (params.toString()) setParams({});
        }}
        applicationId={params.get("applicationId") || undefined}
        benefitId={params.get("benefitId") || undefined}
        schemeId={params.get("schemeId") || undefined}
        onCreated={() => {
          list.reload();
          toast.push("Grievance submitted.", "success");
        }}
      />
    </>
  );
}

function GrievanceDetail({ detail, onChanged }: { detail: any; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState("5");
  const g = detail.grievance;

  const act = async (action: string, extra: Record<string, any> = {}) => {
    setBusy(true);
    try {
      await api(`/grievances/${g.grievance_id}/action`, { method: "POST", body: { action, ...extra } });
      toast.push(action === "RATE" ? "Thank you for rating this resolution." : "Grievance reopened.", "success");
      onChanged();
    } catch (e) {
      toast.push(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={18}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 550 }}>{titleCase(g.category)}</div>
        <Muted>{g.grievance_number}</Muted>
      </div>
      <Row gap={8}>
        <StatusTag status={g.status} />
        {g.priority && <Muted>Priority {titleCase(g.priority)}</Muted>}
      </Row>
      <div>
        <div style={{ fontSize: 10, fontWeight: 550, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 9 }}>
          Description
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>{g.description}</p>
      </div>
      {g.resolution && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 550, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 9 }}>
            Resolution
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>{g.resolution}</p>
        </div>
      )}
      <div>
        <div style={{ fontSize: 10, fontWeight: 550, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 9 }}>
          History
        </div>
        {(g.history || []).length === 0 ? (
          <Muted>No updates recorded yet.</Muted>
        ) : (
          <Timeline items={(g.history || []).map((h: any) => ({ title: titleCase(h.action || h.status || "Update"), at: h.at, note: h.note, tone: "blue" }))} />
        )}
      </div>
      {g.status === "RESOLVED" && !g.citizen_rating && (
        <Row gap={8} align="flex-end">
          <Select label="Rate this resolution" value={rating} onChange={(e: any) => setRating(e.target.value)}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} out of 5
              </option>
            ))}
          </Select>
          <Button loading={busy} onClick={() => act("RATE", { rating: Number(rating) })}>
            Submit rating
          </Button>
        </Row>
      )}
      {g.status === "RESOLVED" && (
        <div>
          <Button variant="outline" loading={busy} onClick={() => act("REOPEN")}>
            Reopen
          </Button>
        </div>
      )}
    </Stack>
  );
}

function NewGrievanceModal({
  open,
  onClose,
  applicationId,
  benefitId,
  schemeId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  applicationId?: string;
  benefitId?: string;
  schemeId?: string;
  onCreated: () => void;
}) {
  const [category, setCategory] = useState("OTHER");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCategory(applicationId ? "APPLICATION_DELAY" : benefitId ? "BENEFIT_NOT_RECEIVED" : "OTHER");
      setDescription("");
      setError(null);
    }
  }, [open, applicationId, benefitId]);

  const submit = async () => {
    if (!description.trim()) return setError("Please describe the issue.");
    setBusy(true);
    setError(null);
    try {
      await api("/grievances", {
        method: "POST",
        body: { category, description: description.trim(), application_id: applicationId, benefit_id: benefitId, scheme_id: schemeId },
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Raise a grievance"
      onClose={onClose}
      footer={
        <Row gap={8} justify="flex-end">
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} type="button">
            Submit
          </Button>
        </Row>
      }
    >
      <Stack gap={12}>
        {error && <Notice tone="danger">{error}</Notice>}
        {(applicationId || benefitId) && <Notice tone="info">This grievance will be linked to the {applicationId ? "application" : "benefit"} you came from.</Notice>}
        <Select label="Category" value={category} onChange={(e: any) => setCategory(e.target.value)}>
          {options(GRIEVANCE_CATEGORIES)}
        </Select>
        <Textarea label="Describe the issue" value={description} onChange={(e: any) => setDescription(e.target.value)} rows={4} required />
      </Stack>
    </Modal>
  );
}
