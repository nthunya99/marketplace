import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { vendorOrderStatusSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { notify } from "@/lib/notifications";
import { isDirectPaymentMethod } from "@/lib/commission";

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

    // A manual-payment order can only leave PENDING via a confirmed proof
    // of payment (see /api/vendor-orders/[id]/proof/[proofId]/confirm),
    // which is also what credits the vendor's wallet. Allowing it here
    // too would let a vendor (or admin) mark an order CONFIRMED without
    // that credit ever happening — silently breaking the wallet ledger.
    if (
      vendorOrder.paymentMethod === "manual" &&
      vendorOrder.status === "PENDING" &&
      status === "CONFIRMED"
    ) {
      throw new BusinessError(
        "This is a manual-payment order — confirm it by reviewing the customer's uploaded proof of payment, not by changing status directly."
      );
    }

    // An order the customer hasn't chosen a payment method for yet has
    // nothing to confirm against.
    if (vendorOrder.paymentMethod === "unselected" && vendorOrder.status === "PENDING" && status === "CONFIRMED") {
      throw new BusinessError(
        "The customer hasn't paid for this order yet — it confirms once their payment is received."
      );
    }

    // Same rule for M-Pesa: the order confirms itself when the payment
    // succeeds, which is also what records the commission owed.
    if (
      (vendorOrder.paymentMethod === "mpesa" || vendorOrder.paymentMethod === "mopay") &&
      vendorOrder.status === "PENDING" &&
      status === "CONFIRMED"
    ) {
      throw new BusinessError(
        "This order is paid online — it confirms automatically when the customer's payment goes through."
      );
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

      // Direct payments (vendor already holds the money) never entered
      // pendingBalance, so there is nothing to release on delivery.
      if (
        status === "DELIVERED" &&
        vendorOrder.status !== "DELIVERED" &&
        !isDirectPaymentMethod(vendorOrder.paymentMethod)
      ) {
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
