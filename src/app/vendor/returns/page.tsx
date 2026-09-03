"use client";

import { useEffect, useState } from "react";

type ReturnRequest = {
  id: string;
  reason: string;
  description: string | null;
  status: string;
  refundAmount: string | null;
  adminResponse: string | null;
  createdAt: string;
  orderItem: { productNameSnapshot: string; lineTotal: string };
  customer: { name: string };
};

const NEXT_OPTIONS: Record<string, string[]> = {
  REQUESTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["RETURN_IN_PROGRESS", "REFUND_PROCESSING"],
  RETURN_IN_PROGRESS: ["RETURNED"],
  RETURNED: ["REFUND_PROCESSING"],
  REFUND_PROCESSING: ["REFUNDED"],
  REJECTED: [],
  REFUNDED: [],
};

export default function VendorReturnsPage() {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refundAmounts, setRefundAmounts] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    fetch("/api/returns")
      .then((r) => r.json())
      .then(setReturns)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function updateStatus(r: ReturnRequest, status: string) {
    const body: any = { status };
    if (status === "REFUNDED") {
      body.refundAmount = refundAmounts[r.id] ? Number(refundAmounts[r.id]) : Number(r.orderItem.lineTotal);
    }
    const res = await fetch(`/api/returns/${r.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Could not update return.");
      return;
    }
    load();
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (returns.length === 0) return <p className="text-gray-500">No return requests.</p>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Returns & Refunds</h1>
      <div className="space-y-4">
        {returns.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.orderItem.productNameSnapshot}</p>
                <p className="text-xs text-gray-500">
                  {r.customer.name} · {new Date(r.createdAt).toLocaleString()}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 h-fit flex-shrink-0">{r.status}</span>
            </div>
            <p className="text-sm">
              <span className="font-medium">Reason:</span> {r.reason}
            </p>
            {r.description && <p className="text-sm text-gray-600 mt-1">{r.description}</p>}
            <p className="text-sm text-gray-500 mt-1">Item total: {r.orderItem.lineTotal}</p>

            {NEXT_OPTIONS[r.status]?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 items-center">
                {NEXT_OPTIONS[r.status].includes("REFUNDED") && (
                  <input
                    className="input w-32"
                    type="number"
                    step="0.01"
                    placeholder={r.orderItem.lineTotal}
                    value={refundAmounts[r.id] ?? ""}
                    onChange={(e) => setRefundAmounts({ ...refundAmounts, [r.id]: e.target.value })}
                  />
                )}
                {NEXT_OPTIONS[r.status].map((status) => (
                  <button
                    key={status}
                    className={status === "REJECTED" ? "text-sm text-red-600 hover:underline" : "btn-primary"}
                    onClick={() => updateStatus(r, status)}
                  >
                    {status === "REJECTED" ? "Reject" : `Mark ${status.replace(/_/g, " ").toLowerCase()}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
