import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Input, Notice, PageHeader, Skeleton, StatRow, StatTile, StatusTag, Stepper, Timeline } from "../../components";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDateTime, titleCase } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { CandidateList, Grid, MONO, Muted, Row, Stack, activeMembers, errorMessage, type FamilyDetail } from "./_shared";

const STORY = [
  "Check whether you or a family member already has a record.",
  "Tell us how many people live in your household and where.",
  "Enter the head of family with their Aadhaar number.",
  "Add each member with their relationship to the head.",
  "Upload supporting documents for the family and members.",
  "Review and submit for verification by an officer.",
  "An officer checks documents and resolves any duplicate flags.",
  "Your Family ID is issued once the family is verified.",
  "Schemes are matched automatically to every member.",
  "Apply with pre-filled details and track each benefit to delivery.",
];

export default function Home() {
  const { user } = useAuth();
  const fam = useApi<FamilyDetail | null>("/families/mine");
  const familyId = fam.data?.family_id || null;
  const elig = useApi<any>(familyId ? "/eligibility/mine" : null, undefined, [familyId]);
  const benefits = useApi<any[]>(familyId ? "/benefits/mine" : null, undefined, [familyId]);
  const notes = useApi<{ unread: number; items: any[] }>("/notifications");

  if (fam.loading && fam.data === undefined) {
    return (
      <>
        <PageHeader eyebrow="Citizen portal" title="Home" description="Your family record, schemes and benefits in one place." />
        <Skeleton rows={8} />
      </>
    );
  }

  if (fam.error) {
    return (
      <>
        <PageHeader eyebrow="Citizen portal" title="Home" description="Your family record, schemes and benefits in one place." />
        <Notice tone="danger">{fam.error}</Notice>
      </>
    );
  }

  if (!fam.data) return <NoFamilyHome mobile={user?.mobile || ""} />;
  return <FamilyHome family={fam.data} eligibility={elig.data} benefits={benefits.data || []} notifications={notes.data?.items || []} />;
}

