import type { Prisma } from "@prisma/client";
import { recordDirectVendorPayment } from "@/lib/commission";
import { earnLoyaltyPoints } from "@/lib/loyalty";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

/**
 * Marks a vendor order as paid after the vendor received the money
 * directly (M-Pesa via the vendor's own API connection, or the vendor's
 * own MoPay account). Mirrors
 * the manual-payment confirm route — order status, loyalty, parent order
 * roll-up, audit, notifications — except that the ledger entry is
 * recordDirectVendorPayment (commission owed), not a wallet credit.
 *
 * Idempotent: the PENDING → CONFIRMED update is conditional, so two
 * concurrent confirmations (e.g. a push response and a status check
 * racing) can only apply the financial effects once. Returns false if the
 * order had already left PENDING.
 */
export async function confirmDirectVendorOrderPayment(
  tx: Prisma.TransactionClient,
  params: {
    vendorOrderId: string;
    actor: { id: string; email?: string | null };
    method: string;
    /** How it was paid, for messages: "M-Pesa", "EcoCash", "card"… */
    methodLabel: string;
    reference: string;
  }
): Promise<boolean> {
  // paymentMethod is (re)written too: the customer can switch methods
  // after checkout, so if an earlier online session is completed after a
  // switch, the order must still record how it was actually paid.
  const moved = await tx.vendorOrder.updateMany({
    where: { id: params.vendorOrderId, status: "PENDING" },
    data: { status: "CONFIRMED", paymentMethod: params.method },
  });
  if (moved.count === 0) return false;

  const vendorOrder = await tx.vendorOrder.findUniqueOrThrow({
    where: { id: params.vendorOrderId },
    include: { order: { include: { payment: true } }, vendor: true },
  });

  await recordDirectVendorPayment(tx, {
    vendorId: vendorOrder.vendorId,
    vendorEarnings: vendorOrder.vendorEarnings,
    commissionAmount: vendorOrder.commissionAmount,
  });

  if (vendorOrder.vendor.participatesInLoyalty) {
    await earnLoyaltyPoints(tx, vendorOrder.order.customerId, vendorOrder.subtotal, vendorOrder.orderId);
  }

  const siblings = await tx.vendorOrder.findMany({ where: { orderId: vendorOrder.orderId } });
  if (siblings.every((vo) => vo.status !== "PENDING")) {
    await tx.order.update({ where: { id: vendorOrder.orderId }, data: { status: "CONFIRMED" } });
    if (vendorOrder.order.payment) {
      await tx.payment.update({ where: { id: vendorOrder.order.payment.id }, data: { status: "CONFIRMED" } });
    }
  }

  await recordAudit(tx, {
    actorId: params.actor.id,
    actorEmail: params.actor.email ?? undefined,
    action: "DIRECT_PAYMENT_CONFIRMED",
    entityType: "VendorOrder",
    entityId: vendorOrder.id,
    newValue: {
      method: params.method,
      reference: params.reference,
      amount: vendorOrder.subtotal.toString(),
      commissionOwed: vendorOrder.commissionAmount.toString(),
    },
  });

  const shortRef = vendorOrder.order.orderNumber;
  await notify(tx, {
    userId: vendorOrder.order.customerId,
    type: "ORDER_STATUS",
    title: "Payment received",
    message: `Your ${params.methodLabel} payment to ${vendorOrder.vendor.storeName} for order ${shortRef} went through. They'll start processing it.`,
    linkUrl: `/orders/${vendorOrder.orderId}`,
  });
  await notify(tx, {
    userId: vendorOrder.vendor.userId,
    type: "ORDER_STATUS",
    title: `${params.methodLabel} payment received`,
    message: `The customer paid ${vendorOrder.subtotal} by ${params.methodLabel} for order ${shortRef} (ref ${params.reference}). It's ready to process.`,
    linkUrl: "/vendor/orders",
  });

  return true;
}
