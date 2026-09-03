"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import DateRangeSelect from "@/components/DateRangeSelect";

type Analytics = {
  revenue: number;
  orderCount: number;
  productsSold: number;
  averageOrderValue: number;
  salesOverTime: { date: string; total: number }[];
  bestSellers: { name: string; quantity: number }[];
  pendingEarnings: string;
  availableEarnings: string;
  commissionPaid: string;
};

export default function VendorAnalyticsPage() {
  const [range, setRange] = useState("last30days");
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch(`/api/vendor/analytics?range=${range}`)
      .then((r) => r.json())
      .then(setData);
  }, [range]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">Analytics</h1>
        <DateRangeSelect value={range} onChange={setRange} />
      </div>

      {!data ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Revenue" value={data.revenue.toFixed(2)} />
            <Stat label="Orders" value={data.orderCount} />
            <Stat label="Products sold" value={data.productsSold} />
            <Stat label="Avg. order value" value={data.averageOrderValue.toFixed(2)} />
            <Stat label="Pending earnings" value={data.pendingEarnings} />
            <Stat label="Available earnings" value={data.availableEarnings} />
            <Stat label="Commission paid" value={data.commissionPaid} />
          </div>

          <div className="card p-4 mb-6">
            <p className="font-semibold mb-3">Sales over time</p>
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
