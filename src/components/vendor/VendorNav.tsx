"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { BrandMark } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";

type Item = { href: string; label: string; icon: keyof typeof ICONS };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Overview",
    items: [
      { href: "/vendor/dashboard", label: "Dashboard", icon: "home" },
      { href: "/vendor/analytics", label: "Analytics", icon: "chart" },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { href: "/vendor/products", label: "Products", icon: "box" },
      { href: "/vendor/products/new", label: "Add product", icon: "plus" },
      { href: "/vendor/coupons", label: "Coupons", icon: "tag" },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/vendor/orders", label: "Orders", icon: "receipt" },
      { href: "/vendor/returns", label: "Returns", icon: "undo" },
      { href: "/vendor/messages", label: "Messages", icon: "chat" },
    ],
  },
  {
    title: "Money & store",
    items: [
      { href: "/vendor/wallet", label: "Wallet", icon: "wallet" },
      { href: "/vendor/payments", label: "Payments", icon: "phone" },
      { href: "/vendor/payment-details", label: "Store settings", icon: "cog" },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

// Stroke icons (24px grid) — kept inline so no icon package is needed.
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H3",
  box: "M21 8 12 3 3 8m18 0v8l-9 5m9-13-9 5m0 8-9-5V8m9 13v-8M3 8l9 5",
  plus: "M12 5v14M5 12h14",
  tag: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Zm5-4.5h.01",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Zm13 7h.01",
  phone: "M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm3 17h2",
  cog: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-[18px] h-[18px] flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/**
 * The most specific matching href wins, so /vendor/products/new
 * highlights "Add product" rather than "Products", while
 * /vendor/messages/abc still highlights "Messages".
 */
function activeHref(pathname: string) {
  let best: string | null = null;
  for (const item of ALL_ITEMS) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      if (!best || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Awaiting approval",
  REJECTED: "Not approved",
  SUSPENDED: "Suspended",
};

export default function VendorNav({ storeName, status }: { storeName: string; status: string | null }) {
  const pathname = usePathname() ?? "";
  const active = activeHref(pathname);
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the active tab in view on the mobile strip.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>("[data-active='true']");
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active]);

  const statusLabel = status && status !== "APPROVED" ? STATUS_LABEL[status] ?? status : null;

  return (
    <>
      {/* Desktop: sticky sidebar */}
      <aside className="hidden lg:block sticky top-[176px]">
        <div className="card p-3">
          <div className="px-2 pt-1 pb-3 mb-2 border-b border-ink/10">
            <p className="flex items-center gap-1.5 text-xs text-ink-faint">
              <BrandMark size={16} />
              {BRAND.name} {BRAND.sellerCentre.toLowerCase()}
            </p>
            <p className="font-display text-lg text-ink leading-snug truncate" title={storeName}>
              {storeName}
            </p>
            {statusLabel && <span className="badge-accent mt-1.5">{statusLabel}</span>}
          </div>
          <nav aria-label="Store navigation" className="space-y-3">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <p className="px-2 mb-1 text-[11px] font-medium text-ink-faint">{group.title}</p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = item.href === active;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                            isActive
                              ? "bg-brand text-white font-medium"
                              : "text-ink-muted hover:bg-brand-light hover:text-brand-dark"
                          }`}
                        >
                          <Icon name={item.icon} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Mobile / tablet: store name + horizontally scrollable tabs */}
      <div className="lg:hidden mb-5">
        <div className="flex items-center gap-2 mb-2">
          <p className="font-display text-lg text-ink truncate">{storeName}</p>
          {statusLabel && <span className="badge-accent">{statusLabel}</span>}
        </div>
        <div
          ref={stripRef}
          className="-mx-4 px-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {ALL_ITEMS.map((item) => {
            const isActive = item.href === active;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={isActive}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm border transition-colors ${
                  isActive
                    ? "bg-brand border-brand text-white font-medium"
                    : "bg-white border-ink/15 text-ink-muted hover:border-brand/40 hover:text-brand-dark"
                }`}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
