"use client";

import { useEffect, useState } from "react";

type Settings = {
  enabled: boolean;
  environment: "sandbox" | "openapi";
  serviceProviderCode: string;
  publicKey: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  verifiedAt: string | null;
  secretsConfigured: boolean;
};

export default function VendorMpesaPage() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [form, setForm] = useState({ apiKey: "", publicKey: "", serviceProviderCode: "", environment: "sandbox" as Settings["environment"] });
  const [busy, setBusy] = useState<"save" | "test" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function apply(s: Settings) {
    setSaved(s);
    setForm({ apiKey: "", publicKey: s.publicKey, serviceProviderCode: s.serviceProviderCode, environment: s.environment });
  }

  useEffect(() => {
    fetch("/api/vendor/mpesa")
      .then((r) => r.json())
      .then(apply);
  }, []);

  async function save(enabled: boolean) {
    setError(null);
    setNotice(null);
    setBusy("save");
    const res = await fetch("/api/vendor/mpesa", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: form.apiKey.trim() || undefined,
        publicKey: form.publicKey,
        serviceProviderCode: form.serviceProviderCode,
        environment: form.environment,
        enabled,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      const fieldMsg = data.details?.fieldErrors && Object.values(data.details.fieldErrors).flat()[0];
      setError((fieldMsg as string) ?? data.error ?? "Couldn't save.");
      return;
    }
    apply(data);
    setNotice(
      enabled
        ? "Connected. Customers can now pay you with M-Pesa at checkout."
        : "Saved. M-Pesa is switched off for your store until you turn it on."
    );
  }

  async function test() {
    setError(null);
    setNotice(null);
    setBusy("test");
    const res = await fetch("/api/vendor/mpesa/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setError(data.error ?? "Connection test failed.");
    else {
      setNotice("Connection works.");
      setSaved((s) => (s ? { ...s, verifiedAt: data.verifiedAt } : s));
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect M-Pesa and delete your saved API key? Customers won't be able to pay you with M-Pesa.")) return;
    setBusy("disconnect");
    const res = await fetch("/api/vendor/mpesa", { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      apply(data);
      setNotice("Disconnected and credentials deleted.");
    }
  }

  if (!saved) return <p className="text-ink-muted">Loading…</p>;

  const canSave = form.publicKey.trim() && form.serviceProviderCode.trim() && (form.apiKey.trim() || saved.hasApiKey);

  return (
    <div className="max-w-3xl">
      <a href="/vendor/payments" className="text-sm text-brand hover:underline">
        ← Online payments
      </a>
      <div className="mb-6 mt-2">
        <h1 className="text-xl font-bold">Direct M-Pesa connection (advanced)</h1>
        <p className="text-sm text-ink-muted max-w-prose">
          Connect your own Vodacom M-Pesa business account so customers can pay you by approving a prompt on their phone.
          Payments go straight into your M-Pesa account.
        </p>
      </div>

      <div className="card p-4 sm:p-5 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-ink">
            Status:{" "}
            {saved.enabled ? (
              <span className="text-brand">
                On · {saved.environment === "openapi" ? "live" : "sandbox (test only)"}
              </span>
            ) : (
              <span className="text-ink-muted">Off</span>
            )}
          </p>
          <p className="text-xs text-ink-muted">
            {saved.verifiedAt
              ? `Last successful connection test: ${new Date(saved.verifiedAt).toLocaleString()}`
              : "Not tested yet."}
          </p>
        </div>
        {saved.hasApiKey && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={test} disabled={busy !== null}>
              {busy === "test" ? "Testing…" : "Test connection"}
            </button>
            <button className="btn-secondary text-sale" onClick={disconnect} disabled={busy !== null}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      {!saved.secretsConfigured && (
        <div className="rounded-lg border border-accent/30 bg-accent-light px-4 py-3 text-sm text-accent-dark mb-5">
          M-Pesa connections aren't available yet — Mmarakeng still needs to be configured to store payment keys
          securely. Please check back soon.
        </div>
      )}

      <section className="card p-5 sm:p-6 mb-5">
        <h2 className="font-display text-lg text-ink">Before you start</h2>
        <ol className="text-sm text-ink-muted mt-2 space-y-1.5 list-decimal pl-5 max-w-prose">
          <li>You need an M-Pesa business (organisation) account with a short code. Apply at a Vodacom shop if you don't have one.</li>
          <li>
            Sign up as an organisation on the{" "}
            <a className="text-brand underline" href="https://openapiportal.m-pesa.com" target="_blank" rel="noreferrer">
              M-Pesa Open API portal
            </a>{" "}
            and create an application for customer-to-business (C2B) payments, with reversal enabled for refunds.
          </li>
          <li>Copy the details below from that application. Test with sandbox first; switch to live once Vodacom approves your application.</li>
        </ol>
      </section>

      <section className="card p-5 sm:p-6 space-y-4">
        <Field
          label="API key"
          htmlFor="apiKey"
          help={
            saved.hasApiKey
              ? `A key is saved (${saved.apiKeyMasked}). Leave blank to keep it, or paste a new one to replace it. It's stored encrypted and never shown again.`
              : "Found under your application in the Open API portal. Each environment (sandbox and live) has its own key. It's stored encrypted and never shown again."
          }
        >
          <input
            id="apiKey"
            className="input font-mono text-sm"
            type="password"
            autoComplete="off"
            placeholder={saved.hasApiKey ? "Leave blank to keep the saved key" : "Paste your API key"}
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          />
        </Field>

        <Field
          label="Public key"
          htmlFor="publicKey"
          help="The Open API public key shown in the portal (a long block of letters and numbers). It's used to encrypt your API key before it's sent to Vodacom. Paste it exactly as shown."
        >
          <textarea
            id="publicKey"
            className="input font-mono text-xs"
            rows={5}
            value={form.publicKey}
            onChange={(e) => setForm({ ...form, publicKey: e.target.value })}
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="M-Pesa merchant number (short code)"
            htmlFor="spc"
            help="Your M-Pesa merchant (business) short code — the number customers' payments are sent to. Vodacom calls it the service provider code. The sandbox uses a test code given in the portal."
          >
            <input
              id="spc"
              className="input"
              inputMode="numeric"
              value={form.serviceProviderCode}
              onChange={(e) => setForm({ ...form, serviceProviderCode: e.target.value })}
            />
          </Field>

          <Field
            label="Environment"
            htmlFor="env"
            help="Sandbox moves no real money — use it to test. Choose Live only after Vodacom has approved your application to go live."
          >
            <select
              id="env"
              className="input"
              value={form.environment}
              onChange={(e) => setForm({ ...form, environment: e.target.value as Settings["environment"] })}
            >
              <option value="sandbox">Sandbox (testing)</option>
              <option value="openapi">Live</option>
            </select>
          </Field>
        </div>

        <div className="rounded-lg bg-ink/[0.04] px-4 py-3 text-xs text-ink-muted leading-relaxed">
          Because customers pay you directly, Mmarakeng's commission on M-Pesa sales isn't deducted at the time of
          sale. It's recorded as <strong className="text-ink">commission owed</strong> on your Wallet page. Refunds on
          M-Pesa orders are sent back to the customer from your M-Pesa account automatically.
        </div>

        {error && <div className="rounded-lg border border-sale/30 bg-sale-light px-4 py-3 text-sm text-sale-dark">{error}</div>}
        {notice && <div className="rounded-lg border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand-dark">{notice}</div>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {saved.enabled ? (
            <button className="btn-secondary" onClick={() => save(false)} disabled={busy !== null || !canSave}>
              Turn off M-Pesa
            </button>
          ) : (
            <button className="btn-secondary" onClick={() => save(false)} disabled={busy !== null || !canSave || !saved.secretsConfigured}>
              Save without turning on
            </button>
          )}
          <button className="btn-primary sm:min-w-[200px]" onClick={() => save(true)} disabled={busy !== null || !canSave || !saved.secretsConfigured}>
            {busy === "save" ? "Testing connection…" : saved.enabled ? "Save changes" : "Test & turn on"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, htmlFor, help, children }: { label: string; htmlFor: string; help: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink mb-1">
        {label}
      </label>
      {children}
      <p className="text-xs text-ink-muted mt-1 leading-relaxed">{help}</p>
    </div>
  );
}
