"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type CartItem = {
  id: string;
  name: string;
  vendorName: string;
  quantity: number;
  lineTotal: string;
};

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState("0.00");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [couponCode, setCouponCode] = useState("");
  const [couponPreview, setCouponPreview] = useState<{ discountAmount: string } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  const [pointsBalance, setPointsBalance] = useState(0);
  const [redeemPointsPerUnit, setRedeemPointsPerUnit] = useState(100);
  const [redeemPoints, setRedeemPoints] = useState(0);

  useEffect(() => {
    fetch("/api/cart")
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
        setSubtotal(data.subtotal ?? "0.00");
      });
    fetch("/api/loyalty")
      .then((r) => r.json())
      .then((d) => {
        setPointsBalance(d.pointsBalance ?? 0);
        setRedeemPointsPerUnit(d.redeemPointsPerUnit ?? 100);
      });
  }, []);

  const vendorGroups = items.reduce<Record<string, CartItem[]>>((acc, item) => {
    (acc[item.vendorName] ??= []).push(item);
    return acc;
  }, {});

  async function applyCoupon() {
    setCouponError(null);
    setCouponPreview(null);
    if (!couponCode.trim()) return;
    setCheckingCoupon(true);
    const res = await fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponCode }),
    });
    const data = await res.json();
    setCheckingCoupon(false);
    if (!res.ok) {
      setCouponError(data.error ?? "Invalid coupon.");
      return;
    }
    setCouponPreview(data);
  }

  const estimatedDiscount =
    (couponPreview ? Number(couponPreview.discountAmount) : 0) + redeemPoints / redeemPointsPerUnit;
  const estimatedTotal = Math.max(Number(subtotal) - estimatedDiscount, 0);

  async function placeOrder() {
    setPlacing(true);
    setError(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        couponCode: couponPreview ? couponCode : undefined,
        redeemPoints: redeemPoints > 0 ? redeemPoints : undefined,
      }),
    });
    const data = await res.json();
    setPlacing(false);
    if (!res.ok) {
      setError(data.error ?? "Checkout failed.");
      return;
    }
    router.push(`/orders/${data.orderId}`);
  }

  if (items.length === 0) {
    return <p className="text-ink-muted">Your cart is empty.</p>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl text-ink mb-4">Review your order</h1>
      <p className="text-sm text-ink-muted mb-6">
        This purchase will be split into {Object.keys(vendorGroups).length} separate vendor order
        {Object.keys(vendorGroups).length > 1 ? "s" : ""}, each fulfilled independently, in a single
        checkout.
      </p>

      {Object.entries(vendorGroups).map(([vendorName, vendorItems]) => (
        <div key={vendorName} className="card p-4 mb-4">
          <p className="font-semibold mb-2">{vendorName}</p>
          {vendorItems.map((item) => (
            <div key={item.id} className="flex flex-wrap justify-between gap-x-3 text-sm py-1">
              <span className="min-w-0 break-words">
                {item.name} × {item.quantity}
              </span>
              <span className="flex-shrink-0">{item.lineTotal}</span>
            </div>
          ))}
        </div>
      ))}

      <div className="card p-4 mb-4">
        <p className="text-sm font-medium mb-2">Coupon code</p>
        <div className="flex flex-wrap gap-2">
          <input
            className="input"
            placeholder="Enter code"
            value={couponCode}
            onChange={(e) => {
              setCouponCode(e.target.value.toUpperCase());
              setCouponPreview(null);
            }}
          />
          <button className="btn-secondary whitespace-nowrap" onClick={applyCoupon} disabled={checkingCoupon}>
            {checkingCoupon ? "Checking…" : "Apply"}
          </button>
        </div>
        {couponError && <p className="text-red-600 text-sm mt-2">{couponError}</p>}
        {couponPreview && (
          <p className="text-green-700 text-sm mt-2">Coupon applied: -{couponPreview.discountAmount}</p>
        )}
      </div>

      {pointsBalance > 0 && (
        <div className="card p-4 mb-4">
          <p className="text-sm font-medium mb-2">
            Loyalty points ({pointsBalance} available, {redeemPointsPerUnit} points = 1 unit)
          </p>
          <input
            type="number"
            min={0}
            max={pointsBalance}
            className="input"
            value={redeemPoints}
            onChange={(e) => setRedeemPoints(Math.min(Number(e.target.value), pointsBalance))}
          />
        </div>
      )}

      <div className="card p-4 mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span>Subtotal</span>
          <span>{subtotal}</span>
        </div>
        {estimatedDiscount > 0 && (
          <div className="flex justify-between text-sm mb-1 text-green-700">
            <span>Discount</span>
            <span>-{estimatedDiscount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold border-t mt-2 pt-2">
          <span>Estimated total</span>
          <span>{estimatedTotal.toFixed(2)}</span>
        </div>
        <p className="text-xs text-ink-muted mt-1">
          Final total (including shipping) is confirmed on the next step.
        </p>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <button className="btn-primary w-full" onClick={placeOrder} disabled={placing}>
        {placing ? "Placing order…" : "Place order & pay"}
      </button>
    </div>
  );
}
