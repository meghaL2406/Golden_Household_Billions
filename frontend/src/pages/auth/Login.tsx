import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Eyebrow, Icon, Input, Notice, BrandMark, Wordmark } from "../../components";
import { api, ApiError } from "../../lib/api";
import { useAuth, type User } from "../../lib/auth";
import { homeForRole } from "../../lib/guards";
import { useToast } from "../../lib/hooks";

type Channel = "MOBILE" | "EMAIL";
type Mode = "signin" | "create";

type RequestOtpResponse = {
  challenge_id: string;
  channel: Channel;
  delivered: boolean;
  expires_in_seconds: number;
  dev_otp?: string;
  known_user: boolean;
};

type VerifyOtpResponse = { token: string; user: User; family_id: string | null };

const DEMO_ACCOUNTS: { label: string; identifier: string; channel: Channel; note: string }[] = [
  { label: "Citizen", identifier: "9876500001", channel: "MOBILE", note: "verified family" },
  { label: "Citizen", identifier: "9876500002", channel: "MOBILE", note: "no family yet" },
  { label: "Service operator", identifier: "9000000001", channel: "MOBILE", note: "" },
  { label: "Verification officer", identifier: "9000000002", channel: "MOBILE", note: "" },
  { label: "Department officer", identifier: "9000000003", channel: "MOBILE", note: "" },
  { label: "Admin", identifier: "9000000004", channel: "MOBILE", note: "" },
  { label: "Admin", identifier: "admin@familyid.gov.in", channel: "EMAIL", note: "" },
];

const BULLETS: { icon: "phone" | "users" | "gift"; title: string; body: string }[] = [
  { icon: "phone", title: "Sign in with a one-time code", body: "A code is sent to your mobile number or email. No password to remember." },
  { icon: "users", title: "Enrol your household once", body: "Members, relationships and documents are verified by an officer and issued a Family ID." },
  { icon: "gift", title: "See what you qualify for", body: "Schemes are matched to your family automatically and benefits are tracked to delivery." },
];

