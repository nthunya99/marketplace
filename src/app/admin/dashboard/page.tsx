"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Dashboard = {
  totalCustomers: number;
  totalVendors: number;
  activeVendors: number;
  pendingVendors: number;
  totalProducts: number;
  totalOrders: number;
  grossSales: number;
  platformCommission: number;
  vendorEarnings: number;
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <p className="text-gray-500">Loading…</p>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/vendors" className="btn-secondary">
            Vendors {data.pendingVendors > 0 && `(${data.pendingVendors} pending)`}
          </Link>
          <Link href="/admin/categories" className="btn-secondary">
            Categories
          </Link>
          <Link href="/admin/reviews" className="btn-secondary">
            Reviews
          </Link>
          <Link href="/admin/payouts" className="btn-secondary">
            Payouts
          </Link>
          <Link href="/admin/coupons" className="btn-secondary">
            Coupons
          </Link>
          <Link href="/admin/analytics" className="btn-secondary">
            Analytics
          </Link>
          <Link href="/admin/fraud" className="btn-secondary">
            Fraud
          </Link>
          <Link href="/admin/audit-logs" className="btn-secondary">
            Audit Log
          </Link>
          <Link href="/admin/settings" className="btn-secondary">
            Settings
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Customers" value={data.totalCustomers} />
        <Stat label="Vendors (active)" value={`${data.activeVendors} / ${data.totalVendors}`} />
        <Stat label="Products" value={data.totalProducts} />
        <Stat label="Orders" value={data.totalOrders} />
        <Stat label="Gross sales" value={data.grossSales.toFixed(2)} />
        <Stat label="Platform commission" value={data.platformCommission.toFixed(2)} />
        <Stat label="Vendor earnings" value={data.vendorEarnings.toFixed(2)} />
        <Stat label="Pending vendor approvals" value={data.pendingVendors} />
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
