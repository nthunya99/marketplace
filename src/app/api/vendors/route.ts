import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";

/**
 * GET /api/vendors?status=PENDING
 * Admin-only listing used by the vendor-approval dashboard.
 * Public storefront vendor listing (approved-only) is intentionally a
 * separate, unauthenticated concern — not implemented on this route so we
 * never accidentally leak PENDING/REJECTED vendors to shoppers.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");
    const status = req.nextUrl.searchParams.get("status");

    const vendors = await prisma.vendorProfile.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        user: { select: { id: true, name: true, email: true, createdAt: true } },
        _count: { select: { products: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(vendors);
  } catch (err) {
    return handleApiError(err);
  }
}
