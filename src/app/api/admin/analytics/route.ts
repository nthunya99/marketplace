import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";
import { resolveDateRange } from "@/lib/date-range";

/**
 * GET /api/admin/analytics?range=...&from&to
 * Spec section 20: marketplace-wide totals, sales-by-category, sales-by-
 * vendor, best sellers, and new customer/vendor counts, all scoped to the
 * date range.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");
    const sp = req.nextUrl.searchParams;
    const { from, to } = resolveDateRange(sp.get("range"), sp.get("from"), sp.get("to"));

    const [orders, newCustomers, newVendors, failedPayments] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
        include: { vendorOrders: { include: { vendor: { select: { storeName: true } }, items: true } } },
      }),
      prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: from, lte: to } } }),
      prisma.vendorProfile.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: from, lte: to } } }),
    ]);

    let grossSales = 0;
    let platformCommission = 0;
    let vendorEarnings = 0;
    let refunds = 0;
    const byDay = new Map<string, number>();
    const byVendor = new Map<string, number>();
    const byCategory = new Map<string, number>();
    const productCounts = new Map<string, { name: string; quantity: number }>();

    for (const order of orders) {
      grossSales += Number(order.grandTotal);
      const key = order.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + Number(order.grandTotal));

      for (const vo of order.vendorOrders) {
        platformCommission += Number(vo.commissionAmount);
        vendorEarnings += Number(vo.vendorEarnings);
        refunds += Number(vo.refundedAmount);
        byVendor.set(vo.vendor.storeName, (byVendor.get(vo.vendor.storeName) ?? 0) + Number(vo.subtotal));

        for (const item of vo.items) {
          const existing = productCounts.get(item.productId);
          if (existing) existing.quantity += item.quantity;
          else productCounts.set(item.productId, { name: item.productNameSnapshot, quantity: item.quantity });
        }
      }
    }

    // Sales by category requires a join back to Product; do it in one
    // extra query rather than N+1 per item.
    const productIds = Array.from(productCounts.keys());
    if (productIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { category: { select: { name: true } } },
      });
      const categoryByProduct = new Map(products.map((p) => [p.id, p.category.name]));
      for (const [productId, { quantity }] of productCounts) {
        const catName = categoryByProduct.get(productId) ?? "Uncategorized";
        byCategory.set(catName, (byCategory.get(catName) ?? 0) + quantity);
      }
    }

    const payouts = await prisma.payout.aggregate({
      where: { processedAt: { gte: from, lte: to }, status: "COMPLETED" },
      _sum: { amount: true },
    });

    const salesOverTime = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }));
    const salesByVendor = Array.from(byVendor.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, total]) => ({ name, total }));
    const salesByCategory = Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, quantity]) => ({ name, quantity }));
    const bestSellers = Array.from(productCounts.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    return NextResponse.json({
      range: { from, to },
      grossSales,
      platformCommission,
      vendorEarnings,
      refunds,
      payouts: Number(payouts._sum.amount ?? 0),
      failedPayments,
      newCustomers,
      newVendors,
      orderCount: orders.length,
      salesOverTime,
      salesByVendor,
      salesByCategory,
      bestSellers,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
