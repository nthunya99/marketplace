"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

function NavLink({
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
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`text-ink-muted hover:text-brand-dark transition-colors ${className}`}
    >
      {children}
    </Link>
  );
}

// A small woven-basket mark — nods to a market stall rather than a
// generic shopping-bag/cart glyph.
function Logomark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path
        d="M5 10.5L6.4 20.2C6.6 21.7 7.9 22.8 9.4 22.8H16.6C18.1 22.8 19.4 21.7 19.6 20.2L21 10.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 10.5H22.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8.5 10.5C8.5 6.9 10.4 3.5 13 3.5C15.6 3.5 17.5 6.9 17.5 10.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Navbar() {
  const { data: session } = useSession();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setUnread(d.unreadCount ?? 0))
      .catch(() => {});
  }, [session?.user]);

  // Close the mobile menu automatically whenever the route changes, so a
  // tapped link doesn't leave the overlay open on top of the new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const closeMenu = () => setMenuOpen(false);

  const links = (
    <>
      <NavLink href="/" onClick={closeMenu}>
        Shop
      </NavLink>
      {session?.user && (
        <NavLink href="/orders" onClick={closeMenu}>
          My Orders
        </NavLink>
      )}
      {session?.user?.role === "CUSTOMER" && (
        <NavLink href="/wishlist" onClick={closeMenu}>
          Wishlist
        </NavLink>
      )}
      {session?.user?.role === "CUSTOMER" && (
        <NavLink href="/loyalty" onClick={closeMenu}>
          Rewards
        </NavLink>
      )}
      {session?.user?.role === "CUSTOMER" && (
        <NavLink href="/messages" onClick={closeMenu}>
          Messages
        </NavLink>
      )}
      {session?.user?.role === "CUSTOMER" && (
        <NavLink href="/support" onClick={closeMenu}>
          Support
        </NavLink>
      )}
      {session?.user && (
        <NavLink href="/cart" onClick={closeMenu}>
          Cart
        </NavLink>
      )}
      {session?.user && (
        <NavLink href="/notifications" onClick={closeMenu} className="relative">
          Notifications
          {unread > 0 && (
            <span className="ml-1.5 md:ml-0 md:absolute md:-top-2 md:-right-3 inline-block bg-accent text-white text-[10px] rounded-full px-1.5 py-0.5">
              {unread}
            </span>
          )}
        </NavLink>
      )}
      {session?.user?.role === "VENDOR" && (
        <NavLink href="/vendor/dashboard" onClick={closeMenu}>
          Vendor Dashboard
        </NavLink>
      )}
      {session?.user?.role === "ADMIN" && (
        <NavLink href="/admin/dashboard" onClick={closeMenu}>
          Admin
        </NavLink>
      )}
    </>
  );

  return (
    <header className="border-b border-ink/10 bg-white/90 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-brand hover:text-brand-dark transition-colors"
          onClick={closeMenu}
        >
          <Logomark />
          <span className="font-display font-semibold text-xl tracking-tight text-ink">Marketplace</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-5 text-sm">
          {links}
          {session?.user ? (
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="ml-1 rounded-lg border border-ink/15 px-3 py-1.5 text-ink-muted hover:border-ink/30 hover:text-ink transition-colors"
            >
              Sign out
            </button>
          ) : (
            <>
              <Link href="/login" className="ml-1 text-ink-muted hover:text-brand-dark transition-colors">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-brand text-white px-4 py-1.5 hover:bg-brand-dark transition-colors"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>

        {/* Mobile: cart + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          {session?.user && (
            <Link href="/cart" className="text-sm text-ink-muted" onClick={closeMenu} aria-label="Cart">
              Cart
            </Link>
          )}
          <button
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="w-10 h-10 flex items-center justify-center rounded-lg border border-ink/15 relative text-ink"
          >
            {unread > 0 && !menuOpen && (
              <span className="absolute -top-1 -right-1 bg-accent text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
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

      {/* Mobile menu panel */}
      {menuOpen && (
        <nav className="md:hidden border-t border-ink/10 bg-white px-4 py-3 flex flex-col gap-3 text-sm max-h-[calc(100vh-4rem)] overflow-y-auto">
          {links}
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
