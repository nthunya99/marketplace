import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { resolveDateRange } from "@/lib/date-range";

/**
 * GET /api/vendor/analytics?range=last30days|today|last7days|thisMonth|previousMonth|custom&from&to
 * Spec section 19: sales/revenue/orders/products-sold, best sellers,
 * sales-over-time series, and earnings/payout figures, filterable by the
 * standard date presets. Product view counts and conversion rate would
 * need a page-view tracking table this build doesn't add yet (documented
 * in the README) — everything else here is computed from real orders.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole("VENDOR");
    if (!user.vendorId) throw new BusinessError("Vendor profile not found");

    const sp = req.nextUrl.searchParams;
    const { from, to } = resolveDateRange(sp.get("range"), sp.get("from"), sp.get("to"));

    const vendorOrders = await prisma.vendorOrder.findMany({
      where: { vendorId: user.vendorId, createdAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      include: { items: true },
    });

    const revenue = vendorOrders.reduce((sum, vo) => sum + Number(vo.subtotal), 0);
    const orderCount = vendorOrders.length;
    const productsSold = vendorOrders.reduce(
      (sum, vo) => sum + vo.items.reduce((s, i) => s + i.quantity, 0),
      0
    );
    const averageOrderValue = orderCount > 0 ? revenue / orderCount : 0;

    // Sales-over-time: bucket by day.
    const byDay = new Map<string, number>();
    for (const vo of vendorOrders) {
      const key = vo.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + Number(vo.subtotal));
    }
    const salesOverTime = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }));

    // Best-selling products within this range.
    const productCounts = new Map<string, { name: string; quantity: number }>();
    for (const vo of vendorOrders) {
      for (const item of vo.items) {
        const existing = productCounts.get(item.productId);
        if (existing) existing.quantity += item.quantity;
        else productCounts.set(item.productId, { name: item.productNameSnapshot, quantity: item.quantity });
      }
    }
    const bestSellers = Array.from(productCounts.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const wallet = await prisma.vendorWallet.findUnique({ where: { vendorId: user.vendorId } });
    const payouts = await prisma.payout.findMany({
      where: { vendorId: user.vendorId },
      orderBy: { requestedAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      range: { from, to },
      revenue,
      orderCount,
      productsSold,
      averageOrderValue,
      salesOverTime,
      bestSellers,
      pendingEarnings: wallet?.pendingBalance ?? 0,
      availableEarnings: wallet?.availableBalance ?? 0,
      commissionPaid: wallet?.totalCommission ?? 0,
      payoutHistory: payouts,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
