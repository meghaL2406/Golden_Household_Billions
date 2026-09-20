import { useState, type ReactNode } from "react";
import { Button, Card, Icon, Notice, PageHeader, Skeleton, StatusTag, Table, Tabs } from "../../components";
import { useApi } from "../../lib/hooks";
import { fmtMoney, titleCase } from "../../lib/format";
import { BarChart, downloadCsv, fmtNum, LineChart } from "./_shared";

const TABS = [
  { key: "district", label: "District" },
  { key: "schemes", label: "Schemes" },
  { key: "applications", label: "Applications" },
  { key: "benefits", label: "Benefits" },
  { key: "cases", label: "Cases" },
];

export default function Reports() {
  const [tab, setTab] = useState("district");

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader eyebrow="REPORTS" title="Reports" description="State-wide figures on families, schemes, applications, benefits and verification cases." />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "district" && <DistrictReport />}
      {tab === "schemes" && <SchemesReport />}
      {tab === "applications" && <ApplicationsReport />}
      {tab === "benefits" && <BenefitsReport />}
      {tab === "cases" && <CasesReport />}
    </div>
  );
}

function ReportCard({
  eyebrow,
  title,
  subnote,
  onDownload,
  children,
}: {
  eyebrow: string;
  title: string;
  subnote?: string;
  onDownload: () => void;
  children: ReactNode;
}) {
  return (
    <Card
      eyebrow={eyebrow}
      title={title}
      subnote={subnote}
      action={
        <Button variant="outline" size="sm" icon={<Icon name="download" size={14} />} onClick={onDownload}>
          Download CSV
        </Button>
      }
    >
      {children}
    </Card>
  );
}

function DistrictReport() {
  const { data, loading, error } = useApi<any[]>("/dashboard/reports/district");
  const rows = data ?? [];
  return (
    <div className="stack" style={{ gap: 16 }}>
      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <ReportCard
            eyebrow="DISTRICT"
            title="Families by district"
            subnote="Source: GET /dashboard/reports/district."
            onDownload={() =>
              downloadCsv(
                "district-report.csv",
                ["District", "Families", "Verified", "Pending", "Members", "Applications", "Benefits"],
                rows.map((d) => [d.district, d.families, d.verified, d.pending, d.members, d.applications, d.benefits]),
              )
            }
          >
            <BarChart data={rows.map((d) => ({ label: d.district ?? "Unknown", value: d.families, secondary: d.verified }))} unit="families" primaryLabel="Registered" secondaryLabel="Verified" />
          </ReportCard>
          <Card eyebrow="TABLE" title="District detail">
            <Table
              columns={[
                { key: "district", header: "District", render: (d: any) => d.district ?? "Unknown" },
                { key: "families", header: "Families", align: "right", render: (d: any) => fmtNum(d.families) },
                { key: "verified", header: "Verified", align: "right", render: (d: any) => fmtNum(d.verified) },
                { key: "pending", header: "Pending", align: "right", render: (d: any) => fmtNum(d.pending) },
                { key: "members", header: "Members", align: "right", render: (d: any) => fmtNum(d.members) },
                { key: "applications", header: "Applications", align: "right", render: (d: any) => fmtNum(d.applications) },
                { key: "benefits", header: "Benefits", align: "right", render: (d: any) => fmtNum(d.benefits) },
              ]}
              rows={rows}
              rowKey={(d: any) => d.district ?? "unknown"}
              empty="No district data is available."
            />
          </Card>
        </>
      )}
    </div>
  );
}

function SchemesReport() {
  const { data, loading, error } = useApi<any[]>("/dashboard/reports/schemes");
  const rows = data ?? [];
  return (
    <div className="stack" style={{ gap: 16 }}>
      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <ReportCard
            eyebrow="SCHEMES"
            title="Applications by scheme"
            subnote="Source: GET /dashboard/reports/schemes."
            onDownload={() =>
              downloadCsv(
                "schemes-report.csv",
                ["Scheme", "Eligible", "Needs document", "Under review", "Not eligible", "Applications", "Approved", "Delivered"],
                rows.map((s) => [s.scheme_name, s.eligible, s.needs_document, s.under_review, s.not_eligible, s.applications, s.approved, s.delivered]),
              )
            }
          >
            <BarChart data={rows.map((s) => ({ label: s.scheme_name ?? s.scheme_code, value: s.applications, secondary: s.approved }))} unit="applications" primaryLabel="Applications" secondaryLabel="Approved" />
          </ReportCard>
          <Card eyebrow="TABLE" title="Scheme detail">
            <Table
              columns={[
                { key: "scheme", header: "Scheme", render: (s: any) => <span className="mono">{s.scheme_code}</span> },
                { key: "name", header: "Name", render: (s: any) => s.scheme_name },
                { key: "eligible", header: "Eligible", align: "right", render: (s: any) => fmtNum(s.eligible) },
                { key: "needs", header: "Needs document", align: "right", render: (s: any) => fmtNum(s.needs_document) },
                { key: "review", header: "Under review", align: "right", render: (s: any) => fmtNum(s.under_review) },
                { key: "not", header: "Not eligible", align: "right", render: (s: any) => fmtNum(s.not_eligible) },
                { key: "apps", header: "Applications", align: "right", render: (s: any) => fmtNum(s.applications) },
                { key: "approved", header: "Approved", align: "right", render: (s: any) => fmtNum(s.approved) },
                { key: "delivered", header: "Delivered", align: "right", render: (s: any) => fmtNum(s.delivered) },
              ]}
              rows={rows}
              rowKey={(s: any) => s.scheme_id}
              empty="No scheme data is available."
            />
          </Card>
        </>
      )}
    </div>
  );
}

