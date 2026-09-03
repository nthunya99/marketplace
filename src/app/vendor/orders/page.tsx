"use client";

import { useEffect, useState } from "react";

type VendorOrder = {
  id: string;
  status: string;
  subtotal: string;
  vendorEarnings: string;
  trackingNumber: string | null;
  order: { orderNumber: string; createdAt: string; customer: { name: string } };
  items: { productNameSnapshot: string; quantity: number; lineTotal: string }[];
};

const NEXT_STATUS: Record<string, string | null> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PROCESSING",
  PROCESSING: "SHIPPED",
  SHIPPED: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
};

export default function VendorOrdersPage() {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    fetch("/api/orders")
      .then((r) => r.json())
      .then(setOrders)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function advance(o: VendorOrder) {
    const next = NEXT_STATUS[o.status];
    if (!next) return;
    const res = await fetch(`/api/vendor-orders/${o.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: next,
        trackingNumber: tracking[o.id] || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Could not update order.");
      return;
    }
    load();
  }

  if (loading) return <p className="text-gray-500">Loading orders…</p>;
  if (orders.length === 0) return <p className="text-gray-500">No orders yet.</p>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">My Orders</h1>
      <div className="space-y-4">
        {orders.map((o) => (
          <div key={o.id} className="card p-4">
            <div className="flex justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{o.order.orderNumber}</p>
                <p className="text-xs text-gray-500">
                  {o.order.customer.name} · {new Date(o.order.createdAt).toLocaleString()}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 h-fit flex-shrink-0">{o.status}</span>
            </div>

            {o.items.map((item, i) => (
              <div key={i} className="flex flex-wrap justify-between gap-x-3 text-sm py-1">
                <span className="min-w-0 break-words">
                  {item.productNameSnapshot} × {item.quantity}
                </span>
                <span className="flex-shrink-0">{item.lineTotal}</span>
              </div>
            ))}

            <div className="flex justify-between text-sm font-medium border-t mt-2 pt-2">
              <span>Your earnings (after commission)</span>
              <span>{o.vendorEarnings}</span>
            </div>

            {NEXT_STATUS[o.status] && (
              <div className="flex flex-wrap gap-2 mt-3">
                {NEXT_STATUS[o.status] === "SHIPPED" && (
                  <input
                    className="input"
                    placeholder="Tracking number"
                    value={tracking[o.id] ?? ""}
                    onChange={(e) => setTracking({ ...tracking, [o.id]: e.target.value })}
                  />
                )}
                <button className="btn-primary whitespace-nowrap" onClick={() => advance(o)}>
                  Mark as {NEXT_STATUS[o.status]}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
