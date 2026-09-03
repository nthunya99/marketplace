"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CartItem = {
  id: string;
  name: string;
  image: string | null;
  vendorName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  availableStock: number;
  inStock: boolean;
};

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState("0.00");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/cart")
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
        setSubtotal(data.subtotal ?? "0.00");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function updateQty(id: string, quantity: number) {
    if (quantity < 1) return;
    await fetch(`/api/cart/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/cart/items/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <p className="text-ink-muted">Loading cart…</p>;

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-ink-muted mb-4">Your cart is empty.</p>
        <Link href="/" className="btn-primary">
          Continue shopping
        </Link>
      </div>
    );
  }

  const vendors = new Set(items.map((i) => i.vendorName));

  return (
    <div className="grid md:grid-cols-3 gap-8">
      <div className="md:col-span-2 space-y-4">
        <p className="text-sm text-ink-muted">
          Items from {vendors.size} vendor{vendors.size > 1 ? "s" : ""} — they'll be checked out
          together and split into separate vendor orders automatically.
        </p>
        {items.map((item) => (
          <div key={item.id} className="card flex flex-col sm:flex-row gap-4 p-4">
            <div className="flex gap-4">
              <div className="w-20 h-20 bg-ink/[0.04] rounded-lg overflow-hidden flex-shrink-0">
                {item.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.name}</p>
                <p className="text-xs text-ink-faint">Sold by {item.vendorName}</p>
                {!item.inStock && (
                  <p className="text-xs text-red-600">Only {item.availableStock} left in stock</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    max={item.availableStock}
                    value={item.quantity}
                    onChange={(e) => updateQty(item.id, Number(e.target.value))}
                    className="input w-20"
                  />
                  <button onClick={() => remove(item.id)} className="text-sm text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
              </div>
            </div>
            <div className="text-left sm:text-right font-semibold flex-shrink-0 sm:ml-auto">
              {item.lineTotal}
            </div>
          </div>
        ))}
      </div>

      <div className="card p-4 h-fit">
        <div className="flex justify-between mb-2">
          <span>Subtotal</span>
          <span className="font-semibold">{subtotal}</span>
        </div>
        <p className="text-xs text-ink-faint mb-4">
          Shipping and taxes are calculated at checkout.
        </p>
        <Link href="/checkout" className="btn-primary w-full block text-center">
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
