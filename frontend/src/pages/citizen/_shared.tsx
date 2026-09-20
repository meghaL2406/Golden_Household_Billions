import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  FileUpload,
  Input,
  Modal,
  Notice,
  Select,
  StatusTag,
  Textarea,
} from "../../components";
import { api, ApiError } from "../../lib/api";
import { fmtDate, titleCase } from "../../lib/format";

// ---------------------------------------------------------------------------
// Types (light, local to the citizen pages)
// ---------------------------------------------------------------------------

export type Tone = "blue" | "success" | "warning" | "danger" | "neutral";

export type Member = {
  member_id: string;
  family_id: string;
  name: string;
  father_or_husband_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  mobile_number?: string | null;
  email?: string | null;
  aadhaar_reference?: string | null;
  aadhaar_last4?: string | null;
  aadhaar_linked?: boolean;
  member_status: string;
  verification_status: string;
  identity_source?: string | null;
  is_head: boolean;
  marital_status?: string | null;
  occupation?: string | null;
  education_level?: string | null;
  is_student?: boolean;
  disability_type?: string | null;
  disability_percentage?: number | null;
  udid_reference?: string | null;
  annual_income?: number | null;
  bank_linked?: boolean;
  is_pregnant_or_lactating?: boolean;
  citizenship_status?: string | null;
  age?: number | null;
  joined_date?: string | null;
  [key: string]: any;
};

export type Relationship = {
  relationship_id: string;
  member_id: string;
  related_member_id: string;
  relationship_type: string;
  start_date?: string | null;
  end_date?: string | null;
  verification_status?: string;
  member_name?: string;
  related_member_name?: string;
  [key: string]: any;
};

export type Document = {
  document_id: string;
  owner_type: "MEMBER" | "FAMILY";
  member_id?: string | null;
  family_id?: string | null;
  document_type: string;
  document_reference?: string | null;
  issuing_authority?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  verification_status: string;
  file_url?: string | null;
  file_name?: string | null;
  remarks?: string | null;
  created_at?: string;
  [key: string]: any;
};

export type FamilyDetail = {
  family_id: string;
  family_code?: string | null;
  family_status: string;
  family_head_id?: string | null;
  family_type?: string | null;
  income_category?: string | null;
  annual_income?: number | null;
  ration_card_type?: string | null;
  declared_member_count?: number | null;
  district?: string | null;
  taluka?: string | null;
  village?: string | null;
  pincode?: string | null;
  verification_status?: string;
  notes?: string | null;
  members: Member[];
  relationships: Relationship[];
  documents: Document[];
  addresses: any[];
  external_records: any[];
  verification_cases: any[];
  life_events: any[];
  active_member_count?: number;
  completeness?: { steps: { label: string; done: boolean }[]; percent: number };
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

// ---------------------------------------------------------------------------
// Option lists (from API_CONTRACT.md)
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPES = [
  "BIRTH_CERTIFICATE",
  "MARRIAGE_CERTIFICATE",
  "DEATH_CERTIFICATE",
  "INCOME_CERTIFICATE",
  "ADDRESS_PROOF",
  "DISABILITY_CERTIFICATE",
  "RATION_CARD",
  "EDUCATION_RECORD",
  "COURT_ORDER",
  "ADOPTION_ORDER",
  "CASTE_CERTIFICATE",
  "BANK_PASSBOOK",
  "OTHER",
];

export const RELATIONSHIP_TYPES = [
  "SPOUSE",
  "FATHER",
  "MOTHER",
  "SON",
  "DAUGHTER",
  "BROTHER",
  "SISTER",
  "GUARDIAN",
  "WARD",
  "GRANDFATHER",
  "GRANDMOTHER",
  "GRANDSON",
  "GRANDDAUGHTER",
  "OTHER",
];

export const EVENT_TYPES = [
  "BIRTH",
  "MARRIAGE",
  "DEATH",
  "DIVORCE",
  "SEPARATION",
  "ADOPTION",
  "GUARDIANSHIP",
  "ADDRESS_CHANGE",
  "SPLIT",
];

export const GRIEVANCE_CATEGORIES = [
  "BENEFIT_NOT_RECEIVED",
  "WRONG_AMOUNT",
  "APPLICATION_DELAY",
  "WRONG_REJECTION",
  "DATA_ERROR",
  "VERIFICATION_DELAY",
  "OTHER",
];

export const DATA_SOURCES = ["AADHAAR", "RATION_PDS", "CIVIL_REGISTRATION", "INCOME", "UDID", "EDUCATION"];
export const FAMILY_TYPES = ["NUCLEAR", "JOINT", "SINGLE", "GUARDIAN"];
export const INCOME_CATEGORIES = ["BPL", "APL", "AAY", "UNKNOWN"];
export const RATION_CARD_TYPES = ["APL", "BPL", "AAY", "PHH", "NONE"];
export const GENDERS = ["MALE", "FEMALE", "OTHER"];
export const IDENTITY_SOURCES = ["AADHAAR", "BIRTH_CERTIFICATE", "MANUAL", "RATION"];
export const MARITAL_STATUSES = ["SINGLE", "MARRIED", "WIDOWED", "DIVORCED", "SEPARATED"];
export const ADDRESS_TYPES = ["PERMANENT", "CURRENT", "TEMPORARY"];

export const MONO = '"IBM Plex Mono", ui-monospace, monospace';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const d: any = e.detail;
    if (typeof d === "string") return d;
    if (d && typeof d.message === "string") return d.message;
    if (Array.isArray(d) && d.length && d[0]?.msg) return String(d[0].msg);
    return e.message || "The request could not be completed.";
  }
  if (e instanceof Error) return e.message;
  return "The request could not be completed.";
}

