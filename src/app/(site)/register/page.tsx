"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Logo from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";
import PayoutDetailsFields from "@/components/vendor/PayoutDetailsFields";
import { payoutDetailsIssue, type PayoutDetails } from "@/lib/validators";

/**
 * The vendor's payment setup, from two questions:
 *   "Do you have a merchant account?"  No  → PERSONAL
 *                                      Yes → "Do you have API access?"
 *                                              No / not sure → MERCHANT_OFFLINE
 *                                              Yes           → MERCHANT_API
 * PERSONAL and MERCHANT_OFFLINE are offline payments (customer pays, then
 * uploads proof); MERCHANT_API is online payments through the vendor's own
 * merchant API, connected right after sign-up.
 */
type PaymentSetup = "PERSONAL" | "MERCHANT_OFFLINE" | "MERCHANT_API";

function ChoiceCard({
  name,
  selected,
  onSelect,
  title,
  description,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
        selected ? "border-brand bg-brand-light/60" : "border-ink/15 hover:border-brand/40"
      }`}
    >
      <input type="radio" name={name} className="mt-1" checked={selected} onChange={onSelect} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-muted mt-0.5 leading-relaxed">{description}</span>
      </span>
    </label>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<"CUSTOMER" | "VENDOR">("CUSTOMER");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    storeName: "",
    storeDescription: "",
  });
  const [hasMerchant, setHasMerchant] = useState<boolean | null>(null);
  const [hasApi, setHasApi] = useState<boolean | null>(null);
  const setup: PaymentSetup | null =
    hasMerchant === false ? "PERSONAL" : hasMerchant && hasApi !== null ? (hasApi ? "MERCHANT_API" : "MERCHANT_OFFLINE") : null;
  const paymentMode = setup === "MERCHANT_API" ? "ONLINE" : "MANUAL";
  const mobileMoneyAccountType = setup === "PERSONAL" ? "PERSONAL" : "MERCHANT";
  const [payout, setPayout] = useState<PayoutDetails>({
    bankName: "",
    bankAccountName: "",
    bankAccountNumber: "",
    mpesaMerchantNumber: "",
    ecocashMerchantNumber: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (role === "VENDOR" && !setup) {
      setError(
        hasMerchant ? "Tell us whether you have API access for your merchant account." : "Tell us whether you have a merchant account."
      );
      return;
    }
    if (role === "VENDOR" && paymentMode === "MANUAL") {
      const issue = payoutDetailsIssue({ ...payout, mobileMoneyAccountType });
      if (issue) {
        setError(issue);
        return;
      }
    }

    setLoading(true);
    const body =
      role === "VENDOR"
        ? {
            ...form,
            role,
            paymentMode,
            ...(paymentMode === "MANUAL" ? { ...payout, mobileMoneyAccountType } : {}),
          }
        : { name: form.name, email: form.email, password: form.password, role };

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      const fieldMsg = data.details?.fieldErrors && Object.values(data.details.fieldErrors).flat()[0];
      setError((fieldMsg as string) ?? data.error ?? "Registration failed.");
      return;
    }

    if (role === "VENDOR") {
      setNotice(data.message ?? "Vendor account created. Awaiting admin approval.");
      return;
    }

    const signInRes = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });
    if (!signInRes?.error) {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className={`${role === "VENDOR" ? "max-w-xl" : "max-w-md"} mx-auto`}>
      <div className="flex justify-center mb-5">
        <Link href="/" aria-label={`${BRAND.name} home`}>
          <Logo variant="stacked" size={64} />
        </Link>
      </div>
    <div className="card p-6">
      <h1 className="font-display text-2xl text-ink mb-4">
        {role === "VENDOR" ? `Start selling on ${BRAND.name}` : `Join ${BRAND.name}`}
      </h1>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          className={`flex-1 rounded px-3 py-2 text-sm ${role === "CUSTOMER" ? "bg-brand text-white" : "bg-ink/[0.06]"}`}
          onClick={() => setRole("CUSTOMER")}
        >
          Shop as a customer
        </button>
        <button
          type="button"
          className={`flex-1 rounded px-3 py-2 text-sm ${role === "VENDOR" ? "bg-brand text-white" : "bg-ink/[0.06]"}`}
          onClick={() => setRole("VENDOR")}
        >
          Sell as a vendor
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          className="input"
          placeholder="Full name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password (min 8 characters)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
          minLength={8}
        />

        {role === "VENDOR" && (
          <>
            <input
              className="input"
              placeholder="Store name"
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              required
            />
            <textarea
              className="input"
              placeholder="Store description (optional)"
              value={form.storeDescription}
              onChange={(e) => setForm({ ...form, storeDescription: e.target.value })}
            />

            <div className="pt-3 space-y-4">
              <div>
                <p className="text-sm font-medium text-ink">How customers will pay you</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Customers choose how to pay after placing their order, from the options your store offers. You can
                  change this later under Seller centre → Payments.
                </p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm text-ink mb-2">Do you have a merchant account for M-Pesa or EcoCash?</legend>
                <ChoiceCard
                  name="hasMerchant"
                  selected={hasMerchant === false}
                  onSelect={() => {
                    setHasMerchant(false);
                    setHasApi(null);
                  }}
                  title="No — I use my personal numbers"
                  description="Customers send money to your M-Pesa and/or EcoCash number, then upload proof of payment for you to confirm."
                />
                <ChoiceCard
                  name="hasMerchant"
                  selected={hasMerchant === true}
                  onSelect={() => setHasMerchant(true)}
                  title="Yes — I have a merchant number"
                  description="A business (till) number from Vodacom M-Pesa or EcoCash."
                />
              </fieldset>

              {hasMerchant && (
                <fieldset className="space-y-2">
                  <legend className="text-sm text-ink mb-2">Do you have API access for your merchant account?</legend>
                  <ChoiceCard
                    name="hasApi"
                    selected={hasApi === true}
                    onSelect={() => setHasApi(true)}
                    title="Yes — I have API credentials"
                    description="Customers pay instantly and orders confirm themselves. Works with a Vodacom M-Pesa Open API application (merchant short code, API key and public key) or a MoPay account (one API key for M-Pesa, EcoCash and cards)."
                  />
                  <ChoiceCard
                    name="hasApi"
                    selected={hasApi === false}
                    onSelect={() => setHasApi(false)}
                    title="No, or I'm not sure — just the merchant number"
                    description="Customers pay to your merchant number and upload proof of payment. You can connect an API later."
                  />
                </fieldset>
              )}
            </div>

            {(setup === "PERSONAL" || setup === "MERCHANT_OFFLINE") && (
              <div className="rounded-lg border border-ink/10 bg-ink/[0.02] p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-ink">Where customers pay you</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Shown to customers only on their order page, after they choose to pay you. Add M-Pesa, EcoCash or
                    both, and a bank account if you like — at least one is needed.
                  </p>
                </div>
                <PayoutDetailsFields
                  value={{ ...payout, mobileMoneyAccountType }}
                  onChange={({ mobileMoneyAccountType: _ignored, ...next }) => setPayout(next)}
                  idPrefix="register"
                />
              </div>
            )}

            {setup === "MERCHANT_API" && (
              <div className="rounded-lg border border-accent/30 bg-accent-light px-4 py-3 text-xs text-accent-dark leading-relaxed space-y-1.5">
                <p>
                  After signing up, log in and open <span className="font-medium">Seller centre → Payments</span> to enter
                  your credentials. They're tested live before being switched on, and stored encrypted.
                </p>
                <p>
                  <span className="font-medium">Direct M-Pesa:</span> your merchant short code plus the API key and
                  public key from Vodacom's M-Pesa Open API portal.{" "}
                  <span className="font-medium">MoPay:</span> the API key from your MoPay project — it covers M-Pesa,
                  EcoCash and cards.
                </p>
                <p>Customers can't pay your store until one of them is connected.</p>
              </div>
            )}
          </>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {notice && <p className="text-green-700 text-sm">{notice}</p>}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </div>
    </div>
  );
}
