"use client";

import { useEffect, useState } from "react";

type LoyaltyData = {
  pointsBalance: number;
  lifetimePoints: number;
  earnRatePerCurrency: string;
  redeemPointsPerUnit: number;
  transactions: { id: string; type: string; points: number; description: string | null; createdAt: string }[];
};

export default function LoyaltyPage() {
  const [data, setData] = useState<LoyaltyData | null>(null);

  useEffect(() => {
    fetch("/api/loyalty")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <p className="text-ink-muted">Loading…</p>;

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-2xl text-ink mb-4">Loyalty & Rewards</h1>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-ink-muted">Points balance</p>
          <p className="text-2xl font-semibold">{data.pointsBalance}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-ink-muted">Lifetime points earned</p>
          <p className="text-2xl font-semibold">{data.lifetimePoints}</p>
        </div>
      </div>

      <p className="text-sm text-ink-muted mb-6">
        You earn {data.earnRatePerCurrency} point(s) per currency unit spent. {data.redeemPointsPerUnit}{" "}
        points can be redeemed for 1 currency unit off a future order at checkout.
      </p>

      <h2 className="font-semibold mb-2">Activity</h2>
      {data.transactions.length === 0 ? (
        <p className="text-sm text-ink-muted">No activity yet.</p>
      ) : (
        <div className="card divide-y">
          {data.transactions.map((t) => (
            <div key={t.id} className="flex justify-between p-3 text-sm">
              <div>
                <p className="font-medium">{t.type}</p>
                {t.description && <p className="text-xs text-ink-muted">{t.description}</p>}
              </div>
              <div className="text-right">
                <p className={t.points >= 0 ? "text-green-700" : "text-red-600"}>
                  {t.points >= 0 ? "+" : ""}
                  {t.points}
                </p>
                <p className="text-xs text-ink-faint">{new Date(t.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
