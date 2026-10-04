import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Page-level route guard (defense in depth on top of the per-route
 * `requireRole` checks in every API handler — the API checks are the
 * real authorization boundary; this just avoids flashing protected UI to
 * the wrong role before a redirect).
 */
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    if (path.startsWith("/vendor") && token?.role !== "VENDOR") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (path.startsWith("/admin") && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ["/vendor/:path*", "/admin/:path*"],
};
