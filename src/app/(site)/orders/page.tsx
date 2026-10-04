"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ManualPaymentPanel from "@/components/ManualPaymentPanel";
import MpesaPaymentPanel, { type MpesaTxn } from "@/components/MpesaPaymentPanel";
import MopayPaymentPanel, { type MopayPaymentRow } from "@/components/MopayPaymentPanel";
import PaymentMethodPicker, { type CustomerPaymentMethod } from "@/components/PaymentMethodPicker";

// Vendor order statuses beyond which a customer has an actual
// relationship with the seller worth messaging about — mirrors the
// server-side check in POST /api/conversations.
const MESSAGEABLE_STATUSES = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "REFUNDED", "PARTIALLY_REFUNDED"];

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
    paymentMethod: string;
    vendor: {
      id: string;
      storeName: string;
      bankName: string | null;
      bankAccountName: string | null;
      bankAccountNumber: string | null;
      mpesaMerchantNumber: string | null;
      ecocashMerchantNumber: string | null;
      mobileMoneyAccountType?: string;
    };
    items: { id: string; productNameSnapshot: string; quantity: number; lineTotal: string }[];
    proofOfPayments: {
      id: string;
      status: "PENDING" | "CONFIRMED" | "REJECTED";
      note: string | null;
      fileName: string | null;
      submittedAt: string;
      rejectionReason: string | null;
    }[];
    mpesaTransactions: MpesaTxn[];
    mopayPayments: MopayPaymentRow[];
    availablePaymentMethods: CustomerPaymentMethod[];
  }[];
};

type VendorOrderDetail = OrderDetail["vendorOrders"][number];

