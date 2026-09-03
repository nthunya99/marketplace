"use client";

import { useEffect, useState } from "react";

type Dashboard = {
  wallet: { pendingBalance: string; availableBalance: string; totalEarnings: string; totalCommission: string; totalWithdrawn: string } | null;
};

type Payout = {
  id: string;
  amount: string;
  status: string;
  requestedAt: string;
  processedAt: string | null;
  adminNote: string | null;
};

export default function VendorWalletPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    fetch("/api/vendor/dashboard")
      .then((r) => r.json())
      .then(setDashboard);
    fetch("/api/payouts")
      .then((r) => r.json())
      .then(setPayouts);
  }

  useEffect(load, []);

  async function requestPayout(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount) }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Could not request payout.");
      return;
    }
    setAmount("");
    load();
  }

  if (!dashboard) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-4">Wallet & Payouts</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Stat label="Available balance" value={dashboard.wallet?.availableBalance ?? "0.00"} />
        <Stat label="Pending balance" value={dashboard.wallet?.pendingBalance ?? "0.00"} />
        <Stat label="Total earnings" value={dashboard.wallet?.totalEarnings ?? "0.00"} />
        <Stat label="Total commission paid" value={dashboard.wallet?.totalCommission ?? "0.00"} />
        <Stat label="Total withdrawn" value={dashboard.wallet?.totalWithdrawn ?? "0.00"} />
      </div>

      <form onSubmit={requestPayout} className="card p-4 mb-6 flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Request a withdrawal</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <button className="btn-primary" disabled={submitting}>
          {submitting ? "Requesting…" : "Request payout"}
        </button>
      </form>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <h2 className="font-semibold mb-2">Payout history</h2>
      {payouts.length === 0 ? (
        <p className="text-gray-500 text-sm">No payout requests yet.</p>
      ) : (
        <div className="card divide-y">
          {payouts.map((p) => (
            <div key={p.id} className="flex justify-between items-center p-3 text-sm">
              <div>
                <p className="font-medium">{p.amount}</p>
                <p className="text-xs text-gray-500">
                  Requested {new Date(p.requestedAt).toLocaleString()}
                  {p.adminNote && ` · ${p.adminNote}`}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{p.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
