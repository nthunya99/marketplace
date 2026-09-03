"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Variant = { id: string; sku: string; optionsJson: Record<string, string>; price: string; stockQuantity: number };
type ProductDetail = {
  id: string;
  name: string;
  description: string;
  price: string;
  discountPrice: string | null;
  stockQuantity: number;
  images: { url: string }[];
  variants: Variant[];
  vendor: { storeName: string; isVerified: boolean; id: string };
  category: { name: string };
};

type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  verifiedPurchase: boolean;
  createdAt: string;
  user: { name: string };
};

type RecommendedProduct = {
  id: string;
  slug: string;
  name: string;
  price: string;
  images: { url: string }[];
};

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", body: "" });
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [similar, setSimilar] = useState<RecommendedProduct[]>([]);
  const [alsoBought, setAlsoBought] = useState<RecommendedProduct[]>([]);

  useEffect(() => {
    fetch(`/api/products/${params.id}`)
      .then((r) => r.json())
      .then(setProduct);
  }, [params.id]);

  function loadReviews() {
    fetch(`/api/products/${params.id}/reviews`)
      .then((r) => r.json())
      .then((d) => {
        setReviews(d.reviews ?? []);
        setAvgRating(d.averageRating ?? 0);
        setReviewCount(d.reviewCount ?? 0);
      });
  }

  useEffect(loadReviews, [params.id]);

  useEffect(() => {
    fetch(`/api/products/${params.id}/recommendations`)
      .then((r) => r.json())
      .then((d) => {
        setSimilar(d.similar ?? []);
        setAlsoBought(d.alsoBought ?? []);
      });
  }, [params.id]);

  // Track recently-viewed for logged-in customers (spec section 5 / 22).
  useEffect(() => {
    if (session?.user?.role === "CUSTOMER" && product?.id) {
      fetch("/api/recently-viewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      }).catch(() => {});
    }
  }, [session?.user?.role, product?.id]);

  async function addToWishlist() {
    if (!session?.user) {
      router.push("/login");
      return;
    }
    const res = await fetch("/api/wishlist/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product!.id }),
    });
    setMessage(res.ok ? "Added to wishlist." : "Could not add to wishlist.");
  }

  async function messageSeller() {
    if (!session?.user) {
      router.push("/login");
      return;
    }
    if (session.user.role !== "CUSTOMER") return;
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId: product!.vendor.id, productId: product!.id }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/messages/${data.id}`);
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    setReviewMessage(null);
    const res = await fetch(`/api/products/${params.id}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: reviewForm.rating,
        title: reviewForm.title || undefined,
        body: reviewForm.body || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setReviewMessage(data.error ?? "Could not submit review.");
      return;
    }
    setReviewMessage("Thanks! Your review will appear once approved by an admin.");
    setReviewForm({ rating: 5, title: "", body: "" });
  }

  if (!product) return <p className="text-ink-muted">Loading…</p>;

  const variant = product.variants.find((v) => v.id === selectedVariant);
  const availableStock = variant ? variant.stockQuantity : product.stockQuantity;
  const displayPrice = variant ? variant.price : product.discountPrice ?? product.price;
  const pct =
    !variant && product.discountPrice
      ? Math.round(((Number(product.price) - Number(product.discountPrice)) / Number(product.price)) * 100)
      : 0;

  async function addToCart() {
    setMessage(null);
    if (!session?.user) {
      router.push("/login");
      return;
    }
    const res = await fetch("/api/cart/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product!.id,
        variantId: selectedVariant || undefined,
        quantity,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Could not add to cart.");
    } else {
      setMessage("Added to cart.");
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-8 sm:gap-10">
      <div className="aspect-square bg-ink/[0.04] rounded-xl overflow-hidden relative">
        {product.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.images[0].url} alt={product.name} className="w-full h-full object-cover" />
        )}
        {pct > 0 && (
          <span className="absolute top-3 left-3 badge-accent bg-accent text-white shadow-sm">−{pct}%</span>
        )}
      </div>
      <div>
        <span className="badge-neutral">{product.category.name}</span>
        <h1 className="font-display text-3xl text-ink mt-3 mb-1.5 leading-tight">{product.name}</h1>
        <p className="text-sm text-ink-muted mb-3">
          Sold by {product.vendor.storeName}
          {product.vendor.isVerified && <span className="ml-1.5 badge-brand">✓ Verified</span>}
        </p>
        {reviewCount > 0 && (
          <p className="text-sm mb-3 text-ink-muted">
            <span className="text-accent">★</span> {avgRating.toFixed(1)} ({reviewCount} review
            {reviewCount > 1 ? "s" : ""})
          </p>
        )}
        <p className="text-3xl font-semibold text-brand mb-5">
          {displayPrice}
          {pct > 0 && <span className="ml-2.5 text-base font-normal text-ink-faint line-through">{product.price}</span>}
        </p>

        {product.variants.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Options</label>
            <select
              className="input"
              value={selectedVariant}
              onChange={(e) => setSelectedVariant(e.target.value)}
            >
              <option value="">Select an option</option>
              {product.variants.map((v) => (
                <option key={v.id} value={v.id} disabled={v.stockQuantity === 0}>
                  {Object.entries(v.optionsJson)
                    .map(([k, val]) => `${k}: ${val}`)
                    .join(", ")}{" "}
                  {v.stockQuantity === 0 ? "(out of stock)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <label className="text-sm font-medium">Quantity</label>
          <input
            type="number"
            min={1}
            max={Math.max(availableStock, 1)}
            className="input w-24"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
          <span className="text-sm text-ink-faint">{availableStock} in stock</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            disabled={availableStock === 0 || (product.variants.length > 0 && !selectedVariant)}
            onClick={addToCart}
          >
            Add to cart
          </button>
          <button className="btn-secondary" onClick={addToWishlist}>
            ♡ Wishlist
          </button>
          {session?.user?.role !== "VENDOR" && session?.user?.role !== "ADMIN" && (
            <button className="btn-secondary" onClick={messageSeller}>
              Message seller
            </button>
          )}
        </div>
        {message && <p className="mt-2 text-sm text-ink-muted">{message}</p>}

        <div className="mt-9">
          <h2 className="font-display text-xl text-ink mb-2">Description</h2>
          <p className="text-ink-muted whitespace-pre-line leading-relaxed">{product.description}</p>
        </div>

        <div className="mt-9">
          <h2 className="font-display text-xl text-ink mb-3">Reviews</h2>

          {reviews.length === 0 ? (
            <p className="text-sm text-ink-faint mb-4">No reviews yet.</p>
          ) : (
            <div className="space-y-3 mb-4">
              {reviews.map((r) => (
                <div key={r.id} className="border-b border-ink/10 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-accent">{"★".repeat(r.rating)}</span>
                    {r.title && <span className="font-medium">{r.title}</span>}
                    {r.verifiedPurchase && <span className="badge-brand">Verified purchase</span>}
                  </div>
                  {r.body && <p className="text-sm text-ink-muted mt-1">{r.body}</p>}
                  <p className="text-xs text-ink-faint mt-1">
                    {r.user.name} · {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}

          {session?.user?.role === "CUSTOMER" && (
            <form onSubmit={submitReview} className="card p-4 space-y-2">
              <p className="text-sm font-medium">Leave a review</p>
              <select
                className="input"
                value={reviewForm.rating}
                onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)} ({n})
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Title (optional)"
                value={reviewForm.title}
                onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })}
              />
              <textarea
                className="input"
                placeholder="Your review (optional)"
                value={reviewForm.body}
                onChange={(e) => setReviewForm({ ...reviewForm, body: e.target.value })}
              />
              {reviewMessage && <p className="text-sm text-ink-muted">{reviewMessage}</p>}
              <button className="btn-primary">Submit review</button>
              <p className="text-xs text-ink-faint">
                Only customers who've purchased this product can review it.
              </p>
            </form>
          )}
        </div>

        {similar.length > 0 && (
          <div className="mt-9">
            <h2 className="font-display text-xl text-ink mb-3">Similar products</h2>
            <RecommendationRow products={similar} />
          </div>
        )}

        {alsoBought.length > 0 && (
          <div className="mt-9">
            <h2 className="font-display text-xl text-ink mb-3">Customers also bought</h2>
            <RecommendationRow products={alsoBought} />
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationRow({ products }: { products: RecommendedProduct[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {products.map((p) => (
        <a key={p.id} href={`/products/${p.slug}`} className="product-card flex-shrink-0 w-32 block">
          <div className="aspect-square bg-ink/[0.04] overflow-hidden">
            {p.images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.images[0].url} alt={p.name} className="w-full h-full object-cover" />
            )}
          </div>
          <div className="p-2">
            <p className="text-xs line-clamp-2">{p.name}</p>
            <p className="text-xs font-semibold text-brand">{p.price}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
