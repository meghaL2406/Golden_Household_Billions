import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Drawer, KeyValue, Notice, PageHeader, Skeleton, StatusTag, Stepper, Table, Timeline } from "../../components";
import { api } from "../../lib/api";
import { fmtDate, fmtDateTime, titleCase } from "../../lib/format";
import { useApi, useToast } from "../../lib/hooks";
import { Muted, Row, Stack, applicationChainSteps, errorMessage } from "./_shared";

export default function Applications() {
  const navigate = useNavigate();
  const toast = useToast();
  const list = useApi<any[]>("/applications/mine");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  const header = <PageHeader eyebrow="Citizen portal" title="Applications" description="Every application you have submitted, and where it stands." />;

  const openRow = async (row: any) => {
    setOpenId(row.application_id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const d = await api(`/applications/${row.application_id}`);
      setDetail(d);
    } catch (e) {
      setDetailError(errorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const withdraw = async () => {
    if (!detail?.application) return;
    setWithdrawBusy(true);
    try {
      await api(`/applications/${detail.application.application_id}/action`, { method: "POST", body: { action: "WITHDRAW" } });
      toast.push("Application withdrawn.", "success");
      list.reload();
      setOpenId(null);
    } catch (e) {
      toast.push(errorMessage(e), "danger");
    } finally {
      setWithdrawBusy(false);
    }
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
          { key: "application_number", header: "Application" },
          { key: "scheme_name", header: "Scheme" },
          { key: "member_name", header: "Member", render: (r: any) => r.member_name || "Family" },
          { key: "department", header: "Department" },
          { key: "created_at", header: "Submitted", render: (r: any) => fmtDate(r.created_at) },
          { key: "application_status", header: "Status", render: (r: any) => <StatusTag status={r.application_status} /> },
        ]}
        rows={rows}
        rowKey={(r: any) => r.application_id}
        onRowClick={openRow}
        empty="You have not submitted any applications yet."
      />

      <Drawer open={openId !== null} title="Application" onClose={() => setOpenId(null)}>
        {detailLoading && <Skeleton rows={6} />}
        {detailError && <Notice tone="danger">{detailError}</Notice>}
        {detail && (
          <Stack gap={18}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 550 }}>{detail.scheme?.scheme_name}</div>
              <Muted>{detail.application.application_number}</Muted>
            </div>
            <Stepper steps={applicationChainSteps(detail.application.application_status, detail.benefit?.delivery_status)} />
            <KeyValue
              columns={2}
              items={[
                { label: "Status", value: <StatusTag status={detail.application.application_status} /> },
                { label: "Submitted", value: fmtDateTime(detail.application.submitted_at || detail.application.created_at) },
                { label: "Member", value: detail.application.member_id ? detail.family?.members?.find((m: any) => m.member_id === detail.application.member_id)?.name : "Family" },
                { label: "Officer remarks", value: detail.application.officer_remarks || "—" },
              ]}
            />
            <div>
              <div style={{ fontSize: 10, fontWeight: 550, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 9 }}>
                Status history
              </div>
              {(detail.application.status_history || []).length === 0 ? (
                <Muted>No status changes recorded yet.</Muted>
              ) : (
                <Timeline
                  items={(detail.application.status_history || []).map((h: any) => ({
                    title: titleCase(h.status),
                    at: h.at,
                    note: h.note,
                    tone: "blue",
                  }))}
                />
              )}
            </div>
            <Row justify="space-between" gap={12}>
              {["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED"].includes(detail.application.application_status) ? (
                <Button variant="outline" onClick={withdraw} loading={withdrawBusy}>
                  Withdraw
                </Button>
              ) : (
                <span />
              )}
              <Button variant="ghost" onClick={() => navigate(`/support?applicationId=${detail.application.application_id}`)}>
                Raise a grievance
              </Button>
            </Row>
          </Stack>
        )}
      </Drawer>
    </>
  );
}
