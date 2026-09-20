import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, EmptyState, Notice, Skeleton, Tag } from "../components";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { relativeTime, titleCase } from "../lib/format";
import { useApi, useToast } from "../lib/hooks";
import { PageHeader } from "../components/PageHeader";

type Notification = {
  notification_id: string;
  title?: string;
  message?: string;
  body?: string;
  notification_type?: string;
  type?: string;
  is_read?: boolean;
  read_at?: string | null;
  created_at?: string;
  link?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
};

type Response = { unread: number; items: Notification[] };

function isRead(n: Notification): boolean {
  return n.is_read === true || (n.read_at !== undefined && n.read_at !== null);
}

function idOf(n: Notification): string {
  return n.notification_id ?? (n as any).id;
}

export function NotificationsPage(): JSX.Element {
  const { data, loading, error, reload } = useApi<Response>("/notifications");
  const toast = useToast();
  const navigate = useNavigate();
  const { isOfficer } = useAuth();
  const [busy, setBusy] = useState(false);

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const markRead = async (n: Notification) => {
    if (!isRead(n)) {
      try {
        await api(`/notifications/${idOf(n)}/read`, { method: "POST" });
        reload();
      } catch (err: any) {
        toast.push(err?.message ?? "Could not mark as read", "danger");
      }
    }
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await api("/notifications/read-all", { method: "POST" });
      reload();
      toast.push("All notifications marked as read", "success");
    } catch (err: any) {
      toast.push(err?.message ?? "Could not mark all as read", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="NOTIFICATIONS"
        title="Notifications"
        description={unread > 0 ? `${unread} unread. Updates about your ${isOfficer ? "assigned work" : "family, applications and benefits"}.` : "You are up to date."}
        action={
          <Button variant="outline" size="sm" icon="check" onClick={markAll} loading={busy} disabled={unread === 0}>
            Mark all as read
          </Button>
        }
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Card eyebrow="INBOX" title="Recent" subnote={`${items.length} in total`}>
        {loading && !data ? (
          <Skeleton rows={5} />
        ) : items.length === 0 ? (
          <EmptyState icon="bell" title="No notifications yet" description="Updates will appear here as your records change." />
        ) : (
          <ul>
            {items.map((n) => {
              const read = isRead(n);
              const kind = n.notification_type ?? n.type;
              return (
                <li
                  key={idOf(n)}
                  className={`fid-notif${read ? " fid-notif--read" : ""}`}
                  onClick={() => void markRead(n)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void markRead(n);
                  }}
                  aria-label={`${read ? "Read" : "Unread"}: ${n.title ?? titleCase(kind)}`}
                >
                  <span className={`fid-notif__dot${read ? " fid-notif__dot--read" : ""}`} aria-hidden="true" />
                  <div className="grow">
                    <div className="fid-notif__title">{n.title ?? titleCase(kind) ?? "Notification"}</div>
                    {n.message ?? n.body ? <div className="fid-notif__body">{n.message ?? n.body}</div> : null}
                    <div className="fid-notif__meta">
                      {kind ? <Tag tone={read ? "neutral" : "blue"}>{titleCase(kind)}</Tag> : null}
                      <span className="caption mono">{relativeTime(n.created_at)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

export default NotificationsPage;
