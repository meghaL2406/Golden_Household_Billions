import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Icon } from "./Icon";
import { Notice } from "./Notice";
import { Tag } from "./Tag";

type Link = { label: string; to: string };
type Message = { role: "user" | "assistant"; text: string; links?: Link[] };
type Status = { available: boolean; mode: string; title: string; message: string; suggestions: string[] };

/**
 * Floating AI assistant launcher and panel. The conversation is a preview: the backend answers from
 * fixed samples (see backend/app/routers/assistant.py) until a language model is connected.
 */
export function Assistant(): JSX.Element | null {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || status || !user) return;
    api<Status>("/assistant/status")
      .then((s) => {
        setStatus(s);
        setMessages([{ role: "assistant", text: `Hello ${user.name}. Ask about eligibility, documents, life events, benefits or grievances. ${s.message}` }]);
      })
      .catch(() => setStatus({ available: false, mode: "mock", title: "AI assistant", message: "Preview unavailable right now.", suggestions: [] }));
  }, [open, status, user]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  if (!user) return null;

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft("");
    setMessages((m) => [...m, { role: "user", text: t }]);
    setBusy(true);
    try {
      const res = await api<{ reply: string; links: Link[] }>("/assistant/chat", { body: { message: t } });
      setMessages((m) => [...m, { role: "assistant", text: res.reply, links: res.links }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "The assistant could not answer just now. Please try again." }]);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  return (
    <>
      {open ? (
        <section className="fid-assistant" role="dialog" aria-label="AI assistant preview">
          <header className="fid-assistant__head">
            <div>
              <div className="eyebrow">AI ASSISTANT</div>
              <div className="row gap-8" style={{ alignItems: "center" }}>
                <span className="h2">Family ID assistant</span>
                <Tag tone="warning">Coming soon</Tag>
              </div>
            </div>
            <button type="button" className="fid-iconbtn" aria-label="Close assistant" onClick={() => setOpen(false)}>
              <Icon name="x" size={16} />
            </button>
          </header>

          <Notice tone="info">Preview with sample answers; it is not connected to a language model yet.</Notice>

          <div className="fid-assistant__list" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`fid-assistant__msg fid-assistant__msg--${m.role}`}>
                <p>{m.text}</p>
                {m.links && m.links.length > 0 ? (
                  <div className="fid-assistant__links">
                    {m.links.map((l) => (
                      <button key={l.to} type="button" className="fid-pill" onClick={() => { setOpen(false); navigate(l.to); }}>
                        {l.label}
                        <Icon name="arrow-right" size={12} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? <div className="fid-assistant__msg fid-assistant__msg--assistant muted">Thinking…</div> : null}
          </div>

          {status && status.suggestions.length > 0 && messages.length <= 1 ? (
            <div className="fid-assistant__suggest">
              {status.suggestions.map((s) => (
                <button key={s} type="button" className="fid-pill" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <form className="fid-assistant__form" onSubmit={onSubmit}>
            <input
              className="fid-control"
              placeholder="Ask a question"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Message"
              maxLength={2000}
            />
            <button type="submit" className="fid-btn fid-btn--primary" disabled={busy || !draft.trim()} aria-label="Send">
              <Icon name="arrow-right" size={15} />
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className={`fid-assistant__launcher${open ? " fid-assistant__launcher--open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Open the AI assistant preview"
      >
        <Icon name="sparkle" size={16} />
        <span>Assistant</span>
        <span className="fid-assistant__soon">Soon</span>
      </button>
    </>
  );
}

export default Assistant;
