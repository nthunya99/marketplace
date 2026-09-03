"use client";

import { useEffect, useState } from "react";

type Method = {
  id: string;
  name: string;
  cost: string;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  isActive: boolean;
  isDefault: boolean;
};

export default function VendorShippingPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [form, setForm] = useState({ name: "", cost: "", estimatedDaysMin: "", estimatedDaysMax: "" });
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/vendor/shipping-methods")
      .then((r) => r.json())
      .then(setMethods);
  }

  useEffect(load, []);

  async function addMethod(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/vendor/shipping-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        cost: Number(form.cost),
        estimatedDaysMin: form.estimatedDaysMin ? Number(form.estimatedDaysMin) : undefined,
        estimatedDaysMax: form.estimatedDaysMax ? Number(form.estimatedDaysMax) : undefined,
        isDefault: methods.length === 0,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not create shipping method.");
      return;
    }
    setForm({ name: "", cost: "", estimatedDaysMin: "", estimatedDaysMax: "" });
    load();
  }

  async function setDefault(id: string) {
    await fetch(`/api/vendor/shipping-methods/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    load();
  }

  async function toggleActive(m: Method) {
    await fetch(`/api/vendor/shipping-methods/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !m.isActive }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/vendor/shipping-methods/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-2">Shipping Methods</h1>
      <p className="text-sm text-gray-500 mb-4">
        Your default active method's cost is automatically applied to orders at checkout.
      </p>

      <form onSubmit={addMethod} className="card p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          className="input"
          placeholder="Name (e.g. Standard)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="input"
          type="number"
          step="0.01"
          placeholder="Cost"
          value={form.cost}
          onChange={(e) => setForm({ ...form, cost: e.target.value })}
          required
        />
        <input
          className="input"
          type="number"
          placeholder="Min days (optional)"
          value={form.estimatedDaysMin}
          onChange={(e) => setForm({ ...form, estimatedDaysMin: e.target.value })}
        />
        <input
          className="input"
          type="number"
          placeholder="Max days (optional)"
          value={form.estimatedDaysMax}
          onChange={(e) => setForm({ ...form, estimatedDaysMax: e.target.value })}
        />
        <button className="btn-primary col-span-1 sm:col-span-2">Add shipping method</button>
      </form>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="card divide-y">
        {methods.map((m) => (
          <div key={m.id} className="list-row">
            <div className="flex-1">
              <p className="font-medium">
                {m.name} {m.isDefault && <span className="text-xs text-brand">(default)</span>}
              </p>
              <p className="text-xs text-gray-500">
                {m.cost}
                {m.estimatedDaysMin && ` · ${m.estimatedDaysMin}-${m.estimatedDaysMax ?? m.estimatedDaysMin} days`}
              </p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
              {m.isActive ? "Active" : "Inactive"}
            </span>
            {!m.isDefault && (
              <button className="btn-secondary" onClick={() => setDefault(m.id)}>
                Make default
              </button>
            )}
            <button className="btn-secondary" onClick={() => toggleActive(m)}>
              {m.isActive ? "Deactivate" : "Activate"}
            </button>
            <button className="text-sm text-red-600 hover:underline" onClick={() => remove(m.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