export function conflictCandidates(e: unknown): any[] | null {
  if (e instanceof ApiError && e.status === 409) {
    const d: any = e.detail;
    if (d && Array.isArray(d.candidates)) return d.candidates;
    return [];
  }
  return null;
}

export function ageFromDob(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age < 0 ? 0 : age;
}

export function isNewborn(dob?: string | null): boolean {
  if (!dob) return false;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return false;
  const diff = Date.now() - d.getTime();
  return diff >= 0 && diff < 365 * 24 * 3600 * 1000;
}

export function label(code?: string | null): string {
  return code ? titleCase(code) : "—";
}

export function options(codes: string[], placeholder?: string): ReactNode {
  return (
    <>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {codes.map((c) => (
        <option key={c} value={c}>
          {titleCase(c)}
        </option>
      ))}
    </>
  );
}

export function memberOptions(members: Member[], placeholder?: string): ReactNode {
  return (
    <>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {members.map((m) => (
        <option key={m.member_id} value={m.member_id}>
          {m.name}
          {m.is_head ? " (head)" : ""}
        </option>
      ))}
    </>
  );
}

export function headOf(family: FamilyDetail | null | undefined): Member | undefined {
  if (!family) return undefined;
  return family.members.find((m) => m.is_head) || family.members.find((m) => m.member_id === family.family_head_id);
}

const INVERSE: Record<string, string> = {
  FATHER: "CHILD",
  MOTHER: "CHILD",
  SON: "PARENT",
  DAUGHTER: "PARENT",
  BROTHER: "SIBLING",
  SISTER: "SIBLING",
  GUARDIAN: "WARD",
  WARD: "GUARDIAN",
  GRANDFATHER: "GRANDCHILD",
  GRANDMOTHER: "GRANDCHILD",
  GRANDSON: "GRANDPARENT",
  GRANDDAUGHTER: "GRANDPARENT",
  SPOUSE: "SPOUSE",
  OTHER: "OTHER",
};

/** Human label of how a member relates to the family head, derived from relationships. */
export function relationToHead(family: FamilyDetail, member: Member): string {
  const head = headOf(family);
  if (!head) return "—";
  if (member.member_id === head.member_id) return "Head";
  const direct = family.relationships.find(
    (r) => r.member_id === member.member_id && r.related_member_id === head.member_id && !r.end_date,
  );
  if (direct) return `${titleCase(direct.relationship_type)} of head`;
  const reverse = family.relationships.find(
    (r) => r.related_member_id === member.member_id && r.member_id === head.member_id && !r.end_date,
  );
  if (reverse) return `${titleCase(INVERSE[reverse.relationship_type] || reverse.relationship_type)} of head`;
  return "Relationship not recorded";
}

export function activeMembers(family: FamilyDetail | null | undefined): Member[] {
  if (!family) return [];
  return family.members.filter((m) => m.member_status !== "LEFT" && m.member_status !== "DECEASED");
}

export function missingRequirementLabel(x: any): string {
  if (typeof x === "string") return titleCase(x);
  if (x && typeof x === "object") {
    return titleCase(String(x.document_type || x.label || x.field || x.code || JSON.stringify(x)));
  }
  return String(x);
}

export function missingRequirementCode(x: any): string | null {
  if (typeof x === "string") return DOCUMENT_TYPES.includes(x) ? x : null;
  if (x && typeof x === "object" && typeof x.document_type === "string") return x.document_type;
  return null;
}

// ---------------------------------------------------------------------------
// Status chains
// ---------------------------------------------------------------------------

export const APPLICATION_CHAIN = [
  "Eligible",
  "Applied",
  "Under review",
  "Approved",
  "Sanctioned",
  "Disbursed",
  "Delivered",
  "Received",
];

export const DELIVERY_CHAIN = ["Sanctioned", "Disbursed", "Delivered", "Received"];

function deliveryIndex(deliveryStatus?: string | null): number {
  switch (deliveryStatus) {
    case "SANCTIONED":
      return 0;
    case "DISBURSED":
    case "NOT_RECEIVED":
    case "DISPUTED":
      return 1;
    case "DELIVERED":
      return 2;
    case "RECEIVED_CONFIRMED":
      return 3;
    default:
      return -1;
  }
}

export function applicationChainSteps(applicationStatus?: string | null, deliveryStatus?: string | null) {
  let reached = 0;
  switch (applicationStatus) {
    case "SUBMITTED":
      reached = 1;
      break;
    case "UNDER_REVIEW":
    case "INFO_REQUESTED":
      reached = 2;
      break;
    case "APPROVED":
      reached = 3;
      break;
    case "REJECTED":
    case "WITHDRAWN":
      reached = 2;
      break;
    default:
      reached = 0;
  }
  const d = deliveryIndex(deliveryStatus);
  if (d >= 0) reached = 4 + d;
  return APPLICATION_CHAIN.map((l, i) => ({ label: l, done: i < reached, active: i === reached }));
}

export function deliveryChainSteps(deliveryStatus?: string | null) {
  const reached = Math.max(0, deliveryIndex(deliveryStatus));
  const finished = deliveryStatus === "RECEIVED_CONFIRMED";
  return DELIVERY_CHAIN.map((l, i) => ({ label: l, done: i < reached || (finished && i === reached), active: i === reached }));
}

// ---------------------------------------------------------------------------
// Layout helpers (plain elements; the barrel does not expose grid primitives)
// ---------------------------------------------------------------------------

export function Grid({ cols = 2, children, gap = 12 }: { cols?: 1 | 2 | 3 | 4; children: ReactNode; gap?: number }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>{children}</div>;
}

