"use client";

import { useEffect, useState } from "react";
import PayoutDetailsFields from "@/components/vendor/PayoutDetailsFields";

type PaymentDetails = {
  acceptsManualPayment: boolean;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  mpesaMerchantNumber: string | null;
  ecocashMerchantNumber: string | null;
  mobileMoneyAccountType: string;
};

type StoreSettings = {
  participatesInCoupons: boolean;
  participatesInLoyalty: boolean;
};

export default function VendorPaymentDetailsPage() {
  const [form, setForm] = useState<PaymentDetails | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [promoForm, setPromoForm] = useState<StoreSettings | null>(null);
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/vendor/payment-details")
      .then((r) => r.json())
      .then(setForm);
    fetch("/api/vendor/settings")
      .then((r) => r.json())
      .then(setPromoForm);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    const res = await fetch("/api/vendor/payment-details", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save payment details.");
      return;
    }
    setForm(data);
    setMessage("Saved.");
  }

  async function savePromoSettings(next: StoreSettings) {
    setPromoForm(next);
    setPromoSaving(true);
    setPromoMessage(null);
    const res = await fetch("/api/vendor/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const data = await res.json();
    setPromoSaving(false);
    if (res.ok) {
      setPromoForm(data);
      setPromoMessage("Saved.");
    }
  }

  if (!form) return <p className="text-ink-muted">Loading…</p>;

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl text-ink mb-2">Store Settings</h1>
      <p className="text-sm text-ink-muted mb-6">
        Manage how customers pay you and whether your store takes part in the platform's
        promotions.
      </p>

      {promoForm && (
        <div className="card p-4 space-y-4 mb-6">
          <p className="font-medium">Promotions</p>
          <label className="flex items-start gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={promoForm.participatesInCoupons}
              disabled={promoSaving}
              onChange={(e) => savePromoSettings({ ...promoForm, participatesInCoupons: e.target.checked })}
            />
            <span>
              Allow coupons on my products
              <span className="block text-xs text-ink-faint font-normal mt-0.5">
                Covers both coupons you create and platform-wide coupons. Turn this off and no
                coupon will discount your listings, even one a customer already has.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={promoForm.participatesInLoyalty}
              disabled={promoSaving}
              onChange={(e) => savePromoSettings({ ...promoForm, participatesInLoyalty: e.target.checked })}
            />
            <span>
              Earn customers loyalty points on my products
              <span className="block text-xs text-ink-faint font-normal mt-0.5">
                When on, purchases from your store add to the customer's points balance. This
                doesn't affect a customer redeeming points they've already earned elsewhere.
              </span>
            </span>
          </label>
          {promoMessage && <p className="text-sm text-brand-dark">{promoMessage}</p>}
        </div>
      )}

      <h2 className="font-display text-lg text-ink mb-2">Payment Details</h2>
      <p className="text-sm text-ink-muted mb-4">
        Where customers send payment when your store uses offline payments: your M-Pesa and/or
        EcoCash number (personal or merchant), and a bank account if you like. Customers see these on
        their order page, pay you directly, then upload proof of payment for you to confirm on the
        Orders page. To take payments online through a merchant API instead, go to Payments.
      </p>

      <form onSubmit={save} className="card p-4 space-y-4">
        <PayoutDetailsFields
          value={form}
          onChange={(next) => setForm({ ...form, ...next })}
          idPrefix="settings"
          showAccountTypeChoice
        />

        <label className="flex items-start gap-2 text-sm font-medium border-t border-ink/10 pt-4">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.acceptsManualPayment}
            onChange={(e) => setForm({ ...form, acceptsManualPayment: e.target.checked })}
          />
          <span>
            Accept bank transfer / mobile money
            <span className="block text-xs text-ink-faint font-normal mt-0.5">
              Requires a bank account, an M-Pesa number or an EcoCash number above.
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-dark">{message}</p>}
        <button className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save payment details"}
        </button>
      </form>
    </div>
  );
}
