"use client";

import { useEffect, useState } from "react";

type Proof = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  imageData: string;
  fileName: string | null;
  note: string | null;
  submittedAt: string;
  rejectionReason: string | null;
};

type VendorOrder = {
  id: string;
  status: string;
  subtotal: string;
  vendorEarnings: string;
  paymentMethod: string;
  order: { orderNumber: string; createdAt: string; customer: { name: string } };
  items: { productNameSnapshot: string; quantity: number; lineTotal: string }[];
  proofOfPayments: Proof[];
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
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [busyProofId, setBusyProofId] = useState<string | null>(null);

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
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Could not update order.");
      return;
    }
    load();
  }

  async function confirmProof(vendorOrderId: string, proofId: string) {
    setBusyProofId(proofId);
    const res = await fetch(`/api/vendor-orders/${vendorOrderId}/proof/${proofId}/confirm`, {
      method: "POST",
    });
    setBusyProofId(null);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Could not confirm payment.");
      return;
    }
    load();
  }

  async function rejectProof(vendorOrderId: string, proofId: string) {
    const reason = rejectReason[proofId]?.trim();
    if (!reason) {
      alert("Please give the customer a reason before rejecting.");
      return;
    }
    setBusyProofId(proofId);
    const res = await fetch(`/api/vendor-orders/${vendorOrderId}/proof/${proofId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectionReason: reason }),
    });
    setBusyProofId(null);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Could not reject payment.");
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
        {orders.map((o) => {
          const pendingProof = o.proofOfPayments.find((p) => p.status === "PENDING");
          const awaitingManualPayment = o.paymentMethod === "manual" && o.status === "PENDING";
          const awaitingMpesa = (o.paymentMethod === "mpesa" || o.paymentMethod === "mopay") && o.status === "PENDING";
          const awaitingChoice = o.paymentMethod === "unselected" && o.status === "PENDING";

          return (
            <div key={o.id} className="card p-4">
              <div className="flex justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{o.order.orderNumber}</p>
                  <p className="text-xs text-gray-500">
                    {o.order.customer.name} · {new Date(o.order.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 h-fit flex-shrink-0">
                  {awaitingManualPayment || awaitingChoice
                    ? "AWAITING PAYMENT"
                    : awaitingMpesa
                    ? "AWAITING ONLINE PAYMENT"
                    : o.status}
                </span>
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

              {awaitingManualPayment && (
                <div className="mt-3 border-t pt-3">
                  <p className="text-sm font-medium mb-2">Proof of payment</p>
                  {!pendingProof && o.proofOfPayments.length === 0 && (
                    <p className="text-xs text-gray-500">
                      The customer hasn't uploaded proof of payment yet.
                    </p>
                  )}
                  {o.proofOfPayments.map((p) => (
                    <div key={p.id} className="bg-gray-50 rounded p-3 mb-2">
                      <div className="flex justify-between gap-2 text-xs text-gray-500 mb-2">
                        <span>{new Date(p.submittedAt).toLocaleString()}</span>
                        <span className="font-medium">{p.status}</span>
                      </div>
                      {p.note && <p className="text-sm mb-2">Note: {p.note}</p>}
                      {p.imageData.startsWith("data:image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageData}
                          alt="Proof of payment"
                          className="max-w-full max-h-80 rounded border mb-2"
                        />
                      ) : (
                        <a
                          href={p.imageData}
                          download={p.fileName ?? "proof-of-payment.pdf"}
                          className="text-sm text-brand hover:underline block mb-2"
                        >
                          View uploaded file ({p.fileName ?? "PDF"})
                        </a>
                      )}
                      {p.status === "PENDING" && (
                        <div className="space-y-2">
                          <button
                            className="btn-primary text-sm py-1.5"
                            disabled={busyProofId === p.id}
                            onClick={() => confirmProof(o.id, p.id)}
                          >
                            Confirm payment received
                          </button>
                          <div className="flex flex-wrap gap-2">
                            <input
                              className="input"
                              placeholder="Reason for rejecting (required)"
                              value={rejectReason[p.id] ?? ""}
                              onChange={(e) => setRejectReason({ ...rejectReason, [p.id]: e.target.value })}
                            />
                            <button
                              className="text-sm text-red-600 hover:underline"
                              disabled={busyProofId === p.id}
                              onClick={() => rejectProof(o.id, p.id)}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      )}
                      {p.status === "REJECTED" && p.rejectionReason && (
                        <p className="text-xs text-red-600">You rejected this: {p.rejectionReason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {awaitingMpesa && (
                <p className="text-xs text-ink-muted bg-ink/[0.04] rounded px-3 py-2 mt-3">
                  The customer pays this order online, straight into your {o.paymentMethod === "mopay" ? "MoPay" : "M-Pesa"}{" "}
                  account. It moves to CONFIRMED on its own once the payment goes through — no action needed from you.
                </p>
              )}

              {awaitingChoice && (
                <p className="text-xs text-ink-muted bg-ink/[0.04] rounded px-3 py-2 mt-3">
                  The customer hasn't chosen how to pay you yet. You'll be notified once they pay or upload proof of
                  payment.
                </p>
              )}

              {!awaitingManualPayment && !awaitingMpesa && !awaitingChoice && NEXT_STATUS[o.status] && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button className="btn-primary whitespace-nowrap" onClick={() => advance(o)}>
                    Mark as {NEXT_STATUS[o.status]}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
