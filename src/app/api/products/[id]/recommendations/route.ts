import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, BusinessError } from "@/lib/api-utils";

/**
 * GET /api/products/[id]/recommendations
 * Rule-based recommendations (spec section 22): "similar products" (same
 * category) and "customers also bought" (co-occurrence in past orders).
 * Deliberately simple, deterministic SQL-free logic — the spec explicitly
 * asks to "start with rule-based recommendations and structure the code
 * so an AI/ML recommendation engine can be integrated later"; swapping
 * this function's body for a model call wouldn't change its callers.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const product = await prisma.product.findFirst({
      where: { OR: [{ id: params.id }, { slug: params.id }] },
    });
    if (!product) throw new BusinessError("Product not found");

    const similar = await prisma.product.findMany({
      where: { categoryId: product.categoryId, id: { not: product.id }, status: "PUBLISHED" },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, vendor: { select: { storeName: true } } },
    });

    // "Customers also bought": find vendor orders that included this
    // product, then count which other products appeared in those same
    // vendor orders.
    const coOccurringVendorOrders = await prisma.orderItem.findMany({
      where: { productId: product.id },
      select: { vendorOrderId: true },
      take: 200,
    });
    const vendorOrderIds = coOccurringVendorOrders.map((o) => o.vendorOrderId);

    let alsoBought: typeof similar = [];
    if (vendorOrderIds.length > 0) {
      const coItems = await prisma.orderItem.findMany({
        where: { vendorOrderId: { in: vendorOrderIds }, productId: { not: product.id } },
        select: { productId: true },
      });
      const counts = new Map<string, number>();
      for (const item of coItems) counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
      const topIds = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => id);

      if (topIds.length > 0) {
        const products = await prisma.product.findMany({
          where: { id: { in: topIds }, status: "PUBLISHED" },
          include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, vendor: { select: { storeName: true } } },
        });
        // Preserve the co-occurrence-frequency order.
        alsoBought = topIds
          .map((id) => products.find((p) => p.id === id))
          .filter((p): p is (typeof products)[number] => !!p);
      }
    }

    return NextResponse.json({ similar, alsoBought });
  } catch (err) {
    return handleApiError(err);
  }
}
