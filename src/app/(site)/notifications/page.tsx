"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    load();
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    load();
  }

  if (loading) return <p className="text-ink-muted">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h1 className="font-display text-2xl text-ink">Notifications</h1>
        <button className="btn-secondary" onClick={markAllRead}>
          Mark all as read
        </button>
      </div>

      {notifications.length === 0 ? (
        <p className="text-ink-muted">No notifications yet.</p>
      ) : (
        <div className="card divide-y">
          {notifications.map((n) => {
            const content = (
              <div
                className={`p-4 flex justify-between gap-4 ${!n.isRead ? "bg-brand-light" : ""}`}
                onClick={() => !n.isRead && markRead(n.id)}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-sm text-ink-muted">{n.message}</p>
                  <p className="text-xs text-ink-faint mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-brand h-fit mt-1 flex-shrink-0" />}
              </div>
            );
            return n.linkUrl ? (
              <Link href={n.linkUrl} key={n.id} className="block hover:bg-ink/5">
                {content}
              </Link>
            ) : (
              <div key={n.id} className="cursor-pointer">
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
