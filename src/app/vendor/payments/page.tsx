"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MopaySettings = {
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  verifiedAt: string | null;
  secretsConfigured: boolean;
};

type MpesaSummary = { enabled: boolean; environment: string };

type ModeSummary = {
  paymentMode: "MANUAL" | "ONLINE";
  activeMethods: string[];
  manualReady: boolean;
  hasManualDetails: boolean;
  onlineReady: boolean;
};

const MODE_OPTIONS: { value: ModeSummary["paymentMode"]; title: string; description: string }[] = [
  {
    value: "MANUAL",
    title: "Pay offline & upload proof (default)",
    description:
      "Customers pay to your M-Pesa / EcoCash number (personal or merchant) or bank account and upload proof. You confirm it on the Orders page.",
  },
  {
    value: "ONLINE",
    title: "Online payments with your merchant account",
    description:
      "For merchant accounts with API access. Customers pay through your direct M-Pesa connection (merchant short code + API keys) or MoPay below, and orders confirm themselves once paid.",
  },
];

const METHOD_NAMES: Record<string, string> = {
  manual: "bank transfer / mobile money with proof of payment",
  mopay: "M-Pesa, EcoCash or card via MoPay",
  mpesa: "M-Pesa (direct)",
};

export default function VendorPaymentsPage() {
  const [mopay, setMopay] = useState<MopaySettings | null>(null);
  const [mpesa, setMpesa] = useState<MpesaSummary | null>(null);
  const [mode, setMode] = useState<ModeSummary | null>(null);
  const [modeChoice, setModeChoice] = useState<ModeSummary["paymentMode"] | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"on" | "off" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/vendor/mopay").then((r) => r.json()).then(setMopay);
    fetch("/api/vendor/mpesa").then((r) => r.json()).then(setMpesa);
    loadMode();
  }, []);

  function loadMode() {
    fetch("/api/vendor/payment-mode")
      .then((r) => r.json())
      .then((d: ModeSummary) => {
        setMode(d);
        setModeChoice(d.paymentMode);
      });
  }

  async function saveMode() {
    if (!modeChoice) return;
    setModeError(null);
    setModeNotice(null);
    setModeBusy(true);
    const res = await fetch("/api/vendor/payment-mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMode: modeChoice }),
    });
    const data = await res.json().catch(() => ({}));
    setModeBusy(false);
    if (!res.ok) {
      setModeError(data.error ?? "Couldn't save.");
      return;
    }
    setMode(data);
    setModeChoice(data.paymentMode);
    setModeNotice("Saved. New orders will offer customers the updated options.");
  }

  async function save(enabled: boolean) {
    setError(null);
    setNotice(null);
    setBusy(enabled ? "on" : "off");
    const res = await fetch("/api/vendor/mopay", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: apiKey.trim() || undefined, enabled }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      const fieldMsg = data.details?.fieldErrors && Object.values(data.details.fieldErrors).flat()[0];
      setError((fieldMsg as string) ?? data.error ?? "Couldn't save.");
      return;
    }
    setMopay(data);
    setApiKey("");
    loadMode();
    setNotice(enabled ? "Connected and tested." : "Saved. MoPay is off for your store.");
  }

  async function disconnect() {
    if (!confirm("Disconnect MoPay and delete your saved API key?")) return;
    setBusy("disconnect");
    const res = await fetch("/api/vendor/mopay", { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      setMopay(data);
      setNotice("Disconnected and API key deleted.");
      loadMode();
    }
  }

  if (!mopay) return <p className="text-ink-muted">Loading…</p>;
  const canSave = !!apiKey.trim() || mopay.hasApiKey;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Payments</h1>
        <p className="text-sm text-ink-muted max-w-prose">
          Choose how customers pay you. They pick from your options after placing their order. Money goes straight to
          your own account; Mmarakeng's commission on these sales is recorded on your Wallet page.
        </p>
      </div>

      {mode && (
        <section className="card p-5 sm:p-6 mb-5">
          <h2 className="font-display text-lg text-ink">How customers pay you</h2>
          {mode.activeMethods.length > 0 ? (
            <p className="text-sm text-ink-muted mt-0.5">
              Customers can currently pay you by {mode.activeMethods.map((m) => METHOD_NAMES[m] ?? m).join(" or ")}.
            </p>
          ) : (
            <div className="rounded-lg border border-sale/30 bg-sale-light px-4 py-3 text-sm text-sale-dark mt-3">
              {mode.paymentMode === "ONLINE"
                ? "Customers can't pay you yet. Connect MoPay or direct M-Pesa below and turn it on — until then, your products can't be ordered."
                : "Customers can't pay you yet. Add your bank or mobile money details and turn on bank transfer / mobile money under Store settings."}
            </div>
          )}

          <div className="space-y-2 mt-4" role="radiogroup" aria-label="Payment mode">
            {MODE_OPTIONS.map((opt) => {
              const selected = modeChoice === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    selected ? "border-brand bg-brand-light/60" : "border-ink/15 hover:border-brand/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMode"
                    className="mt-1"
                    checked={selected}
                    onChange={() => setModeChoice(opt.value)}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                      {opt.title}
                      {mode.paymentMode === opt.value && <span className="badge-brand">Current</span>}
                    </span>
                    <span className="block text-xs text-ink-muted mt-0.5 leading-relaxed">{opt.description}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {modeChoice === "MANUAL" && mode.paymentMode !== "MANUAL" && !mode.hasManualDetails && (
            <p className="text-xs text-ink-muted mt-3">
              First add a bank account or mobile money number under{" "}
              <Link href="/vendor/payment-details" className="text-brand underline">
                Store settings
              </Link>
              .
            </p>
          )}
          {modeChoice === "ONLINE" && mode.paymentMode !== "ONLINE" && !mode.onlineReady && (
            <p className="text-xs text-ink-muted mt-3">First connect and turn on MoPay or direct M-Pesa below.</p>
          )}
          {mode.paymentMode === "MANUAL" && (
            <p className="text-xs text-ink-muted mt-3">
              Edit where customers pay you under{" "}
              <Link href="/vendor/payment-details" className="text-brand underline">
                Store settings
              </Link>
              .
            </p>
          )}

          {modeError && (
            <div className="rounded-lg border border-sale/30 bg-sale-light px-4 py-3 text-sm text-sale-dark mt-4">{modeError}</div>
          )}
          {modeNotice && (
            <div className="rounded-lg border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand-dark mt-4">
              {modeNotice}
            </div>
          )}

          <div className="flex justify-end mt-4">
            <button
              className="btn-primary sm:min-w-[200px]"
              onClick={saveMode}
              disabled={modeBusy || modeChoice === mode.paymentMode}
            >
              {modeBusy ? "Saving…" : "Save payment option"}
            </button>
          </div>
        </section>
      )}

      <h2 className="font-display text-lg text-ink mb-1">Merchant account connections</h2>
      <p className="text-sm text-ink-muted mb-4 max-w-prose">
        Used when your store is set to online payments. You can connect and test these before switching.
      </p>

      <section className="card p-5 sm:p-6 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-ink">M-Pesa, EcoCash & cards — via MoPay</h2>
            <p className="text-sm text-ink-muted mt-0.5 max-w-prose">
              Recommended. One MoPay account accepts M-Pesa, EcoCash, Visa and Mastercard. You can sign up and test for
              free straight away; going live costs a one-time onboarding fee plus transaction fees charged by MoPay.
            </p>
          </div>
          <span className={mopay.enabled ? "badge-brand" : "badge-neutral"}>{mopay.enabled ? "On" : "Off"}</span>
        </div>

        <ol className="text-sm text-ink-muted mt-4 space-y-1.5 list-decimal pl-5 max-w-prose">
          <li>
            Create an account at{" "}
            <a className="text-brand underline" href="https://mopay.co.ls/register" target="_blank" rel="noreferrer">
              mopay.co.ls
            </a>{" "}
            and create a project.
          </li>
          <li>Copy the project's API key from its settings and paste it below.</li>
          <li>
            New projects are in sandbox (test) mode: no real money moves, and MoPay's test numbers simulate payments (e.g.
            M-Pesa 52211111 or EcoCash 63211111 always succeed). Request production access in your MoPay dashboard when
            you're ready for real payments — no change is needed here.
          </li>
        </ol>

        {!mopay.secretsConfigured && (
          <div className="rounded-lg border border-accent/30 bg-accent-light px-4 py-3 text-sm text-accent-dark mt-4">
            Online payments aren't available yet — Mmarakeng still needs to be configured to store payment keys
            securely.
          </div>
        )}

        <div className="mt-4">
          <label htmlFor="mopayKey" className="block text-sm font-medium text-ink mb-1">
            MoPay project API key
          </label>
          <input
            id="mopayKey"
            className="input font-mono text-sm"
            type="password"
            autoComplete="off"
            placeholder={mopay.hasApiKey ? "Leave blank to keep the saved key" : "Paste your API key"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-ink-muted mt-1 leading-relaxed">
            {mopay.hasApiKey
              ? `A key is saved (${mopay.apiKeyMasked}). Paste a new one only to replace it. `
              : ""}
            Stored encrypted and never shown again. Turning payments on runs a quick test: an unpaid M1.00 test session will
            appear in your MoPay dashboard and expire on its own.
          </p>
        </div>

        {mopay.verifiedAt && (
          <p className="text-xs text-ink-faint mt-2">Connection last confirmed {new Date(mopay.verifiedAt).toLocaleString()}.</p>
        )}
        {error && <div className="rounded-lg border border-sale/30 bg-sale-light px-4 py-3 text-sm text-sale-dark mt-4">{error}</div>}
        {notice && <div className="rounded-lg border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand-dark mt-4">{notice}</div>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
          {mopay.hasApiKey && (
            <button className="btn-secondary text-sale" onClick={disconnect} disabled={busy !== null}>
              Disconnect
            </button>
          )}
          {mopay.enabled && (
            <button className="btn-secondary" onClick={() => save(false)} disabled={busy !== null}>
              Turn off
            </button>
          )}
          <button
            className="btn-primary sm:min-w-[200px]"
            onClick={() => save(true)}
            disabled={busy !== null || !canSave || !mopay.secretsConfigured}
          >
            {busy === "on" ? "Testing connection…" : mopay.enabled ? "Save" : "Test & turn on"}
          </button>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-ink">Direct M-Pesa connection (advanced)</h2>
            <p className="text-sm text-ink-muted mt-0.5 max-w-prose">
              For stores with their own Vodacom M-Pesa business account and an approved M-Pesa Open API application. No
              gateway fees, but M-Pesa only, and setup goes through Vodacom.
            </p>
          </div>
          {mpesa && <span className={mpesa.enabled ? "badge-brand" : "badge-neutral"}>{mpesa.enabled ? "On" : "Off"}</span>}
        </div>
        <Link href="/vendor/payments/mpesa" className="btn-secondary mt-4">
          Set up direct M-Pesa
        </Link>
      </section>
    </div>
  );
}
