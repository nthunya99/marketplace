"use client";

import { useState } from "react";

type TrackingResult = {
  trackingNumber: string;
  carrier: string;
  currentStatus: string;
  estimatedDelivery?: string;
  events: { status: string; description: string; occurredAt: string }[];
};

export default function TrackingWidget({ vendorOrderId }: { vendorOrderId: string }) {
  const [tracking, setTracking] = useState<TrackingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchTracking() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/vendor-orders/${vendorOrderId}/tracking`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not fetch tracking.");
      return;
    }
    setTracking(data);
  }

  if (!tracking && !loading && !error) {
    return (
      <button className="text-xs text-brand hover:underline" onClick={fetchTracking}>
        Track shipment
      </button>
    );
  }

  if (loading) return <p className="text-xs text-gray-400">Loading tracking…</p>;
  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (!tracking) return null;

  return (
    <div className="mt-2 border-t pt-2">
      <p className="text-xs text-gray-500 mb-1">
        {tracking.carrier} · {tracking.trackingNumber} · Current: {tracking.currentStatus}
      </p>
      <div className="space-y-1">
        {tracking.events.map((e, i) => (
          <div key={i} className="text-xs flex justify-between text-gray-600">
            <span>{e.description}</span>
            <span>{new Date(e.occurredAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
