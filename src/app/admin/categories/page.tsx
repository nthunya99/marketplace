"use client";

import { useEffect, useState } from "react";

type Category = { id: string; name: string; slug: string; isActive: boolean; children?: Category[] };

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories);
  }

  useEffect(load, []);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: parentId || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not create category.");
      return;
    }
    setName("");
    setParentId("");
    load();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) alert(data.error);
    load();
  }

  async function toggleActive(c: Category) {
    await fetch(`/api/categories/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    load();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-4">Categories</h1>

      <form onSubmit={addCategory} className="card p-4 mb-6 flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-gray-500 mb-1">Parent (optional)</label>
          <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Top level —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary">Add</button>
      </form>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="card divide-y">
        {categories.map((c) => (
          <div key={c.id}>
            <div className="list-row !p-3">
              <p className="flex-1 font-medium">{c.name}</p>
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
            {c.children?.map((child) => (
              <div key={child.id} className="list-row !p-3 pl-4 sm:pl-8 border-t">
                <p className="flex-1 text-sm">{child.name}</p>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
                  {child.isActive ? "Active" : "Inactive"}
                </span>
                <button className="btn-secondary" onClick={() => toggleActive(child)}>
                  {child.isActive ? "Deactivate" : "Activate"}
                </button>
                <button className="text-sm text-red-600 hover:underline" onClick={() => remove(child.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
