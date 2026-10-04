"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNotificationCount } from "@/components/NotificationCountProvider";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

/**
 * Opening this page counts as reading everything: the list is loaded
 * first (so items that were unread keep their "new" highlight for this
 * visit), then all notifications are marked read and the header badge
 * drops to zero straight away.
 */
export default function NotificationsPage() {
  const { clearUnread } = useNotificationCount();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const markedRef = useRef(false); // guards against React strict-mode double effects

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notifications");
        const d = await res.json();
        if (cancelled) return;
        setNotifications(d.notifications ?? []);

        if ((d.unreadCount ?? 0) > 0 && !markedRef.current) {
          markedRef.current = true;
          clearUnread();
          await fetch("/api/notifications/read-all", { method: "POST" });
        } else {
          clearUnread();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearUnread]);

  if (loading) return <p className="text-ink-muted">Loading…</p>;

  const newCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <h1 className="font-display text-2xl text-ink">Notifications</h1>
        {newCount > 0 && (
          <p className="text-sm text-ink-muted">
            {newCount} new since your last visit — highlighted below.
          </p>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="text-ink-muted">No notifications yet.</p>
      ) : (
        <div className="card divide-y">
          {notifications.map((n) => {
            const content = (
              <div className={`p-4 flex justify-between gap-4 ${!n.isRead ? "bg-brand-light" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-sm text-ink-muted">{n.message}</p>
                  <p className="text-xs text-ink-faint mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-brand h-fit mt-1 flex-shrink-0" aria-label="New" />}
              </div>
            );
            return n.linkUrl ? (
              <Link href={n.linkUrl} key={n.id} className="block hover:bg-ink/5">
                {content}
              </Link>
            ) : (
              <div key={n.id}>{content}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
