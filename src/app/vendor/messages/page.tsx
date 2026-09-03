"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Conversation = {
  id: string;
  customer: { name: string };
  product: { name: string } | null;
  lastMessageAt: string;
  unreadCount: number;
  messages: { body: string | null; createdAt: string }[];
};

export default function VendorMessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then(setConversations)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-ink-muted">Loading…</p>;
  if (conversations.length === 0) return <p className="text-ink-muted">No conversations yet.</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl text-ink mb-4">Messages</h1>
      <div className="card divide-y">
        {conversations.map((c) => (
          <Link
            href={`/vendor/messages/${c.id}`}
            key={c.id}
            className="flex justify-between items-center gap-3 p-4 hover:bg-ink/5"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">
                {c.customer.name}
                {c.product && <span className="text-xs text-ink-faint"> · about {c.product.name}</span>}
              </p>
              <p className="text-sm text-ink-muted truncate">{c.messages[0]?.body ?? "No messages yet"}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-ink-faint">{new Date(c.lastMessageAt).toLocaleDateString()}</p>
              {c.unreadCount > 0 && (
                <span className="text-xs bg-brand text-white rounded-full px-2 py-0.5">{c.unreadCount}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
