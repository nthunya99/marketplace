import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Page-level route guard (defense in depth on top of the per-route
 * `requireRole` checks in every API handler — the API checks are the
 * real authorization boundary; this just avoids flashing protected UI to
 * the wrong role before a redirect).
 *
 * Signed out → /login?callbackUrl=<page>, so the user lands back where
 * they were going after logging in.
 * Signed in with the wrong account type (e.g. a customer opening an old
 * /vendor tab) → /login?callbackUrl=<page>&reason=role, where the login
 * page explains which account they're in and offers to switch, instead of
 * showing a bare login form to someone who's already logged in.
 */
const AREA_ROLE: { prefix: string; role: string }[] = [
  { prefix: "/vendor", role: "VENDOR" },
  { prefix: "/admin", role: "ADMIN" },
];

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    const area = AREA_ROLE.find((a) => path === a.prefix || path.startsWith(a.prefix + "/"));
    if (area && token?.role !== area.role) {
      const url = new URL("/login", req.url);
      url.searchParams.set("callbackUrl", path + req.nextUrl.search);
      url.searchParams.set("reason", "role");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token && !token.revoked,
    },
  }
);

export const config = {
  matcher: ["/vendor/:path*", "/admin/:path*"],
};
