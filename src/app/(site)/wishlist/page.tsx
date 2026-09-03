"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type WishlistItem = {
  id: string;
  product: {
    id: string;
    slug: string;
    name: string;
    price: string;
    discountPrice: string | null;
    images: { url: string }[];
    vendor: { storeName: string };
  };
};

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/wishlist")
      .then((r) => r.json())
      .then(setItems)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function remove(id: string) {
    await fetch(`/api/wishlist/items/${id}`, { method: "DELETE" });
    load();
  }

  async function moveToCart(id: string) {
    const res = await fetch(`/api/wishlist/items/${id}`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Could not move to cart.");
      return;
    }
    load();
  }

  if (loading) return <p className="text-ink-muted">Loading wishlist…</p>;
  if (items.length === 0) return <p className="text-ink-muted">Your wishlist is empty.</p>;

  return (
    <div>
      <h1 className="font-display text-2xl text-ink mb-4">My Wishlist</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item) => (
          <div key={item.id} className="product-card">
            <Link href={`/products/${item.product.slug}`}>
              <div className="aspect-square bg-ink/[0.04] overflow-hidden">
                {item.product.images[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.product.images[0].url}
                    alt={item.product.name}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            </Link>
            <div className="p-3">
              <p className="font-medium line-clamp-2">{item.product.name}</p>
              <p className="text-xs text-ink-faint mb-1 truncate">{item.product.vendor.storeName}</p>
              <p className="font-semibold text-brand mb-2">
                {item.product.discountPrice ?? item.product.price}
              </p>
              <div className="flex gap-2">
                <button className="btn-primary flex-1 text-xs py-1.5" onClick={() => moveToCart(item.id)}>
                  Move to cart
                </button>
                <button
                  className="text-xs text-red-600 hover:underline flex-shrink-0"
                  onClick={() => remove(item.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
