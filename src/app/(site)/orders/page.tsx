"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Order = {
  id: string;
  orderNumber: string;
  grandTotal: string;
  status: string;
  createdAt: string;
  vendorOrders: { vendor: { storeName: string }; status: string }[];
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then(setOrders)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-ink-muted">Loading orders…</p>;
  if (orders.length === 0) return <p className="text-ink-muted">You have no orders yet.</p>;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-ink">My Orders</h1>
      {orders.map((o) => (
        <Link href={`/orders/${o.id}`} key={o.id} className="card p-4 block hover:border-brand">
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{o.orderNumber}</p>
              <p className="text-xs text-ink-muted">{new Date(o.createdAt).toLocaleString()}</p>
              <p className="text-xs text-ink-muted mt-1 truncate">
                {o.vendorOrders.map((vo) => vo.vendor.storeName).join(", ")}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-semibold">{o.grandTotal}</p>
              <span className="text-xs px-2 py-0.5 rounded bg-ink/[0.06]">{o.status}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
