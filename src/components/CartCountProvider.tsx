"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type CartCounts = {
  cartCount: number;
  wishlistCount: number;
  /** Re-fetch both counters from the server — call after any add/remove. */
  refreshCounts: () => void;
};

const CartCountContext = createContext<CartCounts>({
  cartCount: 0,
  wishlistCount: 0,
  refreshCounts: () => {},
});

/**
 * Keeps the header's cart/wishlist item counters in sync no matter where
 * an add-to-cart or add-to-wishlist action happens — the homepage grid,
 * a product detail page, or the cart page itself. Rather than threading
 * counts through props, any component can call refreshCounts() after a
 * mutation and the header updates immediately.
 */
export function CartCountProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);

  const refreshCounts = useCallback(() => {
    if (!session?.user || session.user.role !== "CUSTOMER") {
      setCartCount(0);
      setWishlistCount(0);
      return;
    }
    fetch("/api/cart")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        const items: { quantity: number }[] = d.items ?? [];
        setCartCount(items.reduce((n, i) => n + i.quantity, 0));
      })
      .catch(() => {});
    fetch("/api/wishlist")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setWishlistCount(Array.isArray(d) ? d.length : 0))
      .catch(() => {});
  }, [session?.user]);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  return (
    <CartCountContext.Provider value={{ cartCount, wishlistCount, refreshCounts }}>
      {children}
    </CartCountContext.Provider>
  );
}

export function useCartCounts() {
  return useContext(CartCountContext);
}
