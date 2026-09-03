"use client";

import { useEffect, useState } from "react";

type Payout = {
  id: string;
  amount: string;
  status: string;
  requestedAt: string;
  processedAt: string | null;
  adminNote: string | null;
  vendor: { storeName: string };
};

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/payouts")
      .then((r) => r.json())
      .then(setPayouts)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function act(id: string, action: "approve" | "reject" | "complete") {
    const res = await fetch(`/api/payouts/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Could not update payout.");
      return;
    }
    load();
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (payouts.length === 0) return <p className="text-gray-500">No payout requests.</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-4">Payout Requests</h1>
      <div className="card divide-y">
        {payouts.map((p) => (
          <div key={p.id} className="p-4">
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium break-words">
                  {p.vendor.storeName} — {p.amount}
                </p>
                <p className="text-xs text-gray-500">
                  Requested {new Date(p.requestedAt).toLocaleString()}
                  {p.adminNote && ` · ${p.adminNote}`}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 h-fit flex-shrink-0">{p.status}</span>
            </div>
            <div className="flex gap-2 mt-2">
              {p.status === "REQUESTED" && (
                <>
                  <button className="btn-primary" onClick={() => act(p.id, "approve")}>
                    Approve
                  </button>
                  <button
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => act(p.id, "reject")}
                  >
                    Reject
                  </button>
                </>
              )}
              {p.status === "APPROVED" && (
                <button className="btn-primary" onClick={() => act(p.id, "complete")}>
                  Mark completed (sends payment)
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
