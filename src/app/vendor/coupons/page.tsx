"use client";

import { useEffect, useState } from "react";

type Coupon = {
  id: string;
  code: string;
  type: string;
  value: string;
  usageCount: number;
  usageLimit: number | null;
  isActive: boolean;
  expiresAt: string | null;
};

export default function VendorCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState({ code: "", type: "PERCENTAGE", value: "", usageLimit: "", expiresAt: "" });
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/coupons")
      .then((r) => r.json())
      .then(setCoupons);
  }

  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        type: form.type,
        value: Number(form.value),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not create coupon.");
      return;
    }
    setForm({ code: "", type: "PERCENTAGE", value: "", usageLimit: "", expiresAt: "" });
    load();
  }

  async function toggleActive(c: Coupon) {
    await fetch(`/api/coupons/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/coupons/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-2">Coupons</h1>
      <p className="text-sm text-gray-500 mb-4">
        Coupons you create apply only to your own products. The discount is funded by the
        marketplace — your commission and payout are unaffected.
      </p>

      <form onSubmit={create} className="card p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          className="input"
          placeholder="Code (e.g. SAVE10)"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          required
        />
        <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="PERCENTAGE">Percentage off</option>
          <option value="FIXED">Fixed amount off</option>
        </select>
        <input
          className="input"
          type="number"
          step="0.01"
          placeholder={form.type === "PERCENTAGE" ? "Percent (e.g. 10)" : "Amount"}
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          required
        />
        <input
          className="input"
          type="number"
          placeholder="Usage limit (optional)"
          value={form.usageLimit}
          onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
        />
        <input
          className="input col-span-1 sm:col-span-2"
          type="date"
          value={form.expiresAt}
          onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
        />
        <button className="btn-primary col-span-1 sm:col-span-2">Create coupon</button>
      </form>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="card divide-y">
        {coupons.map((c) => (
          <div key={c.id} className="list-row">
            <div className="flex-1">
              <p className="font-mono font-medium">{c.code}</p>
              <p className="text-xs text-gray-500">
                {c.type === "PERCENTAGE" ? `${c.value}% off` : `${c.value} off`}
                {c.usageLimit && ` · ${c.usageCount}/${c.usageLimit} used`}
                {c.expiresAt && ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`}
              </p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
              {c.isActive ? "Active" : "Inactive"}
            </span>
            <button className="btn-secondary" onClick={() => toggleActive(c)}>
              {c.isActive ? "Deactivate" : "Activate"}
            </button>
            <button className="text-sm text-red-600 hover:underline" onClick={() => remove(c.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
