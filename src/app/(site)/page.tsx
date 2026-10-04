"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useCartCounts } from "@/components/CartCountProvider";
import { BrandMark } from "@/components/brand/Logo";

type Product = {
  id: string;
  slug: string;
  name: string;
  price: string;
  discountPrice: string | null;
  images: { url: string }[];
  vendor: { storeName: string; isVerified: boolean };
  category: { name: string; slug: string };
};

type Category = { id: string; name: string; slug: string };

// A small set of hand-picked glyphs so the category grid reads as a
// department directory rather than a plain text list — matched loosely
// by keyword so newly-added categories still get a sensible icon.
const CATEGORY_ICONS: { match: RegExp; icon: string }[] = [
  { match: /electronic/i, icon: "🔌" },
  { match: /phone/i, icon: "📱" },
  { match: /cloth|fashion|jewel/i, icon: "👗" },
  { match: /home|garden|grocer/i, icon: "🏡" },
  { match: /toy|baby|kid/i, icon: "🧸" },
  { match: /sport|health/i, icon: "🏋️" },
  { match: /beauty|personal care/i, icon: "💄" },
  { match: /book|music|media/i, icon: "📚" },
  { match: /automotive|car/i, icon: "🚗" },
  { match: /collect|hobb/i, icon: "🧩" },
  { match: /business|industr/i, icon: "🏭" },
  { match: /pet/i, icon: "🐾" },
];
function categoryIcon(name: string) {
  return CATEGORY_ICONS.find((c) => c.match.test(name))?.icon ?? "🛍️";
}

function discountPercent(price: string, discountPrice: string): number {
  const p = Number(price);
  const d = Number(discountPrice);
  if (!p || d >= p) return 0;
  return Math.round(((p - d) / p) * 100);
}

function ProductCard({ p, onChanged }: { p: Product; onChanged: () => void }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { refreshCounts } = useCartCounts();
  const [status, setStatus] = useState<"idle" | "cart" | "wishlist">("idle");
  const [wishlisted, setWishlisted] = useState(false);
  const pct = p.discountPrice ? discountPercent(p.price, p.discountPrice) : 0;

  async function quickAddToCart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!session?.user) {
      router.push("/login");
      return;
    }
    const res = await fetch("/api/cart/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: p.id, quantity: 1 }),
    });
    if (res.ok) {
      setStatus("cart");
      refreshCounts();
      onChanged();
      setTimeout(() => setStatus("idle"), 1500);
    }
  }

  async function quickAddToWishlist(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!session?.user) {
      router.push("/login");
      return;
    }
    const res = await fetch("/api/wishlist/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: p.id }),
    });
    if (res.ok) {
      setWishlisted(true);
      refreshCounts();
    }
  }

  return (
    <Link href={`/products/${p.slug}`} className="product-card group block relative">
      <div className="aspect-square bg-ink/[0.04] overflow-hidden relative">
        {p.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.images[0].url} alt={p.name} className="w-full h-full object-cover" />
        )}
        {pct > 0 && <span className="absolute top-2 left-2 badge-sale shadow-sm">−{pct}% OFF</span>}

        {/* Quick actions — appear on the card, not just the product page,
            so a customer can act straight from the grid. */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
          <button
            onClick={quickAddToWishlist}
            aria-label="Add to wishlist"
            className={`card-action-btn ${wishlisted ? "is-active" : ""}`}
          >
            {wishlisted ? "♥" : "♡"}
          </button>
        </div>
        <button
          onClick={quickAddToCart}
          className="absolute bottom-2 left-2 right-2 btn-accent text-sm py-2 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity"
        >
          {status === "cart" ? "Added ✓" : "Add to cart"}
        </button>
      </div>
      <div className="p-3">
        <p className="font-medium leading-snug line-clamp-2">{p.name}</p>
        <p className="text-xs text-ink-faint mt-0.5 mb-1.5 truncate">
          {p.vendor.storeName}
          {p.vendor.isVerified && (
            <span className="ml-1 badge-trust !px-1 !py-0" title="Verified seller">
              ✓ Verified
            </span>
          )}
        </p>
        <p className="font-semibold text-brand">
          {p.discountPrice ?? p.price}
          {p.discountPrice && (
            <span className="ml-2 text-xs font-normal text-ink-faint line-through">{p.price}</span>
          )}
        </p>
      </div>
    </Link>
  );
}

function ProductGrid({ products, onChanged }: { products: Product[]; onChanged: () => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {products.map((p) => (
        <ProductCard key={p.id} p={p} onChanged={onChanged} />
      ))}
    </div>
  );
}

function ShopContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const { data: session } = useSession();
  const { refreshCounts } = useCartCounts();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [trending, setTrending] = useState<Product[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<{ product: Product }[]>([]);
  const [searchInput, setSearchInput] = useState("");

  const q = sp.get("q") ?? "";
  const category = sp.get("category") ?? "";
  const sort = sp.get("sort") ?? "newest";
  const isDefaultView = !q && !category && sort === "newest";

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (sort) params.set("sort", sort);

    fetch(`/api/products?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setProducts(data.items ?? []);
        setTotal(data.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [q, category, sort]);

  useEffect(() => {
    if (!isDefaultView) return;
    fetch("/api/products/trending")
      .then((r) => r.json())
      .then(setTrending)
      .catch(() => {});
    if (session?.user?.role === "CUSTOMER") {
      fetch("/api/recently-viewed")
        .then((r) => r.json())
        .then(setRecentlyViewed)
        .catch(() => {});
    }
  }, [isDefaultView, session?.user?.role]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/?${params.toString()}`);
  }

  function submitSearch() {
    updateParam("q", searchInput);
  }

  return (
    <div>
      {/* Hero — only on the untouched, default browse view; a search or
          filter in progress replaces it with a compact results header
          below so the page doesn't fight the person's own intent. */}
      {isDefaultView && (
        <section className="mb-8">
          <div className="grid md:grid-cols-3 gap-4">
            {/* Main hero card — the busy-marketplace centerpiece, a big
                headline promo rather than a quiet welcome message. */}
            <div className="md:col-span-2 relative overflow-hidden rounded-2xl bg-brand-dark px-6 py-10 sm:px-10 sm:py-14">
              <div
                className="absolute inset-0 opacity-[0.08]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 18% 20%, white 0, white 2px, transparent 2px), radial-gradient(circle at 82% 60%, white 0, white 2px, transparent 2px), radial-gradient(circle at 45% 85%, white 0, white 2px, transparent 2px)",
                  backgroundSize: "140px 140px",
                }}
                aria-hidden="true"
              />
              {/* The Mmarakeng stall, oversized and faint, anchoring the
                  hero's right edge. */}
              <BrandMark
                size={260}
                tone="reversed"
                className="absolute -right-10 -bottom-12 opacity-[0.09] pointer-events-none hidden sm:block"
              />
              <div className="relative">
                <span className="badge-sun mb-3">🔥 Today's biggest deals</span>
                <h1 className="font-display text-3xl sm:text-4xl text-white leading-tight max-w-lg">
                  One cart. Every seller. Deals all day.
                </h1>
                <p className="mt-3 text-brand-light/90 text-sm sm:text-base max-w-md">
                  Browse thousands of products from independent sellers and check out once — no
                  matter how many stores you're shopping from.
                </p>
                <div className="mt-6 flex gap-2 max-w-md">
                  <input
                    className="input bg-white border-transparent focus:ring-2 focus:ring-white/40"
                    placeholder="Search for anything…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitSearch()}
                  />
                  <button className="btn-accent flex-shrink-0" onClick={submitSearch}>
                    Search
                  </button>
                </div>
              </div>
            </div>

            {/* Side promo stack — busy-marketplace filler that also
                doubles as real trust messaging (spec's buyer-protection
                copy), like the promo rail on the reference screenshots. */}
            <div className="grid grid-rows-2 gap-4">
              <div className="rounded-2xl bg-accent px-5 py-5 flex flex-col justify-center text-white relative overflow-hidden">
                <span className="text-2xl mb-1">🎁</span>
                <p className="font-display text-lg leading-snug">New here? Get 10% off</p>
                <p className="text-xs text-white/85 mt-1">
                  Use code <span className="font-semibold">WELCOME10</span> at checkout.
                </p>
              </div>
              <div className="rounded-2xl bg-trust px-5 py-5 text-white">
                <p className="font-medium text-sm mb-2">Shopping with confidence</p>
                <ul className="text-xs space-y-1.5 text-white/90">
                  <li>✓ Verified sellers, checked before they list</li>
                  <li>✓ Buyer protection on every order</li>
                  <li>✓ Track every order from seller to you</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Shop by category — a proper department grid, not just chips, so
          the storefront reads as many-departments-deep. */}
      {isDefaultView && categories.length > 0 && (
        <section className="mb-9">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-xl text-ink">Shop by category</h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => updateParam("category", c.slug)}
                className="card p-3 flex flex-col items-center gap-1.5 text-center hover:border-brand/40 hover:shadow-card-hover transition-all"
              >
                <span className="text-2xl">{categoryIcon(c.name)}</span>
                <span className="text-xs font-medium text-ink-muted line-clamp-2">{c.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Category chips — quick filter/reset row, kept for the non-default
          (filtered) view and as a compact alternative to the grid above. */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
          <button className={category === "" ? "chip-active" : "chip"} onClick={() => updateParam("category", "")}>
            All categories
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={category === c.slug ? "chip-active" : "chip"}
              onClick={() => updateParam("category", category === c.slug ? "" : c.slug)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {!isDefaultView && (
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <input
            className="input md:max-w-sm"
            placeholder="Search products..."
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateParam("q", (e.target as HTMLInputElement).value);
            }}
          />
          <select
            className="input md:max-w-xs"
            value={sort}
            onChange={(e) => updateParam("sort", e.target.value)}
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>
      )}

      {isDefaultView && recentlyViewed.length > 0 && (
        <div className="mb-9">
          <h2 className="font-display text-xl text-ink mb-3">Recently viewed</h2>
          <ProductGrid products={recentlyViewed.map((r) => r.product)} onChanged={refreshCounts} />
        </div>
      )}

      {isDefaultView && trending.length > 0 && (
        <div className="mb-9">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-display text-xl text-ink">Trending now</h2>
            <span className="badge-sale">🔥 Hot</span>
          </div>
          <ProductGrid products={trending} onChanged={refreshCounts} />
        </div>
      )}

      {isDefaultView && (trending.length > 0 || recentlyViewed.length > 0) && (
        <h2 className="font-display text-xl text-ink mb-3">All products</h2>
      )}

      {loading ? (
        <p className="text-ink-muted">Loading products…</p>
      ) : products.length === 0 ? (
        <p className="text-ink-muted">No products found.</p>
      ) : (
        <>
          <p className="text-sm text-ink-faint mb-3">{total} product(s)</p>
          <ProductGrid products={products} onChanged={refreshCounts} />
        </>
      )}
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <ShopContent />
    </Suspense>
  );
}
