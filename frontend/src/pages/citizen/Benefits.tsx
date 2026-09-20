import { useState } from "react";
import { Button, Card, Notice, PageHeader, Skeleton, StatusTag, Stepper, Timeline } from "../../components";
import { api } from "../../lib/api";
import { fmtMoney, titleCase } from "../../lib/format";
import { useApi, useToast } from "../../lib/hooks";
import { Grid, Muted, Row, Stack, deliveryChainSteps, errorMessage } from "./_shared";

const CONFIRMABLE = new Set(["DISBURSED", "DELIVERED"]);

export default function Benefits() {
  const toast = useToast();
  const list = useApi<any[]>("/benefits/mine");
  const [busy, setBusy] = useState<Record<string, string | null>>({});

  const header = <PageHeader eyebrow="Citizen portal" title="Benefits" description="Track delivery of every benefit sanctioned for your family." />;

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

  const confirm = async (benefitId: string, status: "RECEIVED_CONFIRMED" | "NOT_RECEIVED") => {
    setBusy((b) => ({ ...b, [benefitId]: status }));
    try {
      await api(`/benefits/${benefitId}/delivery`, { method: "POST", body: { status } });
      toast.push(status === "RECEIVED_CONFIRMED" ? "Thank you, the receipt was confirmed." : "A grievance has been raised for the missing benefit.", "success");
      list.reload();
    } catch (e) {
      toast.push(errorMessage(e), "danger");
    } finally {
      setBusy((b) => ({ ...b, [benefitId]: null }));
    }
  };

  return (
    <>
      {header}
      {rows.length === 0 ? (
        <Notice tone="info">No benefits have been sanctioned yet.</Notice>
      ) : (
        <Grid cols={2} gap={16}>
          {rows.map((b: any) => {
            const canConfirm = CONFIRMABLE.has(b.delivery_status);
            const settled = b.delivery_status === "RECEIVED_CONFIRMED" || b.delivery_status === "DISPUTED" || b.delivery_status === "NOT_RECEIVED";
            return (
              <Card key={b.benefit_id} eyebrow={b.department || "Benefit"} title={b.scheme_name} subnote={b.member_name || "Family"}>
                <Stack gap={14}>
                  <Row justify="space-between">
                    <div style={{ fontSize: 22, fontWeight: 550 }} className="tabular">
                      {b.benefit_amount != null ? fmtMoney(b.benefit_amount) : "In kind"}
                    </div>
                    <StatusTag status={b.delivery_status} />
                  </Row>
                  <Stepper steps={deliveryChainSteps(b.delivery_status)} />
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 550, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 9 }}>
                      Delivery log
                    </div>
                    {(b.delivery_log || []).length === 0 ? (
                      <Muted>No delivery updates recorded yet.</Muted>
                    ) : (
                      <Timeline
                        items={(b.delivery_log || []).map((l: any) => ({ title: titleCase(l.status), at: l.at, note: l.note, tone: "blue" }))}
                      />
                    )}
                  </div>
                  {canConfirm && !settled && (
                    <Row gap={8}>
                      <Button size="sm" loading={busy[b.benefit_id] === "RECEIVED_CONFIRMED"} onClick={() => confirm(b.benefit_id, "RECEIVED_CONFIRMED")}>
                        I received this benefit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busy[b.benefit_id] === "NOT_RECEIVED"}
                        onClick={() => confirm(b.benefit_id, "NOT_RECEIVED")}
                      >
                        I have not received it
                      </Button>
                    </Row>
                  )}
                </Stack>
              </Card>
            );
          })}
        </Grid>
      )}
    </>
  );
}
