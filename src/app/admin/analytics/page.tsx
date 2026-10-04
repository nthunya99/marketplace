"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import DateRangeSelect from "@/components/DateRangeSelect";

type Analytics = {
  grossSales: number;
  platformCommission: number;
  vendorEarnings: number;
  refunds: number;
  payouts: number;
  failedPayments: number;
  newCustomers: number;
  newVendors: number;
  orderCount: number;
  salesOverTime: { date: string; total: number }[];
  salesByVendor: { name: string; total: number }[];
  salesByCategory: { name: string; quantity: number }[];
  bestSellers: { name: string; quantity: number }[];
};

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState("last30days");
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch(`/api/admin/analytics?range=${range}`)
      .then((r) => r.json())
      .then(setData);
  }, [range]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">Mmarakeng Analytics</h1>
        <DateRangeSelect value={range} onChange={setRange} />
      </div>

      {!data ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Gross sales" value={data.grossSales.toFixed(2)} />
            <Stat label="Platform commission" value={data.platformCommission.toFixed(2)} />
            <Stat label="Vendor earnings" value={data.vendorEarnings.toFixed(2)} />
            <Stat label="Refunds" value={data.refunds.toFixed(2)} />
            <Stat label="Payouts completed" value={data.payouts.toFixed(2)} />
            <Stat label="Failed payments" value={data.failedPayments} />
            <Stat label="New customers" value={data.newCustomers} />
            <Stat label="New vendors" value={data.newVendors} />
          </div>

          <div className="card p-4 mb-6">
            <p className="font-semibold mb-3">Gross sales over time</p>
            {data.salesOverTime.length === 0 ? (
              <p className="text-sm text-gray-500">No sales in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.salesOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" stroke="#1f6f54" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="card p-4">
              <p className="font-semibold mb-3">Sales by vendor</p>
              {data.salesByVendor.length === 0 ? (
                <p className="text-sm text-gray-500">No sales in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.salesByVendor}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={10} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#1f6f54" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-4">
              <p className="font-semibold mb-3">Sales by category</p>
              {data.salesByCategory.length === 0 ? (
                <p className="text-sm text-gray-500">No sales in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.salesByCategory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={10} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="quantity" fill="#154a38" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card p-4">
            <p className="font-semibold mb-3">Best-selling products</p>
            {data.bestSellers.length === 0 ? (
              <p className="text-sm text-gray-500">No sales in this range.</p>
            ) : (
              <div className="divide-y">
                {data.bestSellers.map((p, i) => (
                  <div key={i} className="flex justify-between py-2 text-sm">
                    <span>{p.name}</span>
                    <span className="font-medium">{p.quantity} sold</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
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
