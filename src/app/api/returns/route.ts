import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/auth-utils";
import { returnRequestSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { notify } from "@/lib/notifications";

/**
 * GET /api/returns — scoped like orders: customers see their own return
 * requests, vendors see requests against their vendor orders, admins see
 * everything.
 */
export async function GET() {
  try {
    const user = await requireUser();

    if (user.role === "CUSTOMER") {
      const returns = await prisma.returnRequest.findMany({
        where: { customerId: user.id },
        orderBy: { createdAt: "desc" },
        include: { orderItem: true, vendorOrder: { include: { vendor: { select: { storeName: true } } } } },
      });
      return NextResponse.json(returns);
    }

    if (user.role === "VENDOR") {
      const returns = await prisma.returnRequest.findMany({
        where: { vendorOrder: { vendorId: user.vendorId ?? "" } },
        orderBy: { createdAt: "desc" },
        include: { orderItem: true, customer: { select: { name: true } } },
      });
      return NextResponse.json(returns);
    }

    const returns = await prisma.returnRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        orderItem: true,
        customer: { select: { name: true } },
        vendorOrder: { include: { vendor: { select: { storeName: true } } } },
      },
    });
    return NextResponse.json(returns);
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/returns — customer opens a return/refund request against a
 * specific order item (spec section 13). Only allowed on items belonging
 * to the requesting customer, and only once the vendor order has actually
 * been delivered (you can't return something that hasn't arrived).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("CUSTOMER");
    const data = returnRequestSchema.parse(await req.json());

    const orderItem = await prisma.orderItem.findUnique({
      where: { id: data.orderItemId },
      include: { vendorOrder: { include: { order: true, vendor: true } } },
    });
    if (!orderItem) throw new BusinessError("Order item not found");
    if (orderItem.vendorOrder.order.customerId !== user.id) {
      throw new BusinessError("You do not have permission to request a return for this item.");
    }
    if (orderItem.vendorOrder.status !== "DELIVERED") {
      throw new BusinessError("Returns can only be requested for delivered orders.");
    }

    const existing = await prisma.returnRequest.findFirst({
      where: { orderItemId: data.orderItemId, status: { notIn: ["REJECTED", "REFUNDED"] } },
    });
    if (existing) throw new BusinessError("A return request for this item is already in progress.");

    const returnRequest = await prisma.returnRequest.create({
      data: {
        vendorOrderId: orderItem.vendorOrderId,
        orderItemId: orderItem.id,
        customerId: user.id,
        reason: data.reason,
        description: data.description,
        images: data.images ?? [],
        status: "REQUESTED",
      },
    });

    await notify(prisma, {
      userId: orderItem.vendorOrder.vendor.userId,
      type: "RETURN_REQUEST",
      title: "New return request",
      message: `A customer requested a return for "${orderItem.productNameSnapshot}".`,
      linkUrl: "/vendor/returns",
    });

    return NextResponse.json(returnRequest, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
