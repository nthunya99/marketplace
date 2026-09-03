"use client";

import { useEffect, useState } from "react";

type ProductReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  reportCount: number;
  verifiedPurchase: boolean;
  user: { name: string };
  product: { name: string };
};

type VendorReview = {
  id: string;
  rating: number;
  body: string | null;
  status: string;
  reportCount: number;
  user: { name: string };
  vendor: { storeName: string };
};

export default function AdminReviewsPage() {
  const [productReviews, setProductReviews] = useState<ProductReview[]>([]);
  const [vendorReviews, setVendorReviews] = useState<VendorReview[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/admin/reviews")
      .then((r) => r.json())
      .then((d) => {
        setProductReviews(d.productReviews ?? []);
        setVendorReviews(d.vendorReviews ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function moderate(id: string, type: "product" | "vendor", status: "APPROVED" | "REJECTED") {
    await fetch(`/api/reviews/${id}/moderate?type=${type}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-4">Review Moderation</h1>

      <h2 className="font-semibold mb-2">Product reviews</h2>
      {productReviews.length === 0 ? (
        <p className="text-sm text-gray-500 mb-6">Nothing to moderate.</p>
      ) : (
        <div className="card divide-y mb-6">
          {productReviews.map((r) => (
            <div key={r.id} className="p-4">
              <div className="flex justify-between gap-3">
                <p className="font-medium min-w-0 break-words">
                  {"★".repeat(r.rating)} {r.title}
                </p>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 h-fit flex-shrink-0">{r.status}</span>
              </div>
              <p className="text-sm text-gray-600">{r.body}</p>
              <p className="text-xs text-gray-500 mt-1">
                {r.user.name} on {r.product.name}
                {r.reportCount > 0 && ` · reported ${r.reportCount}x`}
                {r.verifiedPurchase && " · verified purchase"}
              </p>
              {r.status === "PENDING" && (
                <div className="flex gap-2 mt-2">
                  <button className="btn-primary" onClick={() => moderate(r.id, "product", "APPROVED")}>
                    Approve
                  </button>
                  <button
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => moderate(r.id, "product", "REJECTED")}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="font-semibold mb-2">Seller reviews</h2>
      {vendorReviews.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing to moderate.</p>
      ) : (
        <div className="card divide-y">
          {vendorReviews.map((r) => (
            <div key={r.id} className="p-4">
              <div className="flex justify-between gap-3">
                <p className="font-medium">{"★".repeat(r.rating)}</p>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 h-fit flex-shrink-0">{r.status}</span>
              </div>
              <p className="text-sm text-gray-600">{r.body}</p>
              <p className="text-xs text-gray-500 mt-1">
                {r.user.name} on {r.vendor.storeName}
                {r.reportCount > 0 && ` · reported ${r.reportCount}x`}
              </p>
              {r.status === "PENDING" && (
                <div className="flex gap-2 mt-2">
                  <button className="btn-primary" onClick={() => moderate(r.id, "vendor", "APPROVED")}>
                    Approve
                  </button>
                  <button
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => moderate(r.id, "vendor", "REJECTED")}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
