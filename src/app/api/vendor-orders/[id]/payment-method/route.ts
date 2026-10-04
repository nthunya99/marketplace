import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { vendorOrderPaymentMethodSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { availablePaymentMethods } from "@/lib/vendor-payment-methods";
import { syncMopayPayment } from "@/lib/mopay/payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/vendor-orders/[id]/payment-method  body: { method }
 *
 * The customer chooses how to pay one seller, after checkout. The choice
 * must be one the seller currently offers (availablePaymentMethods), and
 * can be changed while the vendor order is still PENDING — but never while
 * a payment attempt under the current method might still land, so a
 * customer can't end up paying the same seller twice:
 *   manual → blocked while an uploaded proof is waiting for review
 *   mpesa  → blocked while a PIN prompt's outcome is unknown
 *   mopay  → blocked while MoPay reports a payment in progress (checked
 *            live first; an unfinished-but-unstarted session doesn't
 *            block, and if it's paid later anyway the order still
 *            confirms correctly — see confirmDirectVendorOrderPayment)
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("CUSTOMER");
    const { method } = vendorOrderPaymentMethodSchema.parse(await req.json());

    const vendorOrder = await prisma.vendorOrder.findUnique({
      where: { id: params.id },
      include: { order: { select: { customerId: true } }, vendor: true },
    });
    if (!vendorOrder || vendorOrder.order.customerId !== user.id) throw new BusinessError("Order not found");
    if (vendorOrder.status !== "PENDING") {
      throw new BusinessError("This order has already been paid or cancelled.");
    }

    if (!availablePaymentMethods(vendorOrder.vendor).includes(method)) {
      throw new BusinessError(`${vendorOrder.vendor.storeName} doesn't offer that payment method right now.`);
    }

    if (vendorOrder.paymentMethod === method) {
      return NextResponse.json({ id: vendorOrder.id, paymentMethod: method });
    }

    if (vendorOrder.paymentMethod === "manual") {
      const pendingProof = await prisma.proofOfPayment.findFirst({
        where: { vendorOrderId: vendorOrder.id, status: "PENDING" },
      });
      if (pendingProof) {
        throw new BusinessError(
          "You've uploaded proof of payment that the seller hasn't reviewed yet. Wait for them to confirm or reject it before switching."
        );
      }
    }

    if (vendorOrder.paymentMethod === "mpesa") {
      const inFlight = await prisma.mpesaTransaction.findFirst({
        where: { vendorOrderId: vendorOrder.id, status: "PENDING" },
      });
      if (inFlight) {
        throw new BusinessError(
          "An M-Pesa payment for this order is still being confirmed. Use “Check payment” first — if it didn't go through, you can switch."
        );
      }
    }

    if (vendorOrder.paymentMethod === "mopay") {
      const open = await prisma.mopayPayment.findFirst({
        where: { vendorOrderId: vendorOrder.id, status: { in: ["CREATED", "PROCESSING"] } },
        orderBy: { createdAt: "desc" },
      });
      if (open) {
        const synced = await syncMopayPayment(open, vendorOrder.vendor, user);
        if (synced.status === "SUCCESS") {
          throw new BusinessError("Your online payment to this seller has just gone through — no need to pay again.");
        }
        if (synced.status === "PROCESSING") {
          throw new BusinessError(
            "Your online payment is still being processed. Use “Check payment” in a moment before choosing another method."
          );
        }
      }
    }

    // Conditional on still being PENDING with the method we checked, so a
    // payment confirming in parallel can't be overwritten.
    const moved = await prisma.vendorOrder.updateMany({
      where: { id: vendorOrder.id, status: "PENDING", paymentMethod: vendorOrder.paymentMethod },
      data: { paymentMethod: method },
    });
    if (moved.count === 0) {
      throw new BusinessError("This order changed while you were choosing. Refresh the page and try again.");
    }

    return NextResponse.json({ id: vendorOrder.id, paymentMethod: method });
  } catch (err) {
    return handleApiError(err);
  }
}
