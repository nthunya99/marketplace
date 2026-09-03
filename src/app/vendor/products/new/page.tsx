"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Category = { id: string; name: string; children?: Category[] };

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    categoryId: "",
    price: "",
    discountPrice: "",
    stockQuantity: "0",
    brand: "",
    shortDescription: "",
    description: "",
    imageUrl: "",
    status: "DRAFT",
  });

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories);
  }, []);

  const flatCategories: Category[] = categories.flatMap((c) => [c, ...(c.children ?? [])]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        sku: form.sku,
        categoryId: form.categoryId,
        price: Number(form.price),
        discountPrice: form.discountPrice ? Number(form.discountPrice) : undefined,
        stockQuantity: Number(form.stockQuantity),
        brand: form.brand || undefined,
        shortDescription: form.shortDescription || undefined,
        description: form.description,
        status: form.status,
        images: form.imageUrl ? [{ url: form.imageUrl }] : undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not create product.");
      return;
    }
    router.push("/vendor/products");
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-4">Add product</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          className="input"
          placeholder="Product name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="input"
          placeholder="SKU"
          value={form.sku}
          onChange={(e) => setForm({ ...form, sku: e.target.value })}
          required
        />
        <select
          className="input"
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          required
        >
          <option value="">Select a category</option>
          {flatCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="Price"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="Discount price (optional)"
            value={form.discountPrice}
            onChange={(e) => setForm({ ...form, discountPrice: e.target.value })}
          />
        </div>
        <input
          className="input"
          type="number"
          placeholder="Stock quantity"
          value={form.stockQuantity}
          onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
          required
        />
        <input
          className="input"
          placeholder="Brand (optional)"
          value={form.brand}
          onChange={(e) => setForm({ ...form, brand: e.target.value })}
        />
        <input
          className="input"
          placeholder="Image URL (optional)"
          value={form.imageUrl}
          onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
        />
        <input
          className="input"
          placeholder="Short description (optional)"
          value={form.shortDescription}
          onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
        />
        <textarea
          className="input"
          placeholder="Full description"
          rows={5}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          required
        />
        <select
          className="input"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
        >
          <option value="DRAFT">Save as draft</option>
          <option value="PUBLISHED">Publish immediately</option>
        </select>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Saving…" : "Save product"}
        </button>
      </form>
      <p className="text-xs text-gray-500 mt-3">
        Product variants (size/color/etc.) can be added via the API for now — see the products
        API's <code>variants</code> field; a dedicated variant builder UI is a good next addition.
      </p>
    </div>
  );
}
