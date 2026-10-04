"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCartCounts } from "./CartCountProvider";
import { useNotificationCount } from "./NotificationCountProvider";
import Logo from "./brand/Logo";
import { BRAND } from "@/lib/brand";

type Category = { id: string; name: string; slug: string };

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 4h2l2.2 11.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L20.4 8H6.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17.5" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20.2s-7.6-4.6-10-9.3C.5 7.7 2 4.4 5.4 3.7c2-.4 4 .5 5.1 2.1 1.1-1.6 3.1-2.5 5.1-2.1 3.4.7 4.9 4 3.4 7.2-2.4 4.7-10 9.3-10 9.3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M4 8.5 12 13l8-4.5M12 13v7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 18.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavItem({
  href,
  onClick,
  children,
  className = "",
}: {
  href: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  // Used only on light backgrounds now (the account dropdown and the
  // mobile menu panel) — both need dark text with a darker hover, not
  // the white-on-dark styling the header bars use for their own links.
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block px-4 py-1.5 hover:bg-ink/[0.04] hover:text-brand-dark transition-colors ${className}`}
    >
      {children}
    </Link>
  );
}

export default function Navbar() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { cartCount, wishlistCount } = useCartCounts();

  const { unread } = useNotificationCount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchCategory, setSearchCategory] = useState("");

  const categoryStripRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Close the mobile menu automatically whenever the route changes, so a
  // tapped link doesn't leave the overlay open on top of the new page.
  useEffect(() => {
    setMenuOpen(false);
    setAccountMenuOpen(false);
  }, [pathname]);

  // Tracks whether the category strip actually overflows, so the slider
  // arrows only render when there's somewhere to scroll to — and update
  // live as the person scrolls so a spent-out arrow disables itself
  // instead of just doing nothing.
  useEffect(() => {
    const el = categoryStripRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [categories]);

  function scrollCategories(direction: "left" | "right") {
    categoryStripRef.current?.scrollBy({ left: direction === "left" ? -220 : 220, behavior: "smooth" });
  }

  // Close the account dropdown on an outside click — clicking its own
  // toggle button is handled separately by that button's onClick.
  useEffect(() => {
    if (!accountMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [accountMenuOpen]);

  const closeMenu = () => setMenuOpen(false);

  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (searchInput) params.set("q", searchInput);
    if (searchCategory) params.set("category", searchCategory);
    router.push(`/?${params.toString()}`);
    closeMenu();
  }

  const accountLinks = (
    <>
      {session?.user && session.user.role !== "VENDOR" && (
        <NavItem href="/orders" onClick={closeMenu}>
          My Orders
        </NavItem>
      )}
      {session?.user?.role === "VENDOR" && (
        <NavItem href="/vendor/orders" onClick={closeMenu}>
          My Orders
        </NavItem>
      )}
      {session?.user?.role === "CUSTOMER" && (
        <NavItem href="/loyalty" onClick={closeMenu}>
          Rewards
        </NavItem>
      )}
      {session?.user?.role === "CUSTOMER" && (
        <NavItem href="/messages" onClick={closeMenu}>
          Messages
        </NavItem>
      )}
      {session?.user?.role === "CUSTOMER" && (
        <NavItem href="/support" onClick={closeMenu}>
          Support
        </NavItem>
      )}
      {session?.user && (
        <NavItem href="/notifications" onClick={closeMenu} className="relative">
          Notifications
          {unread > 0 && (
            <span className="ml-1.5 inline-block bg-sale text-white text-[10px] rounded-full px-1.5 py-0.5">
              {unread}
            </span>
          )}
        </NavItem>
      )}
      {session?.user?.role === "VENDOR" && (
        <NavItem href="/vendor/dashboard" onClick={closeMenu}>
          Vendor Dashboard
        </NavItem>
      )}
      {session?.user?.role === "ADMIN" && (
        <NavItem href="/admin/dashboard" onClick={closeMenu}>
          Admin
        </NavItem>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-30 shadow-sm">
      {/* Layer 1 — utility bar: contact/help + vendor recruitment, the
          kind of low-stakes chrome that signals an established store
          rather than a fresh storefront. */}
      <div className="bg-ink text-white/80 text-xs">
        <div className="max-w-6xl mx-auto px-4 h-8 flex items-center justify-between gap-4 overflow-hidden">
          <span className="hidden sm:inline truncate">
            📞 Help &amp; support: <span className="text-white">{BRAND.supportPhone}</span>
          </span>
          <div className="flex items-center gap-4 ml-auto">
            {session?.user?.role !== "VENDOR" && (
              <Link href="/register" className="hover:text-white transition-colors whitespace-nowrap">
                Sell on {BRAND.name}
              </Link>
            )}
            {session?.user && (
              <Link
                href={session.user.role === "VENDOR" ? "/vendor/orders" : "/orders"}
                className="hover:text-white transition-colors whitespace-nowrap"
              >
                Track my order
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Layer 2 — main bar: logo, search, account/wishlist/cart. */}
      <div className="bg-brand-dark">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3 sm:gap-5">
          <Link
            href="/"
            className="flex items-center flex-shrink-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70"
            onClick={closeMenu}
            aria-label={`${BRAND.name} home`}
          >
            <Logo tone="reversed" size={36} hideWordmarkOnMobile />
          </Link>

          {/* Search — the visual anchor of a busy header, styled like a
              multi-department storefront (category picker fused to the
              search field). */}
          <form onSubmit={submitSearch} className="hidden md:flex flex-1 max-w-2xl">
            <select
              value={searchCategory}
              onChange={(e) => setSearchCategory(e.target.value)}
              className="bg-white/95 text-ink text-sm rounded-l-lg border-r border-ink/10 pl-3 pr-2 py-2.5 focus:outline-none max-w-[9.5rem] truncate"
              aria-label="Search category"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className="flex-1 bg-white text-ink text-sm px-3 py-2.5 focus:outline-none min-w-0"
              placeholder="Search for anything…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button
              type="submit"
              className="bg-accent hover:bg-accent-dark transition-colors px-4 rounded-r-lg text-white flex-shrink-0"
              aria-label="Search"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
                <path d="M17 17L13.4 13.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </form>

          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            {/* Vendor/Admin dashboard — deliberately placed here, not just
                in the scrollable category strip below, so it's never one
                horizontal-scroll away from being invisible. */}
            {session?.user?.role === "VENDOR" && (
              <Link
                href="/vendor/dashboard"
                className="hidden sm:inline-block text-xs sm:text-sm bg-accent hover:bg-accent-dark transition-colors text-white rounded-lg px-3 py-1.5 mr-1 whitespace-nowrap"
              >
                Vendor Dashboard
              </Link>
            )}
            {session?.user?.role === "ADMIN" && (
              <Link
                href="/admin/dashboard"
                className="hidden sm:inline-block text-xs sm:text-sm bg-accent hover:bg-accent-dark transition-colors text-white rounded-lg px-3 py-1.5 mr-1 whitespace-nowrap"
              >
                Admin Dashboard
              </Link>
            )}

            {/* Account — click-to-open dropdown so Orders/Rewards/Messages/
                Support/Notifications are always one click away, never
                dependent on the category strip having room to show them. */}
            <div className="hidden md:block relative" ref={accountMenuRef}>
              {session?.user ? (
                <>
                  <button
                    onClick={() => setAccountMenuOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-sm text-white/90 hover:text-white transition-colors px-2 py-1.5 rounded-lg"
                    aria-expanded={accountMenuOpen}
                  >
                    <span className="truncate max-w-[7rem] lg:max-w-[9rem]">
                      Hi, {session.user.name?.split(" ")[0] ?? "there"}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={accountMenuOpen ? "rotate-180" : ""}>
                      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {accountMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-ink/10 py-1.5 text-sm text-ink z-40">
                      {accountLinks}
                      <div className="border-t border-ink/10 mt-1.5 pt-1.5">
                        <button
                          onClick={() => {
                            setAccountMenuOpen(false);
                            signOut({ callbackUrl: "/" });
                          }}
                          className="w-full text-left px-4 py-1.5 text-ink-muted hover:bg-ink/[0.04]"
                        >
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-3 text-sm text-white/90 mr-1">
                  <Link href="/login" className="hover:text-white transition-colors">
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-lg bg-accent px-3 py-1.5 hover:bg-accent-dark transition-colors text-white"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>

            {session?.user && (
              <Link
                href={session.user.role === "VENDOR" ? "/vendor/orders" : "/orders"}
                className="icon-btn"
                aria-label="My Orders"
              >
                <OrdersIcon />
              </Link>
            )}
            {session?.user && (
              <Link href="/notifications" className="icon-btn" aria-label="Notifications">
                <BellIcon />
                {unread > 0 && <span className="icon-btn-count">{unread > 99 ? "99+" : unread}</span>}
              </Link>
            )}
            {session?.user?.role === "CUSTOMER" && (
              <Link href="/wishlist" className="icon-btn" aria-label="Wishlist">
                <HeartIcon />
                {wishlistCount > 0 && (
                  <span className="icon-btn-count">{wishlistCount > 99 ? "99+" : wishlistCount}</span>
                )}
              </Link>
            )}
            {session?.user && (
              <Link href="/cart" className="icon-btn" aria-label="Cart">
                <CartIcon />
                {cartCount > 0 && <span className="icon-btn-count">{cartCount > 99 ? "99+" : cartCount}</span>}
              </Link>
            )}

            {/* Hamburger (mobile/tablet, where the account row + category strip are hidden) */}
            <button
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg text-white relative ml-1"
            >
              {unread > 0 && !menuOpen && (
                <span className="absolute -top-1 -right-1 bg-sale text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
              <span className="sr-only">Menu</span>
              {menuOpen ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Search — mobile row, since the fused search bar above is hidden below md. */}
        <div className="md:hidden px-4 pb-3">
          <form onSubmit={submitSearch} className="flex">
            <input
              className="flex-1 bg-white text-ink text-sm rounded-l-lg px-3 py-2.5 focus:outline-none min-w-0"
              placeholder="Search for anything…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button type="submit" className="bg-accent px-4 rounded-r-lg text-white flex-shrink-0" aria-label="Search">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
                <path d="M17 17L13.4 13.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Layer 3 — category strip: the "departments" rail that makes a
          marketplace feel established and browsable at a glance. This is
          categories only now — account links (Orders, Notifications,
          Vendor Dashboard, etc.) live in the always-visible icon row and
          account dropdown above, not buried in a row that can scroll
          out of view. */}
      <div className="bg-brand hidden md:block relative">
        <div className="max-w-6xl mx-auto relative">
          {canScrollLeft && (
            <button
              onClick={() => scrollCategories("left")}
              aria-label="Scroll categories left"
              className="absolute left-0 top-0 bottom-0 z-10 w-8 flex items-center justify-center text-white bg-gradient-to-r from-brand to-brand/0"
            >
              <ChevronIcon direction="left" />
            </button>
          )}
          <div
            ref={categoryStripRef}
            className="px-4 h-11 flex items-center gap-5 overflow-x-auto text-sm text-white/90 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth"
          >
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/?category=${c.slug}`}
                className="whitespace-nowrap hover:text-white transition-colors flex-shrink-0"
              >
                {c.name}
              </Link>
            ))}
          </div>
          {canScrollRight && (
            <button
              onClick={() => scrollCategories("right")}
              aria-label="Scroll categories right"
              className="absolute right-0 top-0 bottom-0 z-10 w-8 flex items-center justify-center text-white bg-gradient-to-l from-brand to-brand/0"
            >
              <ChevronIcon direction="right" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <nav className="md:hidden border-t border-ink/10 bg-white px-4 py-3 flex flex-col gap-3 text-sm max-h-[calc(100vh-4rem)] overflow-y-auto">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Categories</p>
          <div className="flex flex-wrap gap-2 pb-2 border-b border-ink/10">
            {categories.map((c) => (
              <Link key={c.id} href={`/?category=${c.slug}`} onClick={closeMenu} className="chip">
                {c.name}
              </Link>
            ))}
          </div>
          <NavItem href="/" onClick={closeMenu} className="!px-0">
            Shop
          </NavItem>
          {session?.user?.role === "CUSTOMER" && (
            <NavItem href="/wishlist" onClick={closeMenu} className="!px-0">
              Wishlist {wishlistCount > 0 && <span className="ml-1 text-ink-faint">({wishlistCount})</span>}
            </NavItem>
          )}
          {session?.user && (
            <NavItem href="/cart" onClick={closeMenu} className="!px-0">
              Cart {cartCount > 0 && <span className="ml-1 text-ink-faint">({cartCount})</span>}
            </NavItem>
          )}
          <div className="flex flex-col [&_a]:!px-0">{accountLinks}</div>
          <div className="border-t border-ink/10 pt-3 mt-1">
            {session?.user ? (
              <button
                onClick={() => {
                  closeMenu();
                  signOut({ callbackUrl: "/" });
                }}
                className="w-full text-left rounded-lg border border-ink/15 px-3 py-2 text-ink-muted hover:border-ink/30"
              >
                Sign out
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <Link href="/login" onClick={closeMenu} className="text-ink-muted hover:text-brand-dark">
                  Log in
                </Link>
                <Link
                  href="/register"
                  onClick={closeMenu}
                  className="rounded-lg bg-brand text-white px-3 py-2 text-center hover:bg-brand-dark"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