// Mirrors the server-side guard in POST /api/vendor-orders/[id]/payment-method:
// no switching while a payment under the current method might still land.
function canSwitchMethod(vo: VendorOrderDetail) {
  if (vo.status !== "PENDING") return false;
  const others = vo.availablePaymentMethods.filter((m) => m !== vo.paymentMethod);
  if (others.length === 0) return false;
  if (vo.paymentMethod === "manual") return !vo.proofOfPayments.some((p) => p.status === "PENDING");
  if (vo.paymentMethod === "mpesa") return !(vo.mpesaTransactions ?? []).some((t) => t.status === "PENDING");
  if (vo.paymentMethod === "mopay") return !(vo.mopayPayments ?? []).some((p) => p.status === "PROCESSING");
  return true;
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [returnForm, setReturnForm] = useState<{ orderItemId: string; reason: string; description: string } | null>(
    null
  );
  const [returnMessage, setReturnMessage] = useState<string | null>(null);
  const [messagingVendorId, setMessagingVendorId] = useState<string | null>(null);
  // Set when MoPay sends the customer back here (?payment=success|failed|…).
  const [paymentReturn, setPaymentReturn] = useState<string | null>(null);
  // Vendor order whose payment method the customer is changing.
  const [changingMethodFor, setChangingMethodFor] = useState<string | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("payment");
    if (value) {
      setPaymentReturn(value);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  function load() {
    fetch(`/api/orders/${params.id}`)
      .then((r) => r.json())
      .then(setOrder);
  }

  useEffect(load, [params.id]);

  // Messaging only opens up once a vendor order has actually been
  // confirmed (spec change: no more "message seller" from the product
  // page). Re-uses the same conversation the product page used to
  // create, so any prior threads still work.
  async function messageVendor(vendorId: string) {
    setMessagingVendorId(vendorId);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId }),
    });
    const data = await res.json();
    setMessagingVendorId(null);
    if (res.ok) router.push(`/messages/${data.id}`);
  }

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
      {paymentReturn && (
        <div
          className={`rounded-lg px-4 py-3 text-sm mb-4 ${
            paymentReturn === "success"
              ? "bg-brand-light text-brand-dark border border-brand/30"
              : paymentReturn === "processing" || paymentReturn === "created"
              ? "bg-accent-light text-accent-dark border border-accent/30"
              : "bg-sale-light text-sale-dark border border-sale/30"
          }`}
        >
          {paymentReturn === "success"
            ? "Payment received — thank you! The seller will start processing your order."
            : paymentReturn === "processing" || paymentReturn === "created"
            ? "We haven't had confirmation of your payment yet. Use “Check payment” below in a moment."
            : "Your payment didn't go through. You can try again below."}
        </div>
      )}
      <h1 className="font-display text-2xl text-ink mb-1">Order {order.orderNumber}</h1>
      <p className="text-sm text-ink-muted mb-6">{new Date(order.createdAt).toLocaleString()}</p>

      <div className="card p-4 mb-4 flex justify-between">
        <span>Order status</span>
        <span className="font-medium">{order.status}</span>
      </div>
      {order.payment && (
        <div className="card p-4 mb-4 flex justify-between">
          <span>Payment</span>
          <span className="font-medium">
            {order.payment.status === "INITIATED"
              ? order.vendorOrders.some((vo) => vo.status === "PENDING" && vo.paymentMethod === "unselected")
                ? "Choose how to pay below"
                : "Awaiting your payment"
              : order.payment.status}
          </span>
        </div>
      )}

      {order.vendorOrders.map((vo) => (
        <div key={vo.id} className="card p-4 mb-4">
          <div className="flex justify-between gap-3 mb-2">
            <p className="font-semibold min-w-0 truncate">{vo.vendor.storeName}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {MESSAGEABLE_STATUSES.includes(vo.status) && (
                <button
                  className="text-xs text-brand hover:underline"
                  disabled={messagingVendorId === vo.vendor.id}
                  onClick={() => messageVendor(vo.vendor.id)}
                >
                  {messagingVendorId === vo.vendor.id ? "Opening…" : "Message seller"}
                </button>
              )}
              <span className="text-xs px-2 py-0.5 rounded bg-ink/[0.06]">{vo.status}</span>
            </div>
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
          <div className="flex justify-between text-sm font-medium border-t mt-2 pt-2">
            <span>Vendor subtotal</span>
            <span>{vo.subtotal}</span>
          </div>

          {vo.status === "PENDING" &&
            (vo.paymentMethod === "unselected" || changingMethodFor === vo.id) && (
              <PaymentMethodPicker
                key={`${vo.id}-${vo.paymentMethod}`}
                vendorOrderId={vo.id}
                vendorName={vo.vendor.storeName}
                amount={vo.subtotal}
                methods={vo.availablePaymentMethods}
                current={vo.paymentMethod}
                onChosen={() => {
                  setChangingMethodFor(null);
                  load();
                }}
                onCancel={changingMethodFor === vo.id ? () => setChangingMethodFor(null) : undefined}
              />
            )}

          {changingMethodFor !== vo.id && vo.paymentMethod === "mopay" && vo.status === "PENDING" && (
            <MopayPaymentPanel
              vendorOrderId={vo.id}
              vendorName={vo.vendor.storeName}
              amount={vo.subtotal}
              payments={vo.mopayPayments ?? []}
              onChanged={load}
            />
          )}
          {vo.paymentMethod === "mopay" && vo.status !== "PENDING" && vo.mopayPayments?.find((p) => p.status === "SUCCESS") && (
            <p className="text-xs text-ink-muted mt-3">
              Paid online
              {(() => {
                const p = vo.mopayPayments.find((x) => x.status === "SUCCESS")!;
                const label = { mpesa: "M-Pesa", ecocash: "EcoCash", card: "card" }[p.selectedPaymentMethod ?? ""] ?? null;
                return `${label ? ` with ${label}` : ""}${p.mopayTransactionId ? ` · ref ${p.mopayTransactionId}` : ""}`;
              })()}
            </p>
          )}

          {changingMethodFor !== vo.id && vo.paymentMethod === "mpesa" && vo.status === "PENDING" && (
            <MpesaPaymentPanel
              vendorOrderId={vo.id}
              vendorName={vo.vendor.storeName}
              amount={vo.subtotal}
              initialTransactions={vo.mpesaTransactions ?? []}
              onPaid={load}
            />
          )}
          {vo.paymentMethod === "mpesa" && vo.status !== "PENDING" && vo.mpesaTransactions?.some((t) => t.status === "SUCCESS" || t.status === "REVERSED") && (
            <p className="text-xs text-ink-muted mt-3">
              Paid with M-Pesa
              {vo.mpesaTransactions.find((t) => t.mpesaTransactionId)?.mpesaTransactionId
                ? ` · ref ${vo.mpesaTransactions.find((t) => t.mpesaTransactionId)!.mpesaTransactionId}`
                : ""}
            </p>
          )}

          {changingMethodFor !== vo.id && vo.paymentMethod === "manual" && vo.status === "PENDING" && (
            <ManualPaymentPanel
              vendorOrderId={vo.id}
              vendorName={vo.vendor.storeName}
              vendorPayment={vo.vendor}
              amount={vo.subtotal}
              initialProofs={vo.proofOfPayments}
            />
          )}

          {changingMethodFor !== vo.id && vo.paymentMethod !== "unselected" && canSwitchMethod(vo) && (
            <button
              className="text-xs text-brand hover:underline mt-3"
              onClick={() => setChangingMethodFor(vo.id)}
            >
              Pay a different way
            </button>
          )}
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
