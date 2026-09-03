"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  body: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  senderId: string;
  sender: { name: string; role: string };
};

/**
 * Polls the thread every 4 seconds to approximate real-time delivery (see
 * the schema comment on the Conversation model for why this is polling
 * rather than a WebSocket subscription).
 */
export default function ConversationThread({
  conversationId,
  currentUserId,
}: {
  conversationId: string;
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function load() {
    fetch(`/api/conversations/${conversationId}/messages`)
      .then((r) => r.json())
      .then(setMessages);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setBody("");
    setSending(false);
    load();
  }

  return (
    <div className="card flex flex-col h-[70vh]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => {
          const isMine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                  isMine ? "bg-brand text-white" : "bg-gray-100"
                }`}
              >
                {!isMine && <p className="text-xs opacity-70 mb-0.5">{m.sender.name}</p>}
                {m.body && <p>{m.body}</p>}
                {m.attachmentUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.attachmentUrl} alt="attachment" className="mt-1 rounded max-w-full" />
                )}
                <p className={`text-[10px] mt-1 ${isMine ? "text-white/70" : "text-gray-400"}`}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="border-t p-3 flex gap-2">
        <input
          className="input"
          placeholder="Type a message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="btn-primary" disabled={sending}>
          Send
        </button>
      </form>
    </div>
  );
}
