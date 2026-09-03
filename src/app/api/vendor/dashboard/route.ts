import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";

export async function GET() {
  try {
    const user = await requireRole("VENDOR");
    if (!user.vendorId) throw new BusinessError("Vendor profile not found");

    const [vendor, wallet, productCount, vendorOrders] = await Promise.all([
      prisma.vendorProfile.findUnique({ where: { id: user.vendorId } }),
      prisma.vendorWallet.findUnique({ where: { vendorId: user.vendorId } }),
      prisma.product.count({ where: { vendorId: user.vendorId } }),
      prisma.vendorOrder.findMany({
        where: { vendorId: user.vendorId },
        select: { status: true, subtotal: true, createdAt: true },
      }),
    ]);

    const totalSales = vendorOrders
      .filter((o) => o.status !== "CANCELLED")
      .reduce((sum, o) => sum + Number(o.subtotal), 0);

    return NextResponse.json({
      vendor,
      wallet,
      productCount,
      orderCount: vendorOrders.length,
      totalSales,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
