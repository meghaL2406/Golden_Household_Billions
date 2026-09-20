export type Tone = "blue" | "success" | "warning" | "danger" | "neutral";

const DATE_FMT = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const DATETIME_FMT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? DATE_FMT.format(d) : "—";
}

export function fmtDateTime(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? DATETIME_FMT.format(d) : "—";
}

/** "₹ 12,000" — Indian grouping. Callers place the unit label outside via components when needed. */
export function fmtMoney(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "—";
  return `₹ ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(num)}`;
}

export function fmtNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-IN").format(num);
}

/** "NEEDS_DOCUMENT" -> "Needs document" */
export function titleCase(code: string | null | undefined): string {
  if (!code) return "";
  const words = String(code).replace(/[-_]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const SUCCESS = new Set(["VERIFIED", "APPROVED", "ELIGIBLE", "DELIVERED", "RECEIVED_CONFIRMED", "RESOLVED", "ACTIVE", "CLOSED", "DISBURSED", "SANCTIONED"]);
const WARNING = new Set(["UNDER_REVIEW", "SUBMITTED", "NEEDS_DOCUMENT", "INFO_REQUESTED", "PROVISIONAL", "IN_PROGRESS", "ESCALATED", "ASSIGNED"]);
const DANGER = new Set(["REJECTED", "NOT_ELIGIBLE", "NOT_RECEIVED", "DISPUTED", "FLAGGED", "INACTIVE", "LEFT", "HIGH"]);
const NEUTRAL = new Set(["DRAFT", "UNVERIFIED", "OPEN", "WITHDRAWN", "MERGED", "DECEASED"]);

export function statusTone(status: string | null | undefined): Tone {
  const s = String(status ?? "").toUpperCase();
  if (!s) return "neutral";
  if (SUCCESS.has(s)) return "success";
  if (s.startsWith("PENDING") || WARNING.has(s)) return "warning";
  if (DANGER.has(s)) return "danger";
  if (NEUTRAL.has(s)) return "neutral";
  return "blue";
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function relativeTime(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} d ago`;
  return fmtDate(iso);
}
