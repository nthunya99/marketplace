import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-utils";

/**
 * GET /api/products/trending — rule-based "trending" (spec section 22):
 * most-ordered products in the last 30 days. A real ranking model is a
 * documented Phase 4 extension; this stays a fast, honest query rather
 * than faking a trend with random ordering.
 */
export async function GET() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const items = await prisma.orderItem.findMany({
      where: { vendorOrder: { createdAt: { gte: thirtyDaysAgo }, status: { not: "CANCELLED" } } },
      select: { productId: true, quantity: true },
    });

    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.productId, (counts.get(item.productId) ?? 0) + item.quantity);

    const topIds = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([id]) => id);

    if (topIds.length === 0) return NextResponse.json([]);

    const products = await prisma.product.findMany({
      where: { id: { in: topIds }, status: "PUBLISHED" },
      include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, vendor: { select: { storeName: true } } },
    });
    const ordered = topIds.map((id) => products.find((p) => p.id === id)).filter((p): p is (typeof products)[number] => !!p);

    return NextResponse.json(ordered);
  } catch (err) {
    return handleApiError(err);
  }
}
