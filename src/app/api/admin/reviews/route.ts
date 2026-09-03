import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";

/**
 * GET /api/admin/reviews?type=product|vendor&status=PENDING
 * Feeds the admin moderation queue. Defaults to pending + reported items
 * from both review types when no filters are given.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");
    const sp = req.nextUrl.searchParams;
    const type = sp.get("type");
    const status = sp.get("status") as any;

    const productReviews =
      type === "vendor"
        ? []
        : await prisma.productReview.findMany({
            where: status ? { status } : { OR: [{ status: "PENDING" }, { reportCount: { gt: 0 } }] },
            include: {
              user: { select: { name: true } },
              product: { select: { name: true, slug: true } },
            },
            orderBy: { createdAt: "desc" },
          });

    const vendorReviews =
      type === "product"
        ? []
        : await prisma.vendorReview.findMany({
            where: status ? { status } : { OR: [{ status: "PENDING" }, { reportCount: { gt: 0 } }] },
            include: {
              user: { select: { name: true } },
              vendor: { select: { storeName: true } },
            },
            orderBy: { createdAt: "desc" },
          });

    return NextResponse.json({ productReviews, vendorReviews });
  } catch (err) {
    return handleApiError(err);
  }
}
