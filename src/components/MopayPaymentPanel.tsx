"use client";

import { useState } from "react";

export type MopayPaymentRow = {
  id: string;
  status: "CREATED" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED" | "EXPIRED";
  selectedPaymentMethod: string | null;
  mopayTransactionId: string | null;
  failureReason: string | null;
  createdAt: string;
};

const LAST_ATTEMPT: Record<string, string> = {
  FAILED: "Your last payment attempt didn't go through.",
  CANCELLED: "You cancelled the last payment attempt.",
  EXPIRED: "The last payment page expired before it was completed.",
};

/**
 * Pay one vendor order through the seller's MoPay account. The customer
 * is sent to MoPay's secure checkout to pay with M-Pesa, EcoCash or card,
 * then brought back here; the order confirms itself once MoPay confirms.
 */
export default function MopayPaymentPanel({
  vendorOrderId,
  vendorName,
  amount,
  payments,
  onChanged,
}: {
  vendorOrderId: string;
  vendorName: string;
  amount: string;
  payments: MopayPaymentRow[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"pay" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = payments[0];
  const inProgress = latest?.status === "PROCESSING";

  async function pay() {
    setError(null);
    setBusy("pay");
    const res = await fetch(`/api/vendor-orders/${vendorOrderId}/mopay`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(null);
      setError(data.error ?? "Couldn't start the payment.");
      return;
    }
    if (data.status === "SUCCESS") {
      setBusy(null);
      onChanged();
      return;
    }
    window.location.href = data.paymentUrl; // leave busy on while navigating away
  }

  async function check() {
    setError(null);
    setBusy("check");
    const res = await fetch(`/api/vendor-orders/${vendorOrderId}/mopay/check`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setError(data.error ?? "Couldn't check the payment.");
    else onChanged();
  }

  return (
    <div className="mt-4 rounded-lg border border-brand/25 bg-brand-light/40 p-4">
      <p className="font-medium text-ink">
        Pay {vendorName} <span className="text-brand">M {amount}</span>
      </p>
      <p className="text-xs text-ink-muted mt-0.5 mb-3">
        You'll go to MoPay's secure payment page to pay with M-Pesa, EcoCash or a Visa/Mastercard card, then come back
        here. The money goes straight to the seller.
      </p>

      {latest && LAST_ATTEMPT[latest.status] && (
        <p className="text-sm text-sale-dark bg-sale-light rounded px-3 py-2 mb-3">{LAST_ATTEMPT[latest.status]}</p>
      )}
      {inProgress && (
        <p className="text-sm text-accent-dark bg-accent-light rounded px-3 py-2 mb-3">
          Your payment is still being processed. Check again in a moment — don't pay twice.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!inProgress && (
          <button className="btn-primary" onClick={pay} disabled={busy !== null}>
            {busy === "pay" ? "Opening payment page…" : latest?.status === "CREATED" ? "Continue payment" : "Pay now"}
          </button>
        )}
        {(inProgress || latest?.status === "CREATED") && (
          <button className="btn-secondary" onClick={check} disabled={busy !== null}>
            {busy === "check" ? "Checking…" : "Check payment"}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-sale mt-2">{error}</p>}
    </div>
  );
}