export function Row({ children, gap = 8, wrap = true, align = "center", justify }: { children: ReactNode; gap?: number; wrap?: boolean; align?: string; justify?: string }) {
  return (
    <div style={{ display: "flex", gap, flexWrap: wrap ? "wrap" : "nowrap", alignItems: align as any, justifyContent: justify as any }}>
      {children}
    </div>
  );
}

export function Stack({ children, gap = 16 }: { children: ReactNode; gap?: number }) {
  return <div style={{ display: "flex", flexDirection: "column", gap }}>{children}</div>;
}

export function Muted({ children, size = 12 }: { children: ReactNode; size?: number }) {
  return <span style={{ color: "var(--muted)", fontSize: size }}>{children}</span>;
}

export function Mono({ children, size = 12 }: { children: ReactNode; size?: number }) {
  return <span style={{ fontFamily: MONO, fontSize: size }}>{children}</span>;
}

export function CheckLine({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, lineHeight: 1.5, cursor: disabled ? "default" : "pointer" }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3, accentColor: "var(--blue)" }} />
      <span>{children}</span>
    </label>
  );
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? "1px solid var(--blue)" : "1px solid var(--line)",
        background: active ? "var(--blue-light)" : "#fff",
        color: active ? "var(--blue)" : "#5b6678",
        borderRadius: 999,
        padding: "7px 14px",
        fontSize: 12,
        fontWeight: 550,
        cursor: "pointer",
        transition: "background 0.18s ease, border-color 0.18s ease, color 0.18s ease",
      }}
    >
      {children}
    </button>
  );
}

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6f91", marginBottom: 9 }}>
      {children}
    </div>
  );
}

export function useEnums() {
  const [enums, setEnums] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    api("/meta/enums")
      .then((d) => alive && setEnums(d))
      .catch(() => alive && setEnums({}));
    return () => {
      alive = false;
    };
  }, []);
  return {
    districts: (enums?.districts as string[]) || [],
    documentTypes: (enums?.document_types as string[]) || DOCUMENT_TYPES,
    relationshipTypes: (enums?.relationship_types as string[]) || RELATIONSHIP_TYPES,
    grievanceCategories: (enums?.grievance_categories as string[]) || GRIEVANCE_CATEGORIES,
    loaded: enums !== null,
  };
}

// ---------------------------------------------------------------------------
// Member form (MemberIn)
// ---------------------------------------------------------------------------

export type MemberForm = {
  name: string;
  father_or_husband_name: string;
  date_of_birth: string;
  gender: string;
  mobile_number: string;
  email: string;
  aadhaar_reference: string;
  identity_source: string;
  marital_status: string;
  occupation: string;
  education_level: string;
  is_student: boolean;
  disability_type: string;
  disability_percentage: string;
  udid_reference: string;
  annual_income: string;
  bank_linked: boolean;
  is_pregnant_or_lactating: boolean;
  citizenship_status: string;
  relationship_type: string;
  related_member_id: string;
  force: boolean;
};

export function emptyMember(partial: Partial<MemberForm> = {}): MemberForm {
  return {
    name: "",
    father_or_husband_name: "",
    date_of_birth: "",
    gender: "",
    mobile_number: "",
    email: "",
    aadhaar_reference: "",
    identity_source: "",
    marital_status: "",
    occupation: "",
    education_level: "",
    is_student: false,
    disability_type: "",
    disability_percentage: "",
    udid_reference: "",
    annual_income: "",
    bank_linked: false,
    is_pregnant_or_lactating: false,
    citizenship_status: "CITIZEN",
    relationship_type: "",
    related_member_id: "",
    force: false,
    ...partial,
  };
}

export function memberFormFrom(m: Member): MemberForm {
  return emptyMember({
    name: m.name || "",
    father_or_husband_name: m.father_or_husband_name || "",
    date_of_birth: m.date_of_birth || "",
    gender: m.gender || "",
    mobile_number: m.mobile_number || "",
    email: m.email || "",
    identity_source: m.identity_source || "",
    marital_status: m.marital_status || "",
    occupation: m.occupation || "",
    education_level: m.education_level || "",
    is_student: !!m.is_student,
    disability_type: m.disability_type || "",
    disability_percentage: m.disability_percentage != null ? String(m.disability_percentage) : "",
    udid_reference: m.udid_reference || "",
    annual_income: m.annual_income != null ? String(m.annual_income) : "",
    bank_linked: !!m.bank_linked,
    is_pregnant_or_lactating: !!m.is_pregnant_or_lactating,
    citizenship_status: m.citizenship_status || "CITIZEN",
  });
}

