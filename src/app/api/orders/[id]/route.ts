import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        shippingAddress: true,
        payment: true,
        vendorOrders: {
          include: {
            vendor: { select: { storeName: true, id: true } },
            items: true,
          },
        },
      },
    });
    if (!order) throw new BusinessError("Order not found");

    const isOwner = user.role === "CUSTOMER" && order.customerId === user.id;
    const isAdmin = user.role === "ADMIN";
    const isInvolvedVendor =
      user.role === "VENDOR" && order.vendorOrders.some((vo) => vo.vendorId === user.vendorId);

    if (!isOwner && !isAdmin && !isInvolvedVendor) {
      throw new BusinessError("You do not have access to this order.");
    }

    // Vendors only ever see their own sub-order, never other vendors'
    // pricing/items within the same parent order.
    const scoped =
      user.role === "VENDOR"
        ? { ...order, vendorOrders: order.vendorOrders.filter((vo) => vo.vendorId === user.vendorId) }
        : order;

    return NextResponse.json(scoped);
  } catch (err) {
    return handleApiError(err);
  }
}
