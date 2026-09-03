"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

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

function discountPercent(price: string, discountPrice: string): number {
  const p = Number(price);
  const d = Number(discountPrice);
  if (!p || d >= p) return 0;
  return Math.round(((p - d) / p) * 100);
}

function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {products.map((p) => {
        const pct = p.discountPrice ? discountPercent(p.price, p.discountPrice) : 0;
        return (
          <Link key={p.id} href={`/products/${p.slug}`} className="product-card group block">
            <div className="aspect-square bg-ink/[0.04] overflow-hidden relative">
              {p.images[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.images[0].url} alt={p.name} className="w-full h-full object-cover" />
              )}
              {pct > 0 && (
                <span className="absolute top-2 left-2 badge-accent bg-accent text-white shadow-sm">
                  −{pct}%
                </span>
              )}
            </div>
            <div className="p-3">
              <p className="font-medium leading-snug line-clamp-2">{p.name}</p>
              <p className="text-xs text-ink-faint mt-0.5 mb-1.5 truncate">
                {p.vendor.storeName}
                {p.vendor.isVerified && (
                  <span className="ml-1 text-brand" title="Verified seller">
                    ✓
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
      })}
    </div>
  );
}

function ShopContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const { data: session } = useSession();
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
        <section className="relative overflow-hidden rounded-2xl bg-brand-dark px-6 py-10 sm:px-10 sm:py-14 mb-8">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 18% 20%, white 0, white 2px, transparent 2px), radial-gradient(circle at 82% 60%, white 0, white 2px, transparent 2px), radial-gradient(circle at 45% 85%, white 0, white 2px, transparent 2px)",
              backgroundSize: "140px 140px",
            }}
            aria-hidden="true"
          />
          <div className="relative max-w-xl">
            <h1 className="font-display italic text-3xl sm:text-4xl text-white leading-tight">
              One cart. Every seller.
            </h1>
            <p className="mt-3 text-brand-light/90 text-sm sm:text-base">
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
        </section>
      )}

      {/* Category chips */}
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
          <ProductGrid products={recentlyViewed.map((r) => r.product)} />
        </div>
      )}

      {isDefaultView && trending.length > 0 && (
        <div className="mb-9">
          <h2 className="font-display text-xl text-ink mb-3">Trending now</h2>
          <ProductGrid products={trending} />
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
          <ProductGrid products={products} />
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
