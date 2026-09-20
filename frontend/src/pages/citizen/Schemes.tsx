import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Eyebrow, Notice, PageHeader, Skeleton, StatusTag, Tag } from "../../components";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtMoney, titleCase } from "../../lib/format";
import { useApi, useToast } from "../../lib/hooks";
import {
  Grid,
  Muted,
  Pill,
  Row,
  Stack,
  UploadDocumentModal,
  errorMessage,
  missingRequirementCode,
  missingRequirementLabel,
  type FamilyDetail,
} from "./_shared";

const STATUS_FILTERS = ["ALL", "ELIGIBLE", "NEEDS_DOCUMENT", "UNDER_REVIEW", "NOT_ELIGIBLE"];

export default function Schemes() {
  const navigate = useNavigate();
  const toast = useToast();
  const { familyId } = useAuth();
  const fam = useApi<FamilyDetail | null>("/families/mine");
  const elig = useApi<any>("/eligibility/mine");
  const [filter, setFilter] = useState("ALL");
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [uploadFor, setUploadFor] = useState<{ memberId?: string; documentType?: string } | null>(null);

  const items: any[] = elig.data?.items || [];
  const filtered = useMemo(() => (filter === "ALL" ? items : items.filter((i) => i.eligibility_status === filter)), [items, filter]);

  const recalculate = async () => {
    const fid = familyId || fam.data?.family_id;
    if (!fid) return;
    setRecalcBusy(true);
    try {
      await api(`/eligibility/recalculate/${fid}`, { method: "POST" });
      elig.reload();
      toast.push("Eligibility recalculated.", "success");
    } catch (e) {
      toast.push(errorMessage(e), "danger");
    } finally {
      setRecalcBusy(false);
    }
  };

  const header = (
    <PageHeader
      eyebrow="Citizen portal"
      title="Schemes"
      description="Schemes matched to your family, with reasons and required documents."
      action={
        <Button variant="outline" onClick={recalculate} loading={recalcBusy}>
          Recalculate
        </Button>
      }
    />
  );

  if ((elig.loading && elig.data === undefined) || (fam.loading && fam.data === undefined)) {
    return (
      <>
        {header}
        <Skeleton rows={8} />
      </>
    );
  }

  if (elig.error) {
    return (
      <>
        {header}
        <Notice tone="danger">{elig.error}</Notice>
      </>
    );
  }

  if (!fam.data) {
    return (
      <>
        {header}
        <Notice tone="info">You need a family record before schemes can be matched.</Notice>
      </>
    );
  }

  return (
    <>
      {header}
      <Stack gap={18}>
        <Row gap={8}>
          {STATUS_FILTERS.map((s) => (
            <Pill key={s} active={filter === s} onClick={() => setFilter(s)}>
              {s === "ALL" ? "All" : titleCase(s)}
              <span style={{ marginLeft: 6, opacity: 0.7 }}>{s === "ALL" ? items.length : items.filter((i) => i.eligibility_status === s).length}</span>
            </Pill>
          ))}
        </Row>

        {filtered.length === 0 ? (
          <Notice tone="info">No schemes match this filter.</Notice>
        ) : (
          <Grid cols={2} gap={16}>
            {filtered.map((item) => {
              const scheme = item.scheme || {};
              const missing: any[] = item.missing_requirement || item.missing_documents || [];
              const canApply = (item.eligibility_status === "ELIGIBLE" || item.eligibility_status === "NEEDS_DOCUMENT") && !item.application;
              return (
                <Card key={item.eligibility_id || scheme.scheme_id} eyebrow={scheme.department || "Scheme"} title={scheme.scheme_name}>
                  <Stack gap={12}>
                    <Row justify="space-between" gap={12}>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 550 }} className="tabular">
                          {scheme.benefit_amount != null ? fmtMoney(scheme.benefit_amount) : "In kind"}
                        </div>
                        <Muted size={11}>{scheme.benefit_frequency ? titleCase(scheme.benefit_frequency) : titleCase(scheme.benefit_type || "")}</Muted>
                      </div>
                      <StatusTag status={item.eligibility_status} />
                    </Row>

                    <Row justify="space-between" gap={12}>
                      <Muted>{item.member_name || "Whole family"}</Muted>
                      {scheme.category && <Tag tone="neutral">{titleCase(scheme.category)}</Tag>}
                    </Row>

                    {item.eligibility_reason && <Muted>{item.eligibility_reason}</Muted>}

                    {missing.length > 0 && (
                      <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, fontWeight: 550, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Missing documents
                        </div>
                        <Stack gap={6}>
                          {missing.map((m: any, i: number) => (
                            <Row key={i} justify="space-between">
                              <span style={{ fontSize: 12 }}>{missingRequirementLabel(m)}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setUploadFor({ memberId: item.member_id, documentType: missingRequirementCode(m) || undefined })}
                              >
                                Upload
                              </Button>
                            </Row>
                          ))}
                        </Stack>
                      </div>
                    )}

                    <Row justify="space-between" gap={12}>
                      {item.application ? (
                        <Row gap={8}>
                          <Muted>Application</Muted>
                          <StatusTag status={item.application.application_status} />
                        </Row>
                      ) : item.benefit ? (
                        <Row gap={8}>
                          <Muted>Benefit</Muted>
                          <StatusTag status={item.benefit.delivery_status} />
                        </Row>
                      ) : (
                        <Muted>Not yet applied</Muted>
                      )}
                      {canApply ? (
                        <Button size="sm" onClick={() => navigate(`/schemes/${scheme.scheme_id}/apply`)}>
                          Apply
                        </Button>
                      ) : item.application ? (
                        <Button size="sm" variant="outline" onClick={() => navigate("/applications")}>
                          View application
                        </Button>
                      ) : null}
                    </Row>
                  </Stack>
                </Card>
              );
            })}
          </Grid>
        )}
      </Stack>

      {fam.data && uploadFor && (
        <UploadDocumentModal
          open
          onClose={() => setUploadFor(null)}
          familyId={fam.data.family_id}
          members={fam.data.members}
          defaultOwnerType={uploadFor.memberId ? "MEMBER" : "FAMILY"}
          defaultMemberId={uploadFor.memberId}
          defaultDocumentType={uploadFor.documentType}
          onUploaded={() => {
            elig.reload();
            toast.push("Document uploaded; eligibility will be reassessed.", "success");
          }}
        />
      )}
    </>
  );
}