function ApplicationsReport() {
  const { data, loading, error } = useApi<{ by_status: Record<string, number>; by_day: { date: string; count: number }[] }>(
    "/dashboard/reports/applications",
    { days: 30 },
  );
  const byStatus = Object.entries(data?.by_status ?? {});
  const byDay = data?.by_day ?? [];
  return (
    <div className="stack" style={{ gap: 16 }}>
      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <ReportCard
            eyebrow="APPLICATIONS"
            title="Applications submitted, last 30 days"
            subnote="Source: GET /dashboard/reports/applications."
            onDownload={() => downloadCsv("applications-by-day.csv", ["Date", "Count"], byDay.map((d) => [d.date, d.count]))}
          >
            <LineChart points={byDay.map((d) => ({ label: d.date, value: d.count }))} unit="applications" />
          </ReportCard>
          <Card eyebrow="TABLE" title="Applications by status">
            <Table
              columns={[
                { key: "status", header: "Status", render: ([s]: [string, number]) => <StatusTag status={s} /> },
                { key: "count", header: "Applications", align: "right", render: ([, c]: [string, number]) => fmtNum(c) },
              ]}
              rows={byStatus}
              rowKey={([s]: [string, number]) => s}
              empty="No application data is available."
            />
          </Card>
        </>
      )}
    </div>
  );
}

function BenefitsReport() {
  const { data, loading, error } = useApi<{ by_delivery_status: Record<string, number>; total_amount: number; by_scheme: { scheme_name: string; count: number; amount: number }[] }>(
    "/dashboard/reports/benefits",
  );
  const byStatus = Object.entries(data?.by_delivery_status ?? {});
  const byScheme = data?.by_scheme ?? [];
  return (
    <div className="stack" style={{ gap: 16 }}>
      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <ReportCard
            eyebrow="BENEFITS"
            title="Benefit amount by scheme"
            subnote={`Source: GET /dashboard/reports/benefits. Total disbursed ${fmtMoney(Number(data?.total_amount ?? 0))}.`}
            onDownload={() => downloadCsv("benefits-by-scheme.csv", ["Scheme", "Count", "Amount"], byScheme.map((s) => [s.scheme_name, s.count, s.amount]))}
          >
            <BarChart data={byScheme.map((s) => ({ label: s.scheme_name, value: s.count }))} unit="benefits" primaryLabel="Benefits" />
          </ReportCard>
          <Card eyebrow="TABLE" title="Benefits by delivery status">
            <Table
              columns={[
                { key: "status", header: "Delivery status", render: ([s]: [string, number]) => <StatusTag status={s} /> },
                { key: "count", header: "Benefits", align: "right", render: ([, c]: [string, number]) => fmtNum(c) },
              ]}
              rows={byStatus}
              rowKey={([s]: [string, number]) => s}
              empty="No benefit data is available."
            />
          </Card>
        </>
      )}
    </div>
  );
}

function CasesReport() {
  const { data, loading, error } = useApi<{ by_type: Record<string, number>; by_status: Record<string, number>; avg_resolution_hours: number }>(
    "/dashboard/reports/cases",
  );
  const byType = Object.entries(data?.by_type ?? {});
  const byStatus = Object.entries(data?.by_status ?? {});
  return (
    <div className="stack" style={{ gap: 16 }}>
      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <ReportCard
            eyebrow="CASES"
            title="Verification cases by type"
            subnote={`Source: GET /dashboard/reports/cases. Average resolution time ${fmtNum(Math.round(data?.avg_resolution_hours ?? 0))} hours.`}
            onDownload={() => downloadCsv("cases-by-type.csv", ["Type", "Count"], byType.map(([t, c]) => [titleCase(t), c]))}
          >
            <BarChart data={byType.map(([t, c]) => ({ label: titleCase(t), value: c }))} unit="cases" primaryLabel="Cases" />
          </ReportCard>
          <Card eyebrow="TABLE" title="Cases by status">
            <Table
              columns={[
                { key: "status", header: "Status", render: ([s]: [string, number]) => <StatusTag status={s} /> },
                { key: "count", header: "Cases", align: "right", render: ([, c]: [string, number]) => fmtNum(c) },
              ]}
              rows={byStatus}
              rowKey={([s]: [string, number]) => s}
              empty="No case data is available."
            />
          </Card>
        </>
      )}
    </div>
  );
}
