"use client";

import { useEffect, useState } from "react";

type Vendor = {
  id: string;
  storeName: string;
  status: string;
  createdAt: string;
  commissionPercent: string | null;
  user: { name: string; email: string };
  _count: { products: number };
};

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [commissionInputs, setCommissionInputs] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    const qs = filter ? `?status=${filter}` : "";
    fetch(`/api/vendors${qs}`)
      .then((r) => r.json())
      .then(setVendors)
      .finally(() => setLoading(false));
  }

  useEffect(load, [filter]);

  async function approve(id: string) {
    await fetch(`/api/vendors/${id}/approve`, { method: "POST" });
    load();
  }

  async function reject(id: string, status: "REJECTED" | "SUSPENDED") {
    await fetch(`/api/vendors/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function saveCommission(id: string) {
    const raw = commissionInputs[id];
    const value = raw === "" || raw === undefined ? null : Number(raw);
    await fetch(`/api/admin/vendors/${id}/commission`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionPercent: value }),
    });
    load();
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">Vendors</h1>
        <select className="input w-48" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : vendors.length === 0 ? (
        <p className="text-gray-500">No vendors found.</p>
      ) : (
        <div className="card divide-y">
          {vendors.map((v) => (
            <div key={v.id} className="list-row">
              <div className="flex-1">
                <p className="font-medium">{v.storeName}</p>
                <p className="text-xs text-gray-500">
                  {v.user.name} · {v.user.email} · {v._count.products} product(s)
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{v.status}</span>
              {v.status === "PENDING" && (
                <>
                  <button className="btn-primary" onClick={() => approve(v.id)}>
                    Approve
                  </button>
                  <button
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => reject(v.id, "REJECTED")}
                  >
                    Reject
                  </button>
                </>
              )}
              {v.status === "APPROVED" && (
                <button
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => reject(v.id, "SUSPENDED")}
                >
                  Suspend
                </button>
              )}
              {(v.status === "SUSPENDED" || v.status === "REJECTED") && (
                <button className="btn-secondary" onClick={() => approve(v.id)}>
                  Reactivate
                </button>
              )}
              <div className="flex items-center gap-1">
                <input
                  className="input w-20"
                  type="number"
                  step="0.1"
                  placeholder={v.commissionPercent ?? "default"}
                  value={commissionInputs[v.id] ?? ""}
                  onChange={(e) => setCommissionInputs({ ...commissionInputs, [v.id]: e.target.value })}
                />
                <button className="btn-secondary text-xs" onClick={() => saveCommission(v.id)}>
                  Set %
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
