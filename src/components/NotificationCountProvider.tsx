"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

type NotificationCount = {
  unread: number;
  /** Re-fetch the unread count from the server. */
  refreshUnread: () => void;
  /** Set the header badge to zero immediately (e.g. after mark-all-read). */
  clearUnread: () => void;
};

const NotificationCountContext = createContext<NotificationCount>({
  unread: 0,
  refreshUnread: () => {},
  clearUnread: () => {},
});

const POLL_MS = 60_000;

/**
 * Single source of truth for the header's unread-notification badge, the
 * same pattern as CartCountProvider. The notifications page calls
 * clearUnread() once it has marked everything read, so the badge drops to
 * zero the moment the page opens instead of waiting for a reload.
 *
 * The count also refreshes on every navigation and once a minute, so new
 * notifications show up without a manual refresh.
 */
export function NotificationCountProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const signedIn = !!session?.user;

  const refreshUnread = useCallback(() => {
    if (!signedIn) {
      setUnread(0);
      return;
    }
    fetch("/api/notifications?countOnly=true")
      .then((r) => (r.ok ? r.json() : { unreadCount: 0 }))
      .then((d) => setUnread(d.unreadCount ?? 0))
      .catch(() => {});
  }, [signedIn]);

  const clearUnread = useCallback(() => setUnread(0), []);

  // On sign-in/out and on every page change. The notifications page itself
  // is skipped: it marks everything read and clears the badge, and a
  // refresh racing that request could briefly bring the old count back.
  useEffect(() => {
    if (pathname === "/notifications") return;
    refreshUnread();
  }, [refreshUnread, pathname]);

  useEffect(() => {
    if (!signedIn) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refreshUnread();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [signedIn, refreshUnread]);

  return (
    <NotificationCountContext.Provider value={{ unread, refreshUnread, clearUnread }}>
      {children}
    </NotificationCountContext.Provider>
  );
}

export function useNotificationCount() {
  return useContext(NotificationCountContext);
}
