"use client";

import { useEffect, useState } from "react";

type FraudFlag = {
  id: string;
  score: number;
  reasons: string[];
  order: {
    orderNumber: string;
    grandTotal: string;
    createdAt: string;
    customer: { name: string; email: string };
  };
};

export default function AdminFraudPage() {
  const [flags, setFlags] = useState<FraudFlag[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/admin/fraud")
      .then((r) => r.json())
      .then(setFlags)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function decide(id: string, status: "CLEARED" | "CONFIRMED_FRAUD") {
    await fetch(`/api/admin/fraud/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-2">Fraud Review Queue</h1>
      <p className="text-sm text-gray-500 mb-4">
        Orders flagged by rule-based heuristics. Nothing here was blocked automatically — every
        order below was already paid and confirmed.
      </p>

      {flags.length === 0 ? (
        <p className="text-gray-500">No open fraud flags.</p>
      ) : (
        <div className="card divide-y">
          {flags.map((f) => (
            <div key={f.id} className="p-4">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{f.order.orderNumber}</p>
                  <p className="text-xs text-gray-500">
                    {f.order.customer.name} ({f.order.customer.email}) · {f.order.grandTotal} ·{" "}
                    {new Date(f.order.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 h-fit flex-shrink-0">
                  Score {f.score}
                </span>
              </div>
              <ul className="text-sm text-gray-600 list-disc ml-5 mt-2">
                {f.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <div className="flex gap-2 mt-3">
                <button className="btn-primary" onClick={() => decide(f.id, "CLEARED")}>
                  Clear (looks fine)
                </button>
                <button
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => decide(f.id, "CONFIRMED_FRAUD")}
                >
                  Confirm fraud
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
