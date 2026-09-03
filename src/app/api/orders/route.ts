import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";

/**
 * GET /api/orders
 * - Customers see their own parent orders (with all vendor sub-orders).
 * - Vendors see only the VendorOrder rows that belong to them.
 * - Admins see every parent order.
 */
export async function GET() {
  try {
    const user = await requireUser();

    if (user.role === "CUSTOMER") {
      const orders = await prisma.order.findMany({
        where: { customerId: user.id },
        orderBy: { createdAt: "desc" },
        include: {
          vendorOrders: {
            include: { vendor: { select: { storeName: true } }, items: true },
          },
          payment: true,
        },
      });
      return NextResponse.json(orders);
    }

    if (user.role === "VENDOR") {
      const vendorOrders = await prisma.vendorOrder.findMany({
        where: { vendorId: user.vendorId ?? "" },
        orderBy: { createdAt: "desc" },
        include: {
          items: true,
          order: { select: { orderNumber: true, createdAt: true, customer: { select: { name: true } } } },
        },
      });
      return NextResponse.json(vendorOrders);
    }

    // ADMIN
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        customer: { select: { name: true, email: true } },
        vendorOrders: { include: { vendor: { select: { storeName: true } } } },
        payment: true,
      },
    });
    return NextResponse.json(orders);
  } catch (err) {
    return handleApiError(err);
  }
}