function NoFamilyHome({ mobile }: { mobile: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState({ mobile, aadhaar: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api("/families/search-existing", { params: { mobile: q.mobile, aadhaar: q.aadhaar, name: q.name } });
      setResult(r);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Citizen portal" title="Welcome" description="You do not have a Family ID yet. Enrolment takes about ten minutes." />
      <Grid cols={2} gap={22}>
        <Card eyebrow="Start here" title="Start your Family ID">
          <Stack gap={14}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
              One record for your whole household, verified once and reused for every scheme. The ten steps are listed below.
            </p>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }}>
              {STORY.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <div>
              <Button onClick={() => navigate("/enrol")}>Begin enrolment</Button>
            </div>
          </Stack>
        </Card>
        <Card eyebrow="Already enrolled?" title="Search existing family" subnote="Use this if a family member may already have created a record.">
          <form onSubmit={search}>
            <Stack gap={12}>
              <Input label="Mobile number" value={q.mobile} onChange={(e: any) => setQ({ ...q, mobile: e.target.value })} inputMode="numeric" />
              <Input label="Aadhaar last digits" value={q.aadhaar} onChange={(e: any) => setQ({ ...q, aadhaar: e.target.value })} inputMode="numeric" hint="The last four digits are enough." />
              <Input label="Name" value={q.name} onChange={(e: any) => setQ({ ...q, name: e.target.value })} />
              <div>
                <Button variant="outline" type="submit" loading={busy}>
                  Search
                </Button>
              </div>
              {error && <Notice tone="danger">{error}</Notice>}
              {result && (
                <Stack gap={8}>
                  {(result.existing_members || []).length === 0 ? (
                    <Notice tone="info">No existing family record matches these details, so you can begin a new enrolment.</Notice>
                  ) : (
                    <>
                      <Notice tone="warning">A family record already contains a matching person. Contact a service centre before creating a new family.</Notice>
                      <CandidateList candidates={result.existing_members} />
                    </>
                  )}
                </Stack>
              )}
            </Stack>
          </form>
        </Card>
      </Grid>
    </>
  );
}

function FamilyHome({ family, eligibility, benefits, notifications }: { family: FamilyDetail; eligibility: any; benefits: any[]; notifications: any[] }) {
  const navigate = useNavigate();
  const members = activeMembers(family);
  const verified = members.filter((m) => m.verification_status === "VERIFIED").length;
  const eligibleCount = useMemo(() => (eligibility?.items || []).filter((i: any) => i.eligibility_status === "ELIGIBLE").length, [eligibility]);
  const activeBenefits = benefits.filter((b) => b.benefit_status === "ACTIVE" || !b.benefit_status).length;
  const steps = (family.completeness?.steps || []).map((s) => ({ label: s.label, done: s.done }));
  const firstOpen = steps.findIndex((s) => !s.done);
  const stepperSteps = steps.map((s, i) => ({ ...s, active: i === firstOpen }));
  const infoCase = (family.verification_cases || []).find((c: any) => c.case_status === "INFO_REQUESTED");

  const nextSteps: { text: string; to: string }[] = [];
  if (family.family_status === "DRAFT") nextSteps.push({ text: "Finish the enrolment and submit the family for verification.", to: "/enrol" });
  if (family.family_status === "REJECTED") nextSteps.push({ text: "Correct the details noted by the officer and submit again.", to: "/family" });
  if (infoCase) nextSteps.push({ text: "An officer has requested more information; upload the documents.", to: "/family" });
  if ((family.completeness?.percent ?? 100) < 100 && family.family_status !== "DRAFT") nextSteps.push({ text: "Complete the remaining profile steps.", to: "/family" });
  if ((eligibility?.items || []).some((i: any) => i.eligibility_status === "NEEDS_DOCUMENT")) nextSteps.push({ text: "Upload the missing documents to unlock more schemes.", to: "/schemes" });
  if (eligibleCount > 0) nextSteps.push({ text: `Apply for the ${eligibleCount} scheme${eligibleCount === 1 ? "" : "s"} your family is eligible for.`, to: "/schemes" });
  if (benefits.some((b) => b.delivery_status === "DISBURSED" || b.delivery_status === "DELIVERED")) nextSteps.push({ text: "Confirm whether you received the disbursed benefits.", to: "/benefits" });
  if (nextSteps.length === 0) nextSteps.push({ text: "Your profile is up to date. Report any life event as soon as it happens.", to: "/family" });

  return (
    <>
      <PageHeader
        eyebrow="Citizen portal"
        title="Home"
        description="Your family record, schemes and benefits in one place."
        action={
          <Button variant="outline" onClick={() => navigate("/family")}>
            Open family profile
          </Button>
        }
      />
      <Stack gap={22}>
        <StatRow>
          <StatTile label="Members" value={members.length} unit="people" note={`${family.declared_member_count ?? members.length} declared`} />
          <StatTile label="Verified members" value={verified} unit={`of ${members.length}`} note="Confirmed by an officer" />
          <StatTile label="Eligible schemes" value={eligibility ? eligibleCount : "—"} unit="schemes" note="Matched to your members" />
          <StatTile label="Active benefits" value={activeBenefits} unit="benefits" note="Sanctioned or in delivery" />
        </StatRow>

        <FamilyStatusNotice family={family} />

        <Grid cols={2} gap={22}>
          <Card eyebrow="Completeness" title="Profile completeness" subnote={`${family.completeness?.percent ?? 0} % complete`}>
            {stepperSteps.length > 0 ? <Stepper steps={stepperSteps} /> : <Muted>Completeness is calculated once the family is created.</Muted>}
          </Card>
          <Card eyebrow="Next steps" title="What to do next">
            <Stack gap={8}>
              {nextSteps.map((s, i) => (
                <Row key={i} justify="space-between" gap={12} wrap={false}>
                  <span style={{ fontSize: 12 }}>{s.text}</span>
                  <Link to={s.to} style={{ fontSize: 12, fontWeight: 550, color: "var(--blue)", whiteSpace: "nowrap" }}>
                    Go
                  </Link>
                </Row>
              ))}
            </Stack>
          </Card>
        </Grid>

        <Grid cols={2} gap={22}>
          <Card
            eyebrow="Notifications"
            title="Latest notifications"
            action={
              <Link to="/notifications" style={{ fontSize: 12, color: "var(--blue)", fontWeight: 550 }}>
                View all
              </Link>
            }
          >
            {notifications.length === 0 ? (
              <Muted>No notifications yet.</Muted>
            ) : (
              <Timeline
                items={notifications.slice(0, 5).map((n: any) => ({
                  title: n.title || titleCase(n.notification_type),
                  at: n.sent_at ? fmtDateTime(n.sent_at) : undefined,
                  note: n.message,
                  tone: n.status === "UNREAD" ? "blue" : "neutral",
                }))}
              />
            )}
          </Card>
          <Card eyebrow="Quick links" title="Go to">
            <Grid cols={2} gap={8}>
              {[
                { to: "/family", label: "Family profile", note: "Members, documents, life events" },
                { to: "/schemes", label: "Schemes", note: "Eligibility and applications" },
                { to: "/applications", label: "Applications", note: "Track every application" },
                { to: "/benefits", label: "Benefits", note: "Confirm what you received" },
                { to: "/support", label: "Support", note: "Raise or follow a grievance" },
                { to: "/notifications", label: "Notifications", note: "All updates in one list" },
              ].map((l) => (
                <Card key={l.to} onClick={() => navigate(l.to)} padding={14}>
                  <div style={{ fontSize: 13, fontWeight: 550 }}>{l.label}</div>
                  <Muted size={11}>{l.note}</Muted>
                </Card>
              ))}
            </Grid>
          </Card>
        </Grid>
      </Stack>
    </>
  );
}

export function FamilyStatusNotice({ family }: { family: FamilyDetail }) {
  const navigate = useNavigate();
  switch (family.family_status) {
    case "DRAFT":
      return (
        <Notice tone="info">
          <Row justify="space-between" gap={12}>
            <span>Your family record is a draft; finish the remaining steps and submit it for verification.</span>
            <Button size="sm" onClick={() => navigate("/enrol")}>
              Continue enrolment
            </Button>
          </Row>
        </Notice>
      );
    case "PENDING_VERIFICATION":
      return <Notice tone="warning">An officer is reviewing your family record; you will be notified when it is verified.</Notice>;
    case "VERIFIED":
      return (
        <Card eyebrow="Family ID" padding={22}>
          <Row justify="space-between" gap={16}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 500, letterSpacing: "0.02em", color: "var(--ink)" }}>{family.family_code || "Pending issue"}</div>
              <Muted>Verified family in {family.district || "Gujarat"}; quote this ID when you apply for any scheme.</Muted>
            </div>
            <StatusTag status={family.family_status} />
          </Row>
        </Card>
      );
    case "REJECTED": {
      const reason = (family.verification_cases || []).filter((c: any) => c.case_status === "REJECTED").map((c: any) => c.resolution || c.reason).filter(Boolean)[0];
      return <Notice tone="danger">Your family record was rejected{reason ? `: ${reason}` : "; open the family profile for details"}.</Notice>;
    }
    default:
      return <Notice tone="info">Family status is {titleCase(family.family_status)}.</Notice>;
  }
}
