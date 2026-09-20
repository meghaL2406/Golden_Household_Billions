import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, KeyValue, Notice, PageHeader, Skeleton, StatusTag, Tag } from "../../components";
import { api } from "../../lib/api";
import { fmtMoney, titleCase } from "../../lib/format";
import { useApi, useToast } from "../../lib/hooks";
import {
  CheckLine,
  DocumentPicker,
  Grid,
  Muted,
  Row,
  SectionEyebrow,
  Stack,
  errorMessage,
  headOf,
  missingRequirementLabel,
  uploadDocument,
  type FamilyDetail,
} from "./_shared";

export default function SchemeApply() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const fam = useApi<FamilyDetail | null>("/families/mine");
  const schemes = useApi<any[]>("/schemes");
  const elig = useApi<any>("/eligibility/mine");

  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [attached, setAttached] = useState<Record<string, string>>({});
  const [agree, setAgree] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const scheme = useMemo(() => (schemes.data || []).find((s: any) => s.scheme_id === id), [schemes.data, id]);
  const item = useMemo(() => (elig.data?.items || []).find((i: any) => i.scheme?.scheme_id === id), [elig.data, id]);

  const loading = fam.loading || schemes.loading || elig.loading;
  const header = <PageHeader eyebrow="Citizen portal" title="Apply for a scheme" description="Review your verified details and attach the required documents." />;

  if (loading && (fam.data === undefined || schemes.data === undefined || elig.data === undefined)) {
    return (
      <>
        {header}
        <Skeleton rows={8} />
      </>
    );
  }

  if (fam.error || schemes.error || elig.error) {
    return (
      <>
        {header}
        <Notice tone="danger">{fam.error || schemes.error || elig.error}</Notice>
      </>
    );
  }

  if (!fam.data) {
    return (
      <>
        {header}
        <Notice tone="info">You need a family record before you can apply.</Notice>
      </>
    );
  }

  if (!scheme) {
    return (
      <>
        {header}
        <Notice tone="danger">This scheme could not be found.</Notice>
      </>
    );
  }

  const family = fam.data;
  const member = item?.member_id ? family.members.find((m) => m.member_id === item.member_id) : headOf(family);
  const head = headOf(family);
  const requiredDocs: string[] = scheme.required_documents || [];
  const existingDocIds = new Set(
    family.documents
      .filter((d) => requiredDocs.includes(d.document_type) && d.verification_status !== "REJECTED")
      .map((d) => `${d.document_type}:${d.document_id}`),
  );
  const hasDoc = (docType: string) =>
    family.documents.some((d) => d.document_type === docType && d.verification_status !== "REJECTED") || !!attached[docType];

  const attachFile = async (docType: string) => {
    const file = files[docType];
    if (!file) return;
    setBusy((b) => ({ ...b, [docType]: true }));
    setError(null);
    try {
      const doc = await uploadDocument({
        file,
        familyId: family.family_id,
        ownerType: member ? "MEMBER" : "FAMILY",
        memberId: member?.member_id,
        documentType: docType,
      });
      setAttached((a) => ({ ...a, [docType]: doc.document_id }));
      toast.push("Document attached.", "success");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy((b) => ({ ...b, [docType]: false }));
    }
  };

  const submit = async () => {
    if (!agree) return setError("Please confirm the declaration before submitting.");
    setSubmitBusy(true);
    setError(null);
    try {
      const attachedIds = [
        ...Array.from(existingDocIds).map((k) => k.split(":")[1]),
        ...Object.values(attached),
      ];
      await api("/applications", {
        method: "POST",
        body: { scheme_id: scheme.scheme_id, member_id: member?.member_id, attached_document_ids: attachedIds, extra: {} },
      });
      setDone(true);
      toast.push("Application submitted.", "success");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitBusy(false);
    }
  };

  if (done) {
    return (
      <>
        {header}
        <Card eyebrow="Submitted" title="Your application has been submitted">
          <Stack gap={12}>
            <Notice tone="success">The application is now with the department for review; track its status from Applications.</Notice>
            <div>
              <Button onClick={() => navigate("/applications")}>Go to applications</Button>
            </div>
          </Stack>
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      <Stack gap={18}>
        <Card eyebrow={scheme.department || "Scheme"} title={scheme.scheme_name} subnote={scheme.description}>
          <Grid cols={3}>
            <KeyValue
              items={[
                { label: "Benefit", value: scheme.benefit_amount != null ? fmtMoney(scheme.benefit_amount) : "In kind" },
                { label: "Frequency", value: scheme.benefit_frequency ? titleCase(scheme.benefit_frequency) : "—" },
                { label: "Category", value: scheme.category ? titleCase(scheme.category) : "—" },
              ]}
              columns={3}
            />
          </Grid>
          {item && (
            <div style={{ marginTop: 14 }}>
              <Row gap={8}>
                <Muted>Eligibility</Muted>
                <StatusTag status={item.eligibility_status} />
              </Row>
              {item.eligibility_reason && <Muted>{item.eligibility_reason}</Muted>}
            </div>
          )}
        </Card>

        <Card eyebrow="Applicant" title="Your verified details">
          <KeyValue
            columns={3}
            items={[
              { label: "Family ID", value: family.family_code || "Provisional" },
              { label: "Applicant", value: member?.name || head?.name || "—" },
              { label: "Date of birth", value: member?.date_of_birth || "—" },
              { label: "Gender", value: member?.gender ? titleCase(member.gender) : "—" },
              { label: "District", value: family.district || "—" },
              { label: "Income category", value: family.income_category ? titleCase(family.income_category) : "—" },
              { label: "Annual income", value: family.annual_income != null ? fmtMoney(family.annual_income) : "—" },
              { label: "Aadhaar", value: member?.aadhaar_linked ? "Linked" : "Not linked" },
            ]}
          />
        </Card>

        <Card eyebrow="Required documents" title="Attach documents">
          {requiredDocs.length === 0 ? (
            <Muted>This scheme does not require additional documents.</Muted>
          ) : (
            <Stack gap={14}>
              {requiredDocs.map((docType) => (
                <div key={docType} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                  <Row justify="space-between" gap={12}>
                    <span style={{ fontSize: 13, fontWeight: 550 }}>{missingRequirementLabel(docType)}</span>
                    {hasDoc(docType) ? <Tag tone="success">Attached</Tag> : <Tag tone="warning">Missing</Tag>}
                  </Row>
                  {!hasDoc(docType) && (
                    <div style={{ marginTop: 10 }}>
                      <DocumentPicker file={files[docType] || null} onFile={(f) => setFiles((v) => ({ ...v, [docType]: f }))} />
                      <div style={{ marginTop: 8 }}>
                        <Button size="sm" variant="outline" loading={!!busy[docType]} onClick={() => attachFile(docType)} disabled={!files[docType]}>
                          Attach
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </Stack>
          )}
        </Card>

        {error && <Notice tone="danger">{error}</Notice>}

        <Card eyebrow="Declaration" title="Confirm and submit">
          <Stack gap={14}>
            <CheckLine checked={agree} onChange={setAgree}>
              I declare that the information above is correct to the best of my knowledge, and I understand that a false declaration may result in rejection
              or recovery of the benefit.
            </CheckLine>
            <Row justify="space-between">
              <Button variant="outline" onClick={() => navigate("/schemes")}>
                Back to schemes
              </Button>
              <Button onClick={submit} loading={submitBusy}>
                Submit application
              </Button>
            </Row>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
