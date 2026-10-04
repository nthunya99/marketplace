"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function SupportPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: `Hi! I'm the ${BRAND.name} support assistant. Ask me about your orders, returns, or how shopping on ${BRAND.name} works.` },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: input }];
    setMessages(next);
    setInput("");
    setSending(true);

    const res = await fetch("/api/ai/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: next.filter((m) => m.role === "user" || m.role === "assistant") }),
    });
    const data = await res.json();
    setSending(false);

    if (!res.ok) {
      setMessages([...next, { role: "assistant", content: data.error ?? "Something went wrong." }]);
      return;
    }
    if (data.configured === false) setNotConfigured(true);
    setMessages([...next, { role: "assistant", content: data.reply }]);
  }

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-2xl text-ink mb-2">Support</h1>
      <p className="text-sm text-ink-muted mb-4">
        AI-assisted support, grounded in your real order history — it won't invent order details it
        doesn't have.
      </p>
      {notConfigured && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
          AI support isn't fully configured on this deployment yet.
        </p>
      )}

      <div className="card flex flex-col h-[60vh]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-line ${
                  m.role === "user" ? "bg-brand text-white" : "bg-ink/[0.06]"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {sending && <p className="text-xs text-ink-faint">Thinking…</p>}
        </div>
        <form onSubmit={send} className="border-t p-3 flex gap-2">
          <input
            className="input"
            placeholder="Ask a question…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn-primary" disabled={sending}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
