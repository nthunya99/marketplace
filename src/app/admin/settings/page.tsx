"use client";

import { useEffect, useState } from "react";

type Settings = {
  defaultCommission: string;
  autoPayoutEnabled: boolean;
  autoPayoutThreshold: string;
  fraudReviewThreshold: number;
};

type CurrencyRate = { id: string; currencyCode: string; rateToBase: string };

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [baseCurrency, setBaseCurrency] = useState("LSL");
  const [newRate, setNewRate] = useState({ currencyCode: "", rateToBase: "" });

  const [autoPayoutRunning, setAutoPayoutRunning] = useState(false);
  const [autoPayoutResult, setAutoPayoutResult] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then(setSettings);
    fetch("/api/currency-rates")
      .then((r) => r.json())
      .then((d) => {
        setRates(d.rates ?? []);
        setBaseCurrency(d.baseCurrency ?? "LSL");
      });
  }

  useEffect(load, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultCommission: Number(settings.defaultCommission),
        autoPayoutEnabled: settings.autoPayoutEnabled,
        autoPayoutThreshold: Number(settings.autoPayoutThreshold),
        fraudReviewThreshold: settings.fraudReviewThreshold,
      }),
    });
    setSaving(false);
    setMessage(res.ok ? "Saved." : "Could not save settings.");
    load();
  }

  async function addRate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/currency-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currencyCode: newRate.currencyCode.toUpperCase(),
        rateToBase: Number(newRate.rateToBase),
      }),
    });
    if (res.ok) {
      setNewRate({ currencyCode: "", rateToBase: "" });
      load();
    }
  }

  async function runAutoPayoutsNow() {
    setAutoPayoutRunning(true);
    setAutoPayoutResult(null);
    const res = await fetch("/api/admin/payouts/auto-run", { method: "POST" });
    const data = await res.json();
    setAutoPayoutRunning(false);
    setAutoPayoutResult(
      data.ran
        ? `Ran: ${data.payoutsCreated} payout(s) created.`
        : data.reason ?? "Did not run."
    );
  }

  if (!settings) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-4">Platform Settings</h1>

      <form onSubmit={save} className="card p-4 mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Default commission (%)</label>
          <input
            className="input"
            type="number"
            step="0.1"
            value={settings.defaultCommission}
            onChange={(e) => setSettings({ ...settings, defaultCommission: e.target.value })}
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={settings.autoPayoutEnabled}
              onChange={(e) => setSettings({ ...settings, autoPayoutEnabled: e.target.checked })}
            />
            Enable automated vendor payouts
          </label>
          <p className="text-xs text-gray-500 mt-1">
            Requires an external scheduler (cron) calling POST /api/admin/payouts/auto-run — see the
            README.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Auto-payout threshold</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={settings.autoPayoutThreshold}
            onChange={(e) => setSettings({ ...settings, autoPayoutThreshold: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Fraud review score threshold</label>
          <input
            className="input"
            type="number"
            value={settings.fraudReviewThreshold}
            onChange={(e) => setSettings({ ...settings, fraudReviewThreshold: Number(e.target.value) })}
          />
        </div>

        {message && <p className="text-sm text-gray-600">{message}</p>}
        <button className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>

      <div className="card p-4 mb-6">
        <p className="font-medium mb-2">Run automated payouts now</p>
        <button className="btn-secondary" onClick={runAutoPayoutsNow} disabled={autoPayoutRunning}>
          {autoPayoutRunning ? "Running…" : "Run now"}
        </button>
        {autoPayoutResult && <p className="text-sm text-gray-600 mt-2">{autoPayoutResult}</p>}
      </div>

      <div className="card p-4">
        <p className="font-medium mb-2">Currency rates (display only, base: {baseCurrency})</p>
        <form onSubmit={addRate} className="flex flex-wrap gap-2 mb-4">
          <input
            className="input w-24"
            placeholder="USD"
            maxLength={3}
            value={newRate.currencyCode}
            onChange={(e) => setNewRate({ ...newRate, currencyCode: e.target.value })}
            required
          />
          <input
            className="input"
            type="number"
            step="0.000001"
            placeholder={`Rate (1 ${baseCurrency} = ? units)`}
            value={newRate.rateToBase}
            onChange={(e) => setNewRate({ ...newRate, rateToBase: e.target.value })}
            required
          />
          <button className="btn-primary whitespace-nowrap">Add / update</button>
        </form>
        {rates.length === 0 ? (
          <p className="text-sm text-gray-500">No currency rates configured yet.</p>
        ) : (
          <div className="divide-y">
            {rates.map((r) => (
              <div key={r.id} className="flex justify-between text-sm py-2">
                <span>{r.currencyCode}</span>
                <span>
                  1 {baseCurrency} = {r.rateToBase} {r.currencyCode}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
