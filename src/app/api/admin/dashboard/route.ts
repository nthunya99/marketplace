import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    await requireRole("ADMIN");

    const [
      totalCustomers,
      totalVendors,
      activeVendors,
      pendingVendors,
      totalProducts,
      totalOrders,
      orders,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "CUSTOMER" } }),
      prisma.vendorProfile.count(),
      prisma.vendorProfile.count({ where: { status: "APPROVED" } }),
      prisma.vendorProfile.count({ where: { status: "PENDING" } }),
      prisma.product.count(),
      prisma.order.count(),
      prisma.order.findMany({
        where: { status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] } },
        include: { vendorOrders: true },
      }),
    ]);

    let grossSales = 0;
    let platformCommission = 0;
    let vendorEarnings = 0;
    for (const order of orders) {
      grossSales += Number(order.grandTotal);
      for (const vo of order.vendorOrders) {
        platformCommission += Number(vo.commissionAmount);
        vendorEarnings += Number(vo.vendorEarnings);
      }
    }

    return NextResponse.json({
      totalCustomers,
      totalVendors,
      activeVendors,
      pendingVendors,
      totalProducts,
      totalOrders,
      grossSales,
      platformCommission,
      vendorEarnings,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