/** Convert the form into a MemberIn payload, dropping empty strings. */
export function memberPayload(f: MemberForm, opts: { includeRelationship?: boolean; includeAadhaar?: boolean } = {}): Record<string, any> {
  const newborn = isNewborn(f.date_of_birth);
  const includeAadhaar = opts.includeAadhaar ?? true;
  const s = (v: string) => (v.trim() === "" ? undefined : v.trim());
  const n = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const out: Record<string, any> = {
    name: f.name.trim(),
    father_or_husband_name: s(f.father_or_husband_name),
    date_of_birth: s(f.date_of_birth),
    gender: s(f.gender),
    mobile_number: s(f.mobile_number),
    email: s(f.email),
    aadhaar_reference: newborn || !includeAadhaar ? undefined : s(f.aadhaar_reference),
    identity_source: newborn ? "BIRTH_CERTIFICATE" : s(f.identity_source) || (s(f.aadhaar_reference) ? "AADHAAR" : "MANUAL"),
    marital_status: s(f.marital_status),
    occupation: s(f.occupation),
    education_level: s(f.education_level),
    is_student: f.is_student,
    disability_type: s(f.disability_type),
    disability_percentage: n(f.disability_percentage),
    udid_reference: s(f.udid_reference),
    annual_income: n(f.annual_income),
    bank_linked: f.bank_linked,
    is_pregnant_or_lactating: f.is_pregnant_or_lactating,
    citizenship_status: s(f.citizenship_status) || "CITIZEN",
    force: f.force,
  };
  if (opts.includeRelationship) {
    out.relationship_type = s(f.relationship_type);
    out.related_member_id = s(f.related_member_id);
  }
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

export function MemberFields({
  value,
  onChange,
  mode = "member",
  members = [],
  compact = false,
}: {
  value: MemberForm;
  onChange: (next: MemberForm) => void;
  mode?: "head" | "member" | "newborn" | "spouse" | "edit";
  members?: Member[];
  compact?: boolean;
}) {
  const set = (k: keyof MemberForm, v: any) => onChange({ ...value, [k]: v });
  const newborn = mode === "newborn" || isNewborn(value.date_of_birth);
  const showAadhaar = !newborn && mode !== "edit";
  const showRelationship = mode === "member";

  return (
    <Stack gap={12}>
      <Grid cols={2}>
        <Input label="Full name" value={value.name} onChange={(e: any) => set("name", e.target.value)} required />
        <Input label="Father or husband name" value={value.father_or_husband_name} onChange={(e: any) => set("father_or_husband_name", e.target.value)} />
        <Input label="Date of birth" type="date" value={value.date_of_birth} onChange={(e: any) => set("date_of_birth", e.target.value)} />
        <Select label="Gender" value={value.gender} onChange={(e: any) => set("gender", e.target.value)}>
          {options(GENDERS, "Select")}
        </Select>
        {!newborn && (
          <>
            <Input label="Mobile number" value={value.mobile_number} onChange={(e: any) => set("mobile_number", e.target.value)} inputMode="numeric" />
            <Input label="Email" type="email" value={value.email} onChange={(e: any) => set("email", e.target.value)} />
          </>
        )}
      </Grid>

      {newborn ? (
        <Notice tone="info">This child is under one year old, so the identity source is the birth certificate and Aadhaar is not requested.</Notice>
      ) : (
        showAadhaar && (
          <Grid cols={2}>
            <Input
              label="Aadhaar number"
              value={value.aadhaar_reference}
              onChange={(e: any) => set("aadhaar_reference", e.target.value)}
              hint="Required for every member above one year of age."
              inputMode="numeric"
              maxLength={12}
              required
            />
            <Select label="Identity source" value={value.identity_source} onChange={(e: any) => set("identity_source", e.target.value)}>
              {options(IDENTITY_SOURCES, "Select")}
            </Select>
          </Grid>
        )
      )}

      {showRelationship && (
        <Grid cols={2}>
          <Select label="Relationship to the related member" value={value.relationship_type} onChange={(e: any) => set("relationship_type", e.target.value)} required>
            {options(RELATIONSHIP_TYPES, "Select")}
          </Select>
          <Select label="Related member" value={value.related_member_id} onChange={(e: any) => set("related_member_id", e.target.value)}>
            {memberOptions(members, "Select")}
          </Select>
        </Grid>
      )}

      {!compact && !newborn && (
        <>
          <Grid cols={3}>
            <Select label="Marital status" value={value.marital_status} onChange={(e: any) => set("marital_status", e.target.value)}>
              {options(MARITAL_STATUSES, "Select")}
            </Select>
            <Input label="Occupation" value={value.occupation} onChange={(e: any) => set("occupation", e.target.value)} />
            <Input label="Education level" value={value.education_level} onChange={(e: any) => set("education_level", e.target.value)} />
            <Input label="Annual income (₹)" type="number" value={value.annual_income} onChange={(e: any) => set("annual_income", e.target.value)} />
            <Input label="Disability type" value={value.disability_type} onChange={(e: any) => set("disability_type", e.target.value)} />
            <Input label="Disability percentage (%)" type="number" value={value.disability_percentage} onChange={(e: any) => set("disability_percentage", e.target.value)} />
            <Input label="UDID reference" value={value.udid_reference} onChange={(e: any) => set("udid_reference", e.target.value)} />
            <Input label="Citizenship status" value={value.citizenship_status} onChange={(e: any) => set("citizenship_status", e.target.value)} />
          </Grid>
          <Row gap={22}>
            <CheckLine checked={value.is_student} onChange={(v) => set("is_student", v)}>
              Currently a student
            </CheckLine>
            <CheckLine checked={value.bank_linked} onChange={(v) => set("bank_linked", v)}>
              Bank account linked
            </CheckLine>
            <CheckLine checked={value.is_pregnant_or_lactating} onChange={(v) => set("is_pregnant_or_lactating", v)}>
              Pregnant or lactating
            </CheckLine>
          </Row>
        </>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Address form
// ---------------------------------------------------------------------------

export type AddressForm = {
  address_type: string;
  address_line: string;
  village: string;
  taluka: string;
  district: string;
  state: string;
  pincode: string;
};

export function emptyAddress(partial: Partial<AddressForm> = {}): AddressForm {
  return { address_type: "PERMANENT", address_line: "", village: "", taluka: "", district: "", state: "Gujarat", pincode: "", ...partial };
}

export function addressPayload(a: AddressForm): Record<string, any> {
  const s = (v: string) => (v.trim() === "" ? undefined : v.trim());
  const out: Record<string, any> = {
    address_type: a.address_type || "PERMANENT",
    address_line: a.address_line.trim(),
    village: s(a.village),
    taluka: s(a.taluka),
    district: a.district,
    state: a.state || "Gujarat",
    pincode: s(a.pincode),
  };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

export function AddressFields({ value, onChange, districts }: { value: AddressForm; onChange: (a: AddressForm) => void; districts: string[] }) {
  const set = (k: keyof AddressForm, v: string) => onChange({ ...value, [k]: v });
  return (
    <Stack gap={12}>
      <Textarea label="Address line" value={value.address_line} onChange={(e: any) => set("address_line", e.target.value)} rows={2} required />
      <Grid cols={3}>
        <Input label="Village or locality" value={value.village} onChange={(e: any) => set("village", e.target.value)} />
        <Input label="Taluka" value={value.taluka} onChange={(e: any) => set("taluka", e.target.value)} />
        {districts.length > 0 ? (
          <Select label="District" value={value.district} onChange={(e: any) => set("district", e.target.value)} required>
            <option value="">Select</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        ) : (
          <Input label="District" value={value.district} onChange={(e: any) => set("district", e.target.value)} required />
        )}
        <Input label="State" value={value.state} onChange={(e: any) => set("state", e.target.value)} />
        <Input label="Pincode" value={value.pincode} onChange={(e: any) => set("pincode", e.target.value)} inputMode="numeric" maxLength={6} />
        <Select label="Address type" value={value.address_type} onChange={(e: any) => set("address_type", e.target.value)}>
          {options(ADDRESS_TYPES)}
        </Select>
      </Grid>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Document upload
// ---------------------------------------------------------------------------

export async function uploadDocument(o: {
  file: File;
  familyId: string;
  ownerType: "MEMBER" | "FAMILY";
  memberId?: string;
  documentType: string;
  reference?: string;
  authority?: string;
  issueDate?: string;
  expiryDate?: string;
}): Promise<Document> {
  const form = new FormData();
  form.append("file", o.file);
  form.append("owner_type", o.ownerType);
  form.append("family_id", o.familyId);
  if (o.ownerType === "MEMBER" && o.memberId) form.append("member_id", o.memberId);
  form.append("document_type", o.documentType);
  if (o.reference) form.append("document_reference", o.reference);
  if (o.authority) form.append("issuing_authority", o.authority);
  if (o.issueDate) form.append("issue_date", o.issueDate);
  if (o.expiryDate) form.append("expiry_date", o.expiryDate);
  return api<Document>("/documents", { method: "POST", form });
}

export function DocumentPicker({
  file,
  onFile,
  hint,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  hint?: string;
}) {
  return (
    <Stack gap={8}>
      <FileUpload onFile={(f) => onFile(f)} accept="image/*,.pdf" hint={hint || "PDF, JPG or PNG up to 5 MB"} />
      {file && (
        <Row justify="space-between">
          <Muted>
            Selected: {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)
          </Muted>
          <Button variant="ghost" size="sm" type="button" onClick={() => onFile(null)}>
            Remove
          </Button>
        </Row>
      )}
    </Stack>
  );
}

export function UploadDocumentModal({
  open,
  onClose,
  familyId,
  members,
  defaultOwnerType,
  defaultMemberId,
  defaultDocumentType,
  lockType = false,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  familyId: string;
  members: Member[];
  defaultOwnerType?: "MEMBER" | "FAMILY";
  defaultMemberId?: string;
  defaultDocumentType?: string;
  lockType?: boolean;
  onUploaded?: (doc: Document) => void;
}) {
  const [ownerType, setOwnerType] = useState<"MEMBER" | "FAMILY">(defaultOwnerType || (defaultMemberId ? "MEMBER" : "FAMILY"));
  const [memberId, setMemberId] = useState(defaultMemberId || members[0]?.member_id || "");
  const [documentType, setDocumentType] = useState(defaultDocumentType || "");
  const [reference, setReference] = useState("");
  const [authority, setAuthority] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setOwnerType(defaultOwnerType || (defaultMemberId ? "MEMBER" : "FAMILY"));
      setMemberId(defaultMemberId || members[0]?.member_id || "");
      setDocumentType(defaultDocumentType || "");
      setReference("");
      setAuthority("");
      setIssueDate("");
      setFile(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultMemberId, defaultDocumentType, defaultOwnerType]);

  const submit = async () => {
    if (!file) return setError("Please choose a file to upload.");
    if (!documentType) return setError("Please choose the document type.");
    if (ownerType === "MEMBER" && !memberId) return setError("Please choose the member this document belongs to.");
    setBusy(true);
    setError(null);
    try {
      const doc = await uploadDocument({ file, familyId, ownerType, memberId, documentType, reference, authority, issueDate });
      onUploaded?.(doc);
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
      title="Upload a document"
      onClose={onClose}
      footer={
        <Row gap={8} justify="flex-end">
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} type="button">
            Upload
          </Button>
        </Row>
      }
    >
      <Stack gap={12}>
        {error && <Notice tone="danger">{error}</Notice>}
        <Grid cols={2}>
          <Select label="Belongs to" value={ownerType} onChange={(e: any) => setOwnerType(e.target.value)}>
            <option value="FAMILY">The whole family</option>
            <option value="MEMBER">One member</option>
          </Select>
          {ownerType === "MEMBER" ? (
            <Select label="Member" value={memberId} onChange={(e: any) => setMemberId(e.target.value)}>
              {memberOptions(members, "Select")}
            </Select>
          ) : (
            <div />
          )}
          <Select label="Document type" value={documentType} onChange={(e: any) => setDocumentType(e.target.value)} disabled={lockType}>
            {options(DOCUMENT_TYPES, "Select")}
          </Select>
          <Input label="Document reference" value={reference} onChange={(e: any) => setReference(e.target.value)} />
          <Input label="Issuing authority" value={authority} onChange={(e: any) => setAuthority(e.target.value)} />
          <Input label="Issue date" type="date" value={issueDate} onChange={(e: any) => setIssueDate(e.target.value)} />
        </Grid>
        <DocumentPicker file={file} onFile={setFile} />
      </Stack>
    </Modal>
  );
}

export function DocumentList({ docs, emptyText = "No documents uploaded yet." }: { docs: Document[]; emptyText?: string }) {
  if (docs.length === 0) return <Muted>{emptyText}</Muted>;
  return (
    <Stack gap={6}>
      {docs.map((d) => (
        <Row key={d.document_id} justify="space-between" gap={12}>
          <span style={{ fontSize: 12 }}>
            {titleCase(d.document_type)}
            {d.document_reference ? (
              <>
                {" "}
                <Mono size={11}>{d.document_reference}</Mono>
              </>
            ) : null}
            {d.issue_date ? <Muted> · issued {fmtDate(d.issue_date)}</Muted> : null}
          </span>
          <StatusTag status={d.verification_status} />
        </Row>
      ))}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Duplicate conflict modal (409 candidates)
// ---------------------------------------------------------------------------

export function CandidateList({ candidates }: { candidates: any[] }) {
  if (!candidates || candidates.length === 0) return <Muted>No candidate details were returned.</Muted>;
  return (
    <Stack gap={8}>
      {candidates.map((c: any, i: number) => (
        <div key={c.member_id || i} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", fontSize: 12 }}>
          <Row justify="space-between">
            <span style={{ fontWeight: 550 }}>{c.name || "Existing record"}</span>
            {c.level ? <StatusTag status={c.level} /> : null}
          </Row>
          <Muted>
            {[c.family_code ? `Family ${c.family_code}` : null, c.district, c.gender ? titleCase(c.gender) : null, c.date_of_birth ? `born ${fmtDate(c.date_of_birth)}` : null]
              .filter(Boolean)
              .join(" · ")}
            {typeof c.score === "number" ? ` · match score ${Math.round(c.score)} %` : ""}
          </Muted>
          {Array.isArray(c.reasons) && c.reasons.length > 0 && (
            <ul style={{ margin: "6px 0 0 16px", padding: 0, color: "var(--muted)" }}>
              {c.reasons.map((r: any, j: number) => (
                <li key={j}>{typeof r === "string" ? r : r.text || JSON.stringify(r)}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Stack>
  );
}

export function ConflictModal({
  open,
  candidates,
  onClose,
  onContinue,
  busy,
}: {
  open: boolean;
  candidates: any[];
  onClose: () => void;
  onContinue: () => void;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      title="A similar person already exists"
      onClose={onClose}
      footer={
        <Row gap={8} justify="flex-end">
          <Button variant="outline" onClick={onClose} type="button">
            Go back and check
          </Button>
          <Button onClick={onContinue} loading={busy} type="button">
            This is a different person, continue
          </Button>
        </Row>
      }
    >
      <Stack gap={12}>
        <Notice tone="warning">Creating a second record for the same person delays verification and may block benefits.</Notice>
        <CandidateList candidates={candidates} />
      </Stack>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Consent + fetch records modal
// ---------------------------------------------------------------------------

export function FetchRecordsModal({
  open,
  onClose,
  family,
  member,
  onFetched,
}: {
  open: boolean;
  onClose: () => void;
  family: FamilyDetail;
  member: Member | null;
  onFetched?: () => void;
}) {
  const [source, setSource] = useState("AADHAAR");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setSource("AADHAAR");
      setAgree(false);
      setError(null);
      setResult(null);
    }
  }, [open, member?.member_id]);

  const run = async () => {
    if (!member) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/families/${family.family_id}/consents`, {
        method: "POST",
        body: { member_id: member.member_id, data_source: source, purpose: "Family ID verification" },
      });
      setResult(r);
      onFetched?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const records: any[] = result?.records || [];

  return (
    <Modal
      open={open}
      title={member ? `Fetch records for ${member.name}` : "Fetch records"}
      onClose={onClose}
      footer={
        <Row gap={8} justify="flex-end">
          <Button variant="outline" onClick={onClose} type="button">
            Close
          </Button>
          {!result && (
            <Button onClick={run} loading={busy} disabled={!agree} type="button">
              Give consent and fetch
            </Button>
          )}
        </Row>
      }
    >
      <Stack gap={12}>
        {error && <Notice tone="danger">{error}</Notice>}
        {!result ? (
          <>
            <Select label="Data source" value={source} onChange={(e: any) => setSource(e.target.value)}>
              {options(DATA_SOURCES)}
            </Select>
            <CheckLine checked={agree} onChange={setAgree}>
              I consent to the Family ID system fetching this member's record from the selected source for the purpose of verifying the family profile. The
              consent is recorded with date and time and can be revoked through a service centre.
            </CheckLine>
          </>
        ) : (
          <>
            <Notice tone="success">Consent was recorded and the source was queried.</Notice>
            {result.message ? <Muted>{result.message}</Muted> : null}
            {records.length === 0 ? (
              <Muted>No matching record was returned by this source.</Muted>
            ) : (
              <Stack gap={8}>
                {records.map((r: any, i: number) => (
                  <div key={r.record_id || i} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", fontSize: 12 }}>
                    <Row justify="space-between">
                      <span style={{ fontWeight: 550 }}>
                        {titleCase(r.source_system || source)} · {titleCase(r.record_type || "record")}
                      </span>
                      <StatusTag status={r.match_status || "UNMATCHED"} />
                    </Row>
                    <Muted>
                      Reference <Mono size={11}>{r.external_reference_id || "—"}</Mono>
                      {typeof r.match_score === "number" || typeof r.match_score === "string" ? ` · match score ${Number(r.match_score)} %` : ""}
                    </Muted>
                    {r.fetched_data && typeof r.fetched_data === "object" && (
                      <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 4 }}>
                        {Object.entries(r.fetched_data)
                          .slice(0, 8)
                          .map(([k, v]) => (
                            <div key={k}>
                              <Muted size={10}>{titleCase(k)}</Muted>
                              <div>{typeof v === "object" ? JSON.stringify(v) : String(v)}</div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Life event modal
// ---------------------------------------------------------------------------

const EVENT_HELP: Record<string, string> = {
  BIRTH: "The newborn is added immediately as a provisional member and an officer confirms the birth certificate.",
  MARRIAGE: "The spouse can be an existing member or a new person joining the family.",
  DEATH: "The member is marked deceased after the officer verifies the death certificate.",
  DIVORCE: "Relationships are ended after officer review; the member may leave the household.",
  SEPARATION: "Relationships are ended after officer review; the member may leave the household.",
  ADOPTION: "An adoption order is required; the ward is linked to the guardian after review.",
  GUARDIANSHIP: "A court order is required; the ward is linked to the guardian after review.",
  ADDRESS_CHANGE: "The new address becomes current after the officer verifies the proof.",
  SPLIT: "Selected members move into a new family after officer review.",
};

export function LifeEventModal({
  open,
  onClose,
  family,
  districts,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  family: FamilyDetail;
  districts: string[];
  onDone: (result: any) => void;
}) {
  const members = useMemo(() => activeMembers(family), [family]);
  const head = headOf(family);

  const [eventType, setEventType] = useState("BIRTH");
  const [eventDate, setEventDate] = useState("");
  const [memberId, setMemberId] = useState("");
  const [relatedId, setRelatedId] = useState("");
  const [newborn, setNewborn] = useState<MemberForm>(emptyMember());
  const [spouseNew, setSpouseNew] = useState(false);
  const [spouse, setSpouse] = useState<MemberForm>(emptyMember({ marital_status: "MARRIED" }));
  const [leaves, setLeaves] = useState(false);
  const [address, setAddress] = useState<AddressForm>(emptyAddress({ district: family.district || "" }));
  const [splitIds, setSplitIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEventType("BIRTH");
      setEventDate("");
      setMemberId(head?.member_id || "");
      setRelatedId("");
      setNewborn(emptyMember());
      setSpouseNew(false);
      setSpouse(emptyMember({ marital_status: "MARRIED" }));
      setLeaves(false);
      setAddress(emptyAddress({ district: family.district || "" }));
      setSplitIds([]);
      setFile(null);
      setNote("");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const docTypeFor = (t: string): string | null => {
    switch (t) {
      case "BIRTH":
        return "BIRTH_CERTIFICATE";
      case "MARRIAGE":
        return "MARRIAGE_CERTIFICATE";
      case "DEATH":
        return "DEATH_CERTIFICATE";
      case "DIVORCE":
      case "SEPARATION":
      case "GUARDIANSHIP":
        return "COURT_ORDER";
      case "ADOPTION":
        return "ADOPTION_ORDER";
      case "ADDRESS_CHANGE":
        return "ADDRESS_PROOF";
      default:
        return null;
    }
  };
  const docRequired = ["BIRTH", "DEATH", "ADOPTION", "GUARDIANSHIP", "ADDRESS_CHANGE"].includes(eventType);
  const docType = docTypeFor(eventType);

  const submit = async () => {
    setError(null);
    if (docRequired && !file) return setError("Please attach the supporting document before reporting this event.");
    if (eventType === "BIRTH" && (!newborn.name.trim() || !newborn.date_of_birth)) return setError("Please enter the name and date of birth of the newborn.");
    if (eventType === "BIRTH" && !memberId && !relatedId) return setError("Please select at least one parent.");
    if (["MARRIAGE", "DEATH", "DIVORCE", "SEPARATION"].includes(eventType) && !memberId) return setError("Please select the member concerned.");
    if (eventType === "MARRIAGE" && !spouseNew && !relatedId) return setError("Please select the spouse or add a new spouse.");
    if (eventType === "MARRIAGE" && spouseNew && !spouse.name.trim()) return setError("Please enter the name of the new spouse.");
    if (["ADOPTION", "GUARDIANSHIP"].includes(eventType) && (!memberId || !relatedId)) return setError("Please select the guardian and the ward.");
    if (eventType === "ADDRESS_CHANGE" && (!address.address_line.trim() || !address.district)) return setError("Please enter the new address line and district.");
    if (eventType === "SPLIT" && splitIds.length === 0) return setError("Please select the members who will form the new family.");

    setBusy(true);
    try {
      let documentId: string | undefined;
      if (file && docType) {
        const ownerMember = eventType === "BIRTH" ? undefined : memberId || undefined;
        const doc = await uploadDocument({
          file,
          familyId: family.family_id,
          ownerType: ownerMember ? "MEMBER" : "FAMILY",
          memberId: ownerMember,
          documentType: docType,
          issueDate: eventDate || undefined,
        });
        documentId = doc.document_id;
      }
      const details: Record<string, any> = {};
      if (note.trim()) details.note = note.trim();
      const payload: Record<string, any> = { event_type: eventType, event_date: eventDate || undefined, document_id: documentId, details };

      switch (eventType) {
        case "BIRTH":
          payload.member_id = memberId || undefined;
          payload.related_member_id = relatedId || undefined;
          payload.event_date = newborn.date_of_birth || eventDate || undefined;
          payload.newborn = { ...memberPayload({ ...newborn, identity_source: "BIRTH_CERTIFICATE" }, { includeAadhaar: false }), identity_source: "BIRTH_CERTIFICATE" };
          break;
        case "MARRIAGE":
          payload.member_id = memberId;
          if (spouseNew) details.new_spouse = memberPayload({ ...spouse, marital_status: "MARRIED" });
          else payload.related_member_id = relatedId;
          break;
        case "DEATH":
          payload.member_id = memberId;
          break;
        case "DIVORCE":
        case "SEPARATION":
          payload.member_id = memberId;
          payload.related_member_id = relatedId || undefined;
          details.leaves_household = leaves;
          break;
        case "ADOPTION":
        case "GUARDIANSHIP":
          payload.member_id = memberId;
          payload.related_member_id = relatedId;
          details.guardian_member_id = memberId;
          details.ward_member_id = relatedId;
          break;
        case "ADDRESS_CHANGE":
          payload.member_id = head?.member_id;
          Object.assign(details, addressPayload(address));
          break;
        case "SPLIT":
          payload.member_id = splitIds[0];
          details.member_ids = splitIds;
          if (address.address_line.trim()) details.new_address = addressPayload(address);
          break;
      }
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
      const result = await api("/life-events", { method: "POST", body: payload });
      onDone(result);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const memberSelect = (lbl: string, value: string, set: (v: string) => void, exclude?: string) => (
    <Select label={lbl} value={value} onChange={(e: any) => set(e.target.value)}>
      {memberOptions(
        members.filter((m) => m.member_id !== exclude),
        "Select",
      )}
    </Select>
  );

  return (
    <Modal
      open={open}
      title="Report a life event"
      onClose={onClose}
      footer={
        <Row gap={8} justify="flex-end">
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} type="button">
            Report event
          </Button>
        </Row>
      }
    >
      <Stack gap={14}>
        {error && <Notice tone="danger">{error}</Notice>}
        <Grid cols={2}>
          <Select label="Event type" value={eventType} onChange={(e: any) => setEventType(e.target.value)}>
            {options(EVENT_TYPES)}
          </Select>
          {eventType !== "BIRTH" && <Input label="Event date" type="date" value={eventDate} onChange={(e: any) => setEventDate(e.target.value)} />}
        </Grid>
        <Notice tone="info">{EVENT_HELP[eventType]}</Notice>

        {eventType === "BIRTH" && (
          <>
            <SectionEyebrow>Birth certificate first</SectionEyebrow>
            <DocumentPicker file={file} onFile={setFile} hint="Upload the birth certificate issued by the registrar" />
            <SectionEyebrow>Parents</SectionEyebrow>
            <Grid cols={2}>
              {memberSelect("Father", memberId, setMemberId, relatedId)}
              {memberSelect("Mother", relatedId, setRelatedId, memberId)}
            </Grid>
            <SectionEyebrow>Newborn</SectionEyebrow>
            <MemberFields value={newborn} onChange={setNewborn} mode="newborn" compact />
          </>
        )}

        {eventType === "MARRIAGE" && (
          <>
            {memberSelect("Member who married", memberId, setMemberId)}
            <CheckLine checked={spouseNew} onChange={setSpouseNew}>
              The spouse is a new person joining this family
            </CheckLine>
            {spouseNew ? (
              <MemberFields value={spouse} onChange={setSpouse} mode="spouse" compact />
            ) : (
              memberSelect("Spouse (existing member)", relatedId, setRelatedId, memberId)
            )}
            <SectionEyebrow>Marriage certificate (optional)</SectionEyebrow>
            <DocumentPicker file={file} onFile={setFile} />
          </>
        )}

        {eventType === "DEATH" && (
          <>
            {memberSelect("Deceased member", memberId, setMemberId)}
            <SectionEyebrow>Death certificate</SectionEyebrow>
            <DocumentPicker file={file} onFile={setFile} />
          </>
        )}

        {(eventType === "DIVORCE" || eventType === "SEPARATION") && (
          <>
            <Grid cols={2}>
              {memberSelect("Member", memberId, setMemberId, relatedId)}
              {memberSelect("Spouse", relatedId, setRelatedId, memberId)}
            </Grid>
            <CheckLine checked={leaves} onChange={setLeaves}>
              The member leaves this household
            </CheckLine>
            <SectionEyebrow>Court order or agreement (optional)</SectionEyebrow>
            <DocumentPicker file={file} onFile={setFile} />
          </>
        )}

        {(eventType === "ADOPTION" || eventType === "GUARDIANSHIP") && (
          <>
            <Grid cols={2}>
              {memberSelect("Guardian or adoptive parent", memberId, setMemberId, relatedId)}
              {memberSelect("Ward or adopted child", relatedId, setRelatedId, memberId)}
            </Grid>
            <Muted>If the child is not yet a member of this family, add the child from the Members tab first and then report the event.</Muted>
            <SectionEyebrow>{eventType === "ADOPTION" ? "Adoption order" : "Court order"}</SectionEyebrow>
            <DocumentPicker file={file} onFile={setFile} />
          </>
        )}

        {eventType === "ADDRESS_CHANGE" && (
          <>
            <AddressFields value={address} onChange={setAddress} districts={districts} />
            <SectionEyebrow>Address proof</SectionEyebrow>
            <DocumentPicker file={file} onFile={setFile} />
          </>
        )}

        {eventType === "SPLIT" && (
          <>
            <SectionEyebrow>Members forming the new family</SectionEyebrow>
            <Stack gap={6}>
              {members
                .filter((m) => !m.is_head)
                .map((m) => (
                  <CheckLine
                    key={m.member_id}
                    checked={splitIds.includes(m.member_id)}
                    onChange={(v) => setSplitIds((ids) => (v ? [...ids, m.member_id] : ids.filter((x) => x !== m.member_id)))}
                  >
                    {m.name} <Muted>({relationToHead(family, m)})</Muted>
                  </CheckLine>
                ))}
            </Stack>
            <SectionEyebrow>New address (optional)</SectionEyebrow>
            <AddressFields value={address} onChange={setAddress} districts={districts} />
          </>
        )}

        <Textarea label="Note for the officer (optional)" value={note} onChange={(e: any) => setNote(e.target.value)} rows={2} />
      </Stack>
    </Modal>
  );
}
