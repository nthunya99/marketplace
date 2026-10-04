import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { returnDecisionSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { notify } from "@/lib/notifications";
import { getPaymentProvider } from "@/lib/payment";
import { recordAudit } from "@/lib/audit";
import { Decimal } from "@prisma/client/runtime/library";
import { isDirectPaymentMethod } from "@/lib/commission";
import { reversal, describeResponse, MpesaError } from "@/lib/mpesa/client";
import { vendorMpesaCredentials } from "@/lib/mpesa/vendor";

const ALLOWED: Record<string, string[]> = {
  REQUESTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["RETURN_IN_PROGRESS", "REFUND_PROCESSING"],
  RETURN_IN_PROGRESS: ["RETURNED"],
  RETURNED: ["REFUND_PROCESSING"],
  REFUND_PROCESSING: ["REFUNDED"],
  REJECTED: [],
  REFUNDED: [],
};

/**
 * PATCH /api/returns/[id]/status
 * Vendor or admin moves a return through its workflow (spec section 13).
 * The only step with real financial side effects is the transition into
 * REFUNDED — everything before that is just a status/communication trail.
 *
 * On REFUNDED (spec section 13's requirement that refunds "correctly
 * update customer payment, vendor balance, platform commission, and
 * financial transaction records"):
 *   1. Call the payment provider's refund for the (possibly partial) amount.
 *   2. Split that amount back into vendor-portion / commission-portion
 *      using the vendor order's original commission rate, and reverse both
 *      out of the vendor's wallet and the platform's recorded commission.
 *   3. Record a refund Transaction against the original Payment.
 *   4. Mark the parent Order REFUNDED or PARTIALLY_REFUNDED depending on
 *      whether every item in it has now been fully refunded.
 * All of this happens in one DB transaction.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("VENDOR", "ADMIN");
    const { status, adminResponse, refundAmount } = returnDecisionSchema.parse(await req.json());

    const existing = await prisma.returnRequest.findUnique({
      where: { id: params.id },
      include: {
        orderItem: true,
        vendorOrder: { include: { order: { include: { payment: true, vendorOrders: true } }, vendor: true } },
      },
    });
    if (!existing) throw new BusinessError("Return request not found");

    if (user.role === "VENDOR" && existing.vendorOrder.vendorId !== user.vendorId) {
      throw new BusinessError("You do not have permission to manage this return.");
    }
    if (!ALLOWED[existing.status]?.includes(status)) {
      throw new BusinessError(`Cannot move a return from ${existing.status} to ${status}.`);
    }

    const finalRefundAmount =
      status === "REFUNDED" ? new Decimal(refundAmount ?? Number(existing.orderItem.lineTotal)) : null;

    if (finalRefundAmount) {
      const alreadyRefundedOnItem = await prisma.returnRequest.aggregate({
        where: { orderItemId: existing.orderItemId, status: "REFUNDED" },
        _sum: { refundAmount: true },
      });
      const previouslyRefunded = new Decimal(alreadyRefundedOnItem._sum.refundAmount ?? 0);
      if (previouslyRefunded.add(finalRefundAmount).greaterThan(existing.orderItem.lineTotal)) {
        throw new BusinessError("Refund amount would exceed what the customer paid for this item.");
      }
    }

    // M-Pesa orders were paid into the vendor's own M-Pesa account, so the
    // refund is a reversal through the vendor's connection. It runs before
    // the DB transaction (it's an external call); if it fails, nothing is
    // marked refunded and the vendor sees why.
    let mpesaReversal: { txnId: string; transactionId: string } | null = null;
    if (finalRefundAmount && existing.vendorOrder.paymentMethod === "mpesa") {
      const paid = await prisma.mpesaTransaction.findFirst({
        where: { vendorOrderId: existing.vendorOrderId, status: "SUCCESS" },
        orderBy: { createdAt: "desc" },
      });
      if (!paid?.mpesaTransactionId) {
        throw new BusinessError("Couldn't find the M-Pesa payment for this order to reverse. Refund the customer directly and contact support.");
      }
      try {
        const result = await reversal(vendorMpesaCredentials(existing.vendorOrder.vendor), {
          transactionId: paid.mpesaTransactionId,
          amount: finalRefundAmount.toFixed(2),
        });
        if (!result.ok) {
          throw new BusinessError(`M-Pesa refused the reversal: ${describeResponse(result.responseCode, result.responseDesc)}`);
        }
      } catch (e) {
        if (e instanceof MpesaError) throw new BusinessError(`M-Pesa reversal failed: ${e.message}`);
        throw e;
      }
      const reversed = new Decimal(paid.reversedAmount).add(finalRefundAmount);
      await prisma.mpesaTransaction.update({
        where: { id: paid.id },
        data: {
          reversedAmount: reversed,
          status: reversed.greaterThanOrEqualTo(paid.amount) ? "REVERSED" : "SUCCESS",
        },
      });
      mpesaReversal = { txnId: paid.id, transactionId: paid.mpesaTransactionId };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const returnRequest = await tx.returnRequest.update({
        where: { id: params.id },
        data: {
          status,
          adminResponse: adminResponse ?? existing.adminResponse,
          refundAmount: finalRefundAmount ?? existing.refundAmount,
        },
      });

      if (status === "REFUNDED" && finalRefundAmount) {
        const vendorOrder = existing.vendorOrder;
        const commissionPortion = finalRefundAmount
          .mul(vendorOrder.commissionPercent)
          .div(100)
          .toDecimalPlaces(2);
        const vendorPortion = finalRefundAmount.sub(commissionPortion);

        // Reverse the payment with the provider.
        const payment = vendorOrder.order.payment;
        if (payment?.providerRef) {
          const provider = getPaymentProvider();
          const refundResult = await provider.refund({
            providerRef: payment.providerRef,
            amount: Number(finalRefundAmount),
            reason: existing.reason,
          });
          await tx.transaction.create({
            data: {
              paymentId: payment.id,
              type: "refund",
              amount: finalRefundAmount,
              status: refundResult.status,
              metaJson: { returnRequestId: returnRequest.id, providerRefundRef: refundResult.providerRefundRef },
            },
          });
        }

        // Reverse the vendor's wallet + the platform's recorded commission.
        // The order was DELIVERED to reach this point, so the vendor's
        // earnings for it are in `availableBalance`, not `pendingBalance`.
        // For direct payments (M-Pesa to the vendor) the earnings were never
        // in availableBalance; the refunded share of commission is simply no
        // longer owed.
        await tx.vendorWallet.update({
          where: { vendorId: vendorOrder.vendorId },
          data: isDirectPaymentMethod(vendorOrder.paymentMethod)
            ? {
                totalEarnings: { decrement: vendorPortion },
                totalCommission: { decrement: commissionPortion },
                commissionOwed: { decrement: commissionPortion },
              }
            : {
                availableBalance: { decrement: vendorPortion },
                totalEarnings: { decrement: vendorPortion },
                totalCommission: { decrement: commissionPortion },
              },
        });

        // MoPay has no refund API: the vendor refunds the customer from
        // their MoPay/mobile money account themselves, and marking the
        // return REFUNDED records that they've done so.
        if (vendorOrder.paymentMethod === "mopay") {
          await recordAudit(tx, {
            actorId: user.id,
            actorEmail: user.email,
            action: "REFUND_RECORDED_PAID_OUTSIDE_PLATFORM",
            entityType: "VendorOrder",
            entityId: vendorOrder.id,
            newValue: { amount: finalRefundAmount.toString(), returnRequestId: returnRequest.id, method: "mopay" },
          });
        }

        if (mpesaReversal) {
          await recordAudit(tx, {
            actorId: user.id,
            actorEmail: user.email,
            action: "MPESA_REVERSAL",
            entityType: "VendorOrder",
            entityId: vendorOrder.id,
            newValue: { ...mpesaReversal, amount: finalRefundAmount.toString(), returnRequestId: returnRequest.id },
          });
        }

        await tx.vendorOrder.update({
          where: { id: vendorOrder.id },
          data: { refundedAmount: { increment: finalRefundAmount } },
        });

        // Determine whether the whole parent order is now fully refunded
        // or only partially, across every vendor order in it.
        const refreshedVendorOrders = await tx.vendorOrder.findMany({
          where: { orderId: vendorOrder.orderId },
        });
        const allFullyRefunded = refreshedVendorOrders.every((vo) =>
          new Decimal(vo.refundedAmount).greaterThanOrEqualTo(vo.subtotal)
        );
        const anyRefunded = refreshedVendorOrders.some((vo) => new Decimal(vo.refundedAmount).greaterThan(0));

        await tx.order.update({
          where: { id: vendorOrder.orderId },
          data: { status: allFullyRefunded ? "REFUNDED" : anyRefunded ? "PARTIALLY_REFUNDED" : undefined },
        });

        if (payment) {
          const totalRefundedOnOrder = refreshedVendorOrders.reduce(
            (sum, vo) => sum.add(vo.refundedAmount),
            new Decimal(0)
          );
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: totalRefundedOnOrder.greaterThanOrEqualTo(payment.amount) ? "REFUNDED" : payment.status,
            },
          });
        }

        await notify(tx, {
          userId: vendorOrder.order.customerId,
          type: "REFUND",
          title: "Refund processed",
          message: `A refund of ${finalRefundAmount.toString()} has been issued for "${existing.orderItem.productNameSnapshot}".`,
          linkUrl: `/orders/${vendorOrder.orderId}`,
        });

        await recordAudit(tx, {
          actorId: user.id,
          actorEmail: user.email,
          action: "REFUND_ISSUED",
          entityType: "ReturnRequest",
          entityId: returnRequest.id,
          newValue: {
            orderId: vendorOrder.orderId,
            orderItemId: existing.orderItemId,
            refundAmount: finalRefundAmount.toString(),
            vendorPortion: vendorPortion.toString(),
            commissionPortion: commissionPortion.toString(),
          },
        });
      } else {
        await notify(tx, {
          userId: existing.customerId,
          type: "RETURN_REQUEST",
          title: "Return request updated",
          message: `Your return request for "${existing.orderItem.productNameSnapshot}" is now ${status}.`,
          linkUrl: `/orders/${existing.vendorOrder.orderId}`,
        });
      }

      return returnRequest;
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
