"use client";

import { useEffect, useState } from "react";

type Dashboard = {
  vendor: { storeName: string; status: string };
  wallet: { pendingBalance: string; availableBalance: string; totalEarnings: string } | null;
  productCount: number;
  orderCount: number;
  totalSales: number;
};

export default function VendorDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    fetch("/api/vendor/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <p className="text-gray-500">Loading…</p>;

  if (data.vendor.status !== "APPROVED") {
    return (
      <div className="card p-6 max-w-lg">
        <h1 className="text-xl font-bold mb-2">{data.vendor.storeName}</h1>
        <p className="text-gray-600">
          Your vendor account status is <strong>{data.vendor.status}</strong>. You'll be able to
          list products once an administrator approves your account.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-ink-muted">A snapshot of {data.vendor.storeName}'s sales and balances.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Products" value={data.productCount} />
        <Stat label="Orders" value={data.orderCount} />
        <Stat label="Total sales" value={data.totalSales.toFixed(2)} />
        <Stat label="Pending balance" value={data.wallet?.pendingBalance ?? "0.00"} />
        <Stat label="Available balance" value={data.wallet?.availableBalance ?? "0.00"} />
        <Stat label="Total earnings" value={data.wallet?.totalEarnings ?? "0.00"} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
