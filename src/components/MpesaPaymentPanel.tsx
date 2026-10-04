"use client";

import { useState } from "react";

export type MpesaTxn = {
  id: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "REVERSED";
  responseDesc?: string | null;
  message?: string | null;
  mpesaTransactionId: string | null;
  createdAt: string;
};

/**
 * Pay one vendor order with M-Pesa. The customer enters their number,
 * gets a PIN prompt on their phone (sent through the seller's own M-Pesa
 * account), and the order confirms itself when they approve it.
 */
export default function MpesaPaymentPanel({
  vendorOrderId,
  vendorName,
  amount,
  initialTransactions,
  onPaid,
}: {
  vendorOrderId: string;
  vendorName: string;
  amount: string;
  initialTransactions: MpesaTxn[];
  onPaid: () => void;
}) {
  const [msisdn, setMsisdn] = useState("");
  const [busy, setBusy] = useState<"pay" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<MpesaTxn | null>(initialTransactions[0] ?? null);

  const waiting = latest?.status === "PENDING";

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("pay");
    try {
      const res = await fetch(`/api/vendor-orders/${vendorOrderId}/mpesa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msisdn }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't start the M-Pesa payment.");
        return;
      }
      setLatest(data);
      if (data.status === "SUCCESS") onPaid();
    } catch {
      setError("Lost connection while waiting for M-Pesa. Use “Check payment” before trying again.");
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setError(null);
    setBusy("check");
    try {
      const res = await fetch(`/api/vendor-orders/${vendorOrderId}/mpesa/check`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't check the payment.");
        return;
      }
      setLatest(data);
      if (data.status === "SUCCESS") onPaid();
    } finally {
      setBusy(null);
    }
  }

  const latestMessage = latest?.message ?? latest?.responseDesc;

  return (
    <div className="mt-4 rounded-lg border border-brand/25 bg-brand-light/40 p-4">
      <p className="font-medium text-ink">
        Pay {vendorName} <span className="text-brand">M {amount}</span> with M-Pesa
      </p>
      <p className="text-xs text-ink-muted mt-0.5 mb-3">
        We'll send a payment prompt to your phone. Enter your M-Pesa PIN there to approve it. The money goes straight to
        the seller.
      </p>

      {latest?.status === "FAILED" && latestMessage && (
        <p className="text-sm text-sale-dark bg-sale-light rounded px-3 py-2 mb-3">
          Last attempt didn't go through: {latestMessage}
        </p>
      )}

      {waiting ? (
        <div className="space-y-2">
          <p className="text-sm text-accent-dark bg-accent-light rounded px-3 py-2">
            Waiting for M-Pesa to confirm your payment. If you approved it on your phone, check again in a moment — don't pay
            twice.
          </p>
          <button type="button" className="btn-secondary" onClick={check} disabled={busy !== null}>
            {busy === "check" ? "Checking…" : "Check payment"}
          </button>
        </div>
      ) : (
        <form onSubmit={pay} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm pointer-events-none">+266</span>
            <input
              className="input pl-14"
              inputMode="tel"
              autoComplete="tel"
              placeholder="5812 3456"
              value={msisdn}
              onChange={(e) => setMsisdn(e.target.value)}
              disabled={busy !== null}
              aria-label="Your M-Pesa number"
            />
          </div>
          <button className="btn-primary sm:min-w-[160px]" disabled={busy !== null || msisdn.replace(/\D/g, "").length < 8}>
            {busy === "pay" ? "Approve on your phone…" : "Send payment prompt"}
          </button>
        </form>
      )}

      {busy === "pay" && (
        <p className="text-xs text-ink-muted mt-2">
          Check your phone now. This page will update once you approve or decline (up to about a minute).
        </p>
      )}
      {error && <p className="text-sm text-sale mt-2">{error}</p>}
    </div>
  );
}
