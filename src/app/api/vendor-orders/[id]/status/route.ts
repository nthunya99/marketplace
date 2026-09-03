import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { vendorOrderStatusSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { notify } from "@/lib/notifications";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

/**
 * PATCH /api/vendor-orders/[id]/status
 * A vendor may only update their own vendor order (never another
 * vendor's), and only via a valid status transition (spec section 11).
 * When a vendor order transitions to DELIVERED, that vendor's pending
 * earnings for this order move into their *available* balance — i.e. the
 * moment in the flow diagram (section 38) where "Vendor Earnings Become
 * Available".
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("VENDOR", "ADMIN");
    const { status, trackingNumber } = vendorOrderStatusSchema.parse(await req.json());

    const vendorOrder = await prisma.vendorOrder.findUnique({
      where: { id: params.id },
      include: { order: { select: { customerId: true, orderNumber: true, id: true } } },
    });
    if (!vendorOrder) throw new BusinessError("Vendor order not found");

    if (user.role === "VENDOR" && vendorOrder.vendorId !== user.vendorId) {
      throw new BusinessError("You do not have permission to update this order.");
    }

    if (user.role === "VENDOR" && !ALLOWED_TRANSITIONS[vendorOrder.status]?.includes(status)) {
      throw new BusinessError(`Cannot move an order from ${vendorOrder.status} to ${status}.`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.vendorOrder.update({
        where: { id: params.id },
        data: {
          status,
          trackingNumber: trackingNumber ?? vendorOrder.trackingNumber,
          courierProvider: trackingNumber ? process.env.COURIER_PROVIDER ?? "mock" : undefined,
        },
      });

      if (status === "DELIVERED" && vendorOrder.status !== "DELIVERED") {
        await tx.vendorWallet.update({
          where: { vendorId: vendorOrder.vendorId },
          data: {
            pendingBalance: { decrement: vendorOrder.vendorEarnings },
            availableBalance: { increment: vendorOrder.vendorEarnings },
          },
        });
      }

      await notify(tx, {
        userId: vendorOrder.order.customerId,
        type: "ORDER_STATUS",
        title: "Order status updated",
        message: `Order ${vendorOrder.order.orderNumber}: an item's status changed to ${status}${
          trackingNumber ? ` (tracking: ${trackingNumber})` : ""
        }.`,
        linkUrl: `/orders/${vendorOrder.order.id}`,
      });
    });

    const updated = await prisma.vendorOrder.findUnique({ where: { id: params.id } });
    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
