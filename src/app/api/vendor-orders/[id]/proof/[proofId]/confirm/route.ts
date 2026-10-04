import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { notify } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import { creditVendorWallet } from "@/lib/commission";
import { earnLoyaltyPoints } from "@/lib/loyalty";

/**
 * POST /api/vendor-orders/[id]/proof/[proofId]/confirm
 * The moment a manual-payment vendor order actually becomes "paid" from
 * the platform's point of view — a vendor (or admin, for disputes)
 * reviewing the uploaded evidence and saying so. This is the manual-
 * payment counterpart to a successful card charge in /api/checkout: it
 * credits the vendor's wallet, awards the customer loyalty points (on
 * this vendor order's own subtotal, since different vendor orders in the
 * same purchase can confirm at different times), and moves the vendor
 * order from PENDING to CONFIRMED so the vendor can start processing it.
 * If every vendor order on the parent Order is now paid, the parent
 * Order and its Payment record are marked CONFIRMED too.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string; proofId: string } }
) {
  try {
    const user = await requireRole("VENDOR", "ADMIN");

    const vendorOrder = await prisma.vendorOrder.findUnique({
      where: { id: params.id },
      include: { order: { include: { payment: true, vendorOrders: true } }, vendor: true },
    });
    if (!vendorOrder) throw new BusinessError("Order not found");
    if (user.role === "VENDOR" && vendorOrder.vendorId !== user.vendorId) {
      throw new BusinessError("You do not have permission to confirm payment for this order.");
    }
    if (vendorOrder.paymentMethod !== "manual") {
      throw new BusinessError("This order isn't a manual-payment order.");
    }
    if (vendorOrder.status !== "PENDING") {
      throw new BusinessError("This order has already moved past awaiting payment.");
    }

    const proof = await prisma.proofOfPayment.findUnique({ where: { id: params.proofId } });
    if (!proof || proof.vendorOrderId !== params.id) throw new BusinessError("Proof of payment not found");
    if (proof.status !== "PENDING") {
      throw new BusinessError("This proof of payment has already been reviewed.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.proofOfPayment.update({
        where: { id: proof.id },
        data: { status: "CONFIRMED", reviewedAt: new Date(), reviewedBy: user.id },
      });

      await tx.vendorOrder.update({ where: { id: vendorOrder.id }, data: { status: "CONFIRMED" } });

      await creditVendorWallet(tx, {
        vendorId: vendorOrder.vendorId,
        vendorEarnings: vendorOrder.vendorEarnings,
        commissionAmount: vendorOrder.commissionAmount,
      });

      // Loyalty points on this vendor order's own subtotal — the closest
      // approximation to "points on the amount actually paid" available
      // when different vendor orders in the same purchase confirm at
      // different times. Skipped entirely if this vendor has turned
      // loyalty participation off for their store.
      if (vendorOrder.vendor.participatesInLoyalty) {
        await earnLoyaltyPoints(tx, vendorOrder.order.customerId, vendorOrder.subtotal, vendorOrder.orderId);
      }

      // If every vendor order on this parent Order has now been paid
      // (confirmed, or further along), the whole order — and its
      // Payment record — can graduate out of "awaiting payment".
      const siblingOrders = await tx.vendorOrder.findMany({ where: { orderId: vendorOrder.orderId } });
      const allPaid = siblingOrders.every((vo) => vo.id === vendorOrder.id || vo.status !== "PENDING");
      if (allPaid) {
        await tx.order.update({ where: { id: vendorOrder.orderId }, data: { status: "CONFIRMED" } });
        if (vendorOrder.order.payment) {
          await tx.payment.update({
            where: { id: vendorOrder.order.payment.id },
            data: { status: "CONFIRMED" },
          });
        }
      }

      await recordAudit(tx, {
        actorId: user.id,
        actorEmail: user.email,
        action: "MANUAL_PAYMENT_CONFIRMED",
        entityType: "VendorOrder",
        entityId: vendorOrder.id,
        newValue: { proofId: proof.id, vendorEarnings: vendorOrder.vendorEarnings.toString() },
      });

      await notify(tx, {
        userId: vendorOrder.order.customerId,
        type: "PAYMENT_PROOF",
        title: "Payment confirmed",
        message: `${vendorOrder.vendor.storeName} confirmed your payment for order ${vendorOrder.orderId.slice(-8)}. They'll begin processing it.`,
        linkUrl: `/orders/${vendorOrder.orderId}`,
      });
    });

    const updated = await prisma.vendorOrder.findUnique({ where: { id: vendorOrder.id } });
    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
