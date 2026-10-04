"use client";

import { useState } from "react";

export type CustomerPaymentMethod = "manual" | "mpesa" | "mopay";

const METHOD_INFO: Record<CustomerPaymentMethod, { title: string; description: string }> = {
  mopay: {
    title: "M-Pesa, EcoCash or card",
    description: "Pay online on a secure MoPay page. Your order is confirmed as soon as the payment goes through.",
  },
  mpesa: {
    title: "M-Pesa — approve on your phone",
    description: "Enter your M-Pesa number and approve the prompt with your PIN. Confirmed instantly.",
  },
  manual: {
    title: "Bank transfer / mobile money",
    description:
      "Pay the seller directly using their bank or M-Pesa / EcoCash details, then upload proof of payment for them to confirm.",
  },
};

export function paymentMethodLabel(method: string) {
  return METHOD_INFO[method as CustomerPaymentMethod]?.title ?? null;
}

/**
 * "Choose how to pay" for one vendor order, shown on the order page after
 * checkout. Lists only the methods this seller offers; saving the choice
 * swaps this picker for the matching payment panel.
 */
export default function PaymentMethodPicker({
  vendorOrderId,
  vendorName,
  amount,
  methods,
  current,
  onChosen,
  onCancel,
}: {
  vendorOrderId: string;
  vendorName: string;
  amount: string;
  methods: CustomerPaymentMethod[];
  /** The method already chosen, when the customer is switching. */
  current?: string;
  onChosen: () => void;
  onCancel?: () => void;
}) {
  const [selected, setSelected] = useState<CustomerPaymentMethod | null>(
    methods.includes(current as CustomerPaymentMethod)
      ? (current as CustomerPaymentMethod)
      : methods.length === 1
      ? methods[0]
      : null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/vendor-orders/${vendorOrderId}/payment-method`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: selected }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't save your choice. Please try again.");
      return;
    }
    onChosen();
  }

  if (methods.length === 0) {
    return (
      <div className="mt-3 border-t pt-3">
        <p className="text-sm font-medium mb-1">Pay {vendorName}</p>
        <p className="text-xs text-ink-muted">
          {vendorName} isn't taking payments at the moment. Please try again later — your items are reserved on this
          order in the meantime.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t pt-3">
      <p className="text-sm font-medium">Choose how to pay {vendorName}</p>
      <p className="text-xs text-ink-muted mb-3">Amount due: {amount}</p>

      <div className="space-y-2" role="radiogroup" aria-label={`Payment method for ${vendorName}`}>
        {methods.map((m) => {
          const info = METHOD_INFO[m];
          const isSelected = selected === m;
          return (
            <label
              key={m}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                isSelected ? "border-brand bg-brand-light/60" : "border-ink/15 hover:border-brand/40"
              }`}
            >
              <input
                type="radio"
                name={`pay-${vendorOrderId}`}
                className="mt-1"
                checked={isSelected}
                onChange={() => setSelected(m)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{info.title}</span>
                <span className="block text-xs text-ink-muted mt-0.5 leading-relaxed">{info.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-3">
        {onCancel && (
          <button className="btn-secondary" onClick={onCancel} disabled={saving}>
            Keep current method
          </button>
        )}
        <button className="btn-primary sm:min-w-[180px]" onClick={confirm} disabled={!selected || saving}>
          {saving ? "Saving…" : "Continue to payment"}
        </button>
      </div>
    </div>
  );
}
