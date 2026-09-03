"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">{data.vendor.storeName} — Dashboard</h1>
        <div className="flex gap-2 flex-wrap">
          <Link href="/vendor/products" className="btn-secondary">
            Products
          </Link>
          <Link href="/vendor/products/new" className="btn-primary">
            Add product
          </Link>
          <Link href="/vendor/orders" className="btn-secondary">
            Orders
          </Link>
          <Link href="/vendor/returns" className="btn-secondary">
            Returns
          </Link>
          <Link href="/vendor/wallet" className="btn-secondary">
            Wallet
          </Link>
          <Link href="/vendor/shipping" className="btn-secondary">
            Shipping
          </Link>
          <Link href="/vendor/coupons" className="btn-secondary">
            Coupons
          </Link>
          <Link href="/vendor/messages" className="btn-secondary">
            Messages
          </Link>
          <Link href="/vendor/analytics" className="btn-secondary">
            Analytics
          </Link>
        </div>
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
