"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Product = {
  id: string;
  name: string;
  sku: string;
  price: string;
  stockQuantity: number;
  status: string;
  images: { url: string }[];
  category: { name: string };
};

export default function VendorProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/products?mine=true")
      .then((r) => r.json())
      .then((data) => setProducts(data.items ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function toggleStatus(p: Product) {
    const newStatus = p.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  async function remove(p: Product) {
    if (!confirm(`Delete "${p.name}"? If it has past orders it will be archived instead.`)) return;
    await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">My Products</h1>
        <Link href="/vendor/products/new" className="btn-primary">
          Add product
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-gray-500">You haven't added any products yet.</p>
      ) : (
        <div className="card divide-y">
          {products.map((p) => (
            <div key={p.id} className="list-row">
              <div className="w-14 h-14 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                {p.images[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.images[0].url} alt={p.name} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-gray-500">
                  SKU {p.sku} · {p.category.name} · {p.stockQuantity} in stock
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{p.status}</span>
              <p className="font-semibold w-20 text-right">{p.price}</p>
              <button className="btn-secondary" onClick={() => toggleStatus(p)}>
                {p.status === "PUBLISHED" ? "Unpublish" : "Publish"}
              </button>
              <button className="text-sm text-red-600 hover:underline" onClick={() => remove(p)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