export function Login(): JSX.Element {
  const navigate = useNavigate();
  const { login } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>("signin");
  const [channel, setChannel] = useState<Channel>("MOBILE");
  const [identifier, setIdentifier] = useState("");
  const [challenge, setChallenge] = useState<RequestOtpResponse | null>(null);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingAccountNotice, setExistingAccountNotice] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (challenge) boxes.current[0]?.focus();
  }, [challenge]);

  const reset = () => {
    setChallenge(null);
    setDigits(Array(6).fill(""));
    setName("");
    setError(null);
    setExistingAccountNotice(false);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setIdentifier("");
    reset();
  };

  const requestCode = async (e?: FormEvent) => {
    e?.preventDefault();
    const id = identifier.trim();
    if (!id) {
      setError(channel === "MOBILE" ? "Enter your mobile number." : "Enter your email address.");
      return;
    }
    if (mode === "create" && !name.trim()) {
      setError("Enter your name as it appears on your documents.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<RequestOtpResponse>("/auth/request-otp", { body: { channel, identifier: id } });
      // An account already exists for this number or email: fall back to signing the citizen in
      // rather than leaving them stuck, since the account itself is still theirs.
      setExistingAccountNotice(mode === "create" && res.known_user);
      setChallenge(res);
      setDigits(Array(6).fill(""));
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!challenge) return;
    const code = digits.join("");
    if (code.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    if (!challenge.known_user && !name.trim()) {
      setError("Enter your name as it appears on your documents.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, any> = { challenge_id: challenge.challenge_id, code };
      if (!challenge.known_user) body.name = name.trim();
      const res = await api<VerifyOtpResponse>("/auth/verify-otp", { body });
      login(res.token, res.user, res.family_id ?? null);
      toast.push(`Signed in as ${res.user.name}`, "success");
      navigate(homeForRole(res.user.role), { replace: true });
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (i: number, raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      setDigits((d) => {
        const n = [...d];
        n[i] = "";
        return n;
      });
      return;
    }
    // Support paste of the full code into any box.
    setDigits((d) => {
      const n = [...d];
      const chars = clean.split("");
      for (let k = 0; k < chars.length && i + k < 6; k++) n[i + k] = chars[k];
      return n;
    });
    const next = Math.min(i + clean.length, 5);
    boxes.current[next]?.focus();
  };

  const onDigitKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      boxes.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      boxes.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 5) {
      boxes.current[i + 1]?.focus();
    }
  };

  const fillDemo = (acct: (typeof DEMO_ACCOUNTS)[number]) => {
    setMode("signin");
    setChannel(acct.channel);
    setIdentifier(acct.identifier);
    reset();
  };

  return (
    <div className="fid-login">
      <section className="fid-login__left">
        <div className="fid-brand">
          <BrandMark />
          <Wordmark />
        </div>
        <div className="fid-login__hero">
          <Eyebrow>FAMILY ID · GUJARAT</Eyebrow>
          <h1 className="h1">One family. One verified identity.</h1>
          <p className="body-13 muted">
            A single household record that every department can trust, so eligible families receive the schemes they are entitled to
            without filing the same paperwork twice.
          </p>
          <div className="fid-login__bullets">
            {BULLETS.map((b) => (
              <div key={b.title} className="fid-login__bullet">
                <span className="fid-login__bulleticon">
                  <Icon name={b.icon} size={15} />
                </span>
                <span>
                  <strong>{b.title}.</strong> {b.body}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="fid-login__foot">Government of Gujarat demonstration build · data shown is synthetic</div>
      </section>

      <section className="fid-login__right">
        <Card
          className="fid-login__card"
          eyebrow={mode === "create" ? "NEW CITIZEN" : "SIGN IN"}
          title={challenge ? "Enter your code" : mode === "create" ? "Create your citizen account" : "Request a one-time code"}
        >
          {!challenge ? (
            <form className="stack" onSubmit={requestCode} noValidate>
              <div className="fid-tabs" role="tablist" aria-label="Account">
                {(["signin", "create"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    className={`fid-tab${mode === m ? " fid-tab--active" : ""}`}
                    onClick={() => switchMode(m)}
                  >
                    {m === "signin" ? "Sign in" : "Create new citizen"}
                  </button>
                ))}
              </div>
              <div className="fid-tabs" role="tablist" aria-label="Channel">
                {(["MOBILE", "EMAIL"] as Channel[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={channel === c}
                    className={`fid-tab${channel === c ? " fid-tab--active" : ""}`}
                    onClick={() => {
                      setChannel(c);
                      setError(null);
                    }}
                  >
                    {c === "MOBILE" ? "Mobile" : "Email"}
                  </button>
                ))}
              </div>
              <Input
                label={channel === "MOBILE" ? "Mobile number" : "Email address"}
                type={channel === "MOBILE" ? "tel" : "email"}
                inputMode={channel === "MOBILE" ? "numeric" : "email"}
                autoComplete={channel === "MOBILE" ? "tel" : "email"}
                placeholder={channel === "MOBILE" ? "10-digit mobile number" : "name@example.in"}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoFocus
              />
              {mode === "create" ? (
                <Input
                  label="Your name, as on documents"
                  placeholder="Full name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  hint="This starts a new citizen account and your family record."
                />
              ) : null}
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <Button type="submit" loading={busy} icon="arrow-right">
                {mode === "create" ? "Create account and send code" : "Send code"}
              </Button>
              {mode === "signin" ? (
                <p className="body-12 muted" style={{ textAlign: "center" }}>
                  New to Family ID?{" "}
                  <button type="button" className="fid-btn fid-btn--ghost fid-btn--sm" style={{ padding: "2px 6px" }} onClick={() => switchMode("create")}>
                    Create a citizen account
                  </button>
                </p>
              ) : (
                <p className="body-12 muted" style={{ textAlign: "center" }}>
                  Already have an account?{" "}
                  <button type="button" className="fid-btn fid-btn--ghost fid-btn--sm" style={{ padding: "2px 6px" }} onClick={() => switchMode("signin")}>
                    Sign in instead
                  </button>
                </p>
              )}
            </form>
          ) : (
            <form className="stack" onSubmit={verify} noValidate>
              <p className="body-12 muted">
                A 6-digit code was sent to <span className="mono" style={{ color: "var(--ink)" }}>{identifier}</span>.{" "}
                <button type="button" className="fid-btn fid-btn--ghost fid-btn--sm" style={{ padding: "2px 6px" }} onClick={reset}>
                  Change
                </button>
              </p>
              {challenge.dev_otp ? (
                <Notice tone="info">
                  Development mode: your code is <span className="mono">{challenge.dev_otp}</span>
                </Notice>
              ) : null}
              {existingAccountNotice ? (
                <Notice tone="info">An account already exists for this number or email address. Enter the code below to sign in instead.</Notice>
              ) : null}
              <div>
                <div className="fid-field__label" style={{ marginBottom: 6 }}>
                  Verification code
                </div>
                <div className="fid-otp">
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        boxes.current[i] = el;
                      }}
                      className="fid-control fid-otp__box"
                      inputMode="numeric"
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      maxLength={6}
                      aria-label={`Digit ${i + 1}`}
                      value={d}
                      onChange={(e) => setDigit(i, e.target.value)}
                      onKeyDown={(e) => onDigitKey(i, e)}
                      onFocus={(e) => e.target.select()}
                    />
                  ))}
                </div>
              </div>
              {!challenge.known_user && mode === "signin" ? (
                <Input
                  label="Your name, as on documents"
                  placeholder="Full name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  hint="This number is new to us. Your name starts your family record."
                />
              ) : null}
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <Button type="submit" loading={busy} icon="check">
                {mode === "create" && !existingAccountNotice ? "Create account" : "Verify and continue"}
              </Button>
            </form>
          )}
        </Card>

        <div className="fid-login__demo">
          <Eyebrow>DEMO ACCOUNTS · OTP 123456</Eyebrow>
          <div className="fid-login__pills">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={`${a.channel}-${a.identifier}`} type="button" className="fid-pill" onClick={() => fillDemo(a)} title={a.note || a.label}>
                {a.label}
                <span className="mono">{a.identifier}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default Login;
