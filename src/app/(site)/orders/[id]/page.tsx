"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import TrackingWidget from "@/components/TrackingWidget";

type OrderDetail = {
  orderNumber: string;
  status: string;
  subtotal: string;
  grandTotal: string;
  createdAt: string;
  payment: { status: string; provider: string } | null;
  vendorOrders: {
    id: string;
    status: string;
    subtotal: string;
    shippingCost: string;
    trackingNumber: string | null;
    vendor: { storeName: string };
    items: { id: string; productNameSnapshot: string; quantity: number; lineTotal: string }[];
  }[];
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [returnForm, setReturnForm] = useState<{ orderItemId: string; reason: string; description: string } | null>(
    null
  );
  const [returnMessage, setReturnMessage] = useState<string | null>(null);

  function load() {
    fetch(`/api/orders/${params.id}`)
      .then((r) => r.json())
      .then(setOrder);
  }

  useEffect(load, [params.id]);

  async function submitReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!returnForm) return;
    setReturnMessage(null);
    const res = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(returnForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setReturnMessage(data.error ?? "Could not submit return request.");
      return;
    }
    setReturnMessage("Return request submitted.");
    setReturnForm(null);
  }

  if (!order) return <p className="text-ink-muted">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl text-ink mb-1">Order {order.orderNumber}</h1>
      <p className="text-sm text-ink-muted mb-6">{new Date(order.createdAt).toLocaleString()}</p>

      <div className="card p-4 mb-4 flex justify-between">
        <span>Order status</span>
        <span className="font-medium">{order.status}</span>
      </div>
      {order.payment && (
        <div className="card p-4 mb-4 flex justify-between">
          <span>Payment</span>
          <span className="font-medium">{order.payment.status}</span>
        </div>
      )}

      {order.vendorOrders.map((vo) => (
        <div key={vo.id} className="card p-4 mb-4">
          <div className="flex justify-between gap-3 mb-2">
            <p className="font-semibold min-w-0 truncate">{vo.vendor.storeName}</p>
            <span className="text-xs px-2 py-0.5 rounded bg-ink/[0.06] flex-shrink-0">{vo.status}</span>
          </div>
          {vo.items.map((item) => (
            <div key={item.id} className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 text-sm py-1">
              <span className="min-w-0 break-words">
                {item.productNameSnapshot} × {item.quantity}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span>{item.lineTotal}</span>
                {vo.status === "DELIVERED" && (
                  <button
                    className="text-xs text-brand hover:underline"
                    onClick={() =>
                      setReturnForm({ orderItemId: item.id, reason: "", description: "" })
                    }
                  >
                    Request return
                  </button>
                )}
              </div>
            </div>
          ))}
          {Number(vo.shippingCost) > 0 && (
            <div className="flex justify-between text-sm py-1 text-ink-muted">
              <span>Shipping</span>
              <span>{vo.shippingCost}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-medium border-t mt-2 pt-2">
            <span>Vendor subtotal</span>
            <span>{vo.subtotal}</span>
          </div>
          {vo.trackingNumber && <TrackingWidget vendorOrderId={vo.id} />}
        </div>
      ))}

      <div className="card p-4 mb-4 flex justify-between font-semibold">
        <span>Grand total</span>
        <span>{order.grandTotal}</span>
      </div>

      {returnForm && (
        <form onSubmit={submitReturn} className="card p-4 space-y-2">
          <p className="font-medium">Request a return</p>
          <input
            className="input"
            placeholder="Reason (e.g. Item damaged, wrong item, etc.)"
            value={returnForm.reason}
            onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
            required
          />
          <textarea
            className="input"
            placeholder="More details (optional)"
            value={returnForm.description}
            onChange={(e) => setReturnForm({ ...returnForm, description: e.target.value })}
          />
          <div className="flex gap-2">
            <button className="btn-primary">Submit request</button>
            <button type="button" className="btn-secondary" onClick={() => setReturnForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {returnMessage && <p className="text-sm text-ink-muted mt-2">{returnMessage}</p>}
    </div>
  );
}
