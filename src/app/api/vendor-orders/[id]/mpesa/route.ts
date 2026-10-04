import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { mpesaPaySchema } from "@/lib/validators";
import { c2bPayment, newConversationId, normaliseLesothoMsisdn, MpesaError } from "@/lib/mpesa/client";
import { vendorMpesaCredentials } from "@/lib/mpesa/vendor";
import { applyMpesaOutcome, outcomeFromPush, resolvePendingMpesaTransaction } from "@/lib/mpesa/payments";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // the push waits for the customer to enter their PIN

const IN_FLIGHT_MS = 2 * 60 * 1000;

function publicTxn(t: { id: string; status: string; responseDesc: string | null; mpesaTransactionId: string | null; createdAt: Date }) {
  return { id: t.id, status: t.status, message: t.responseDesc, mpesaTransactionId: t.mpesaTransactionId, createdAt: t.createdAt };
}

/**
 * POST /api/vendor-orders/[id]/mpesa — the customer pays this vendor
 * order with M-Pesa. Sends a PIN prompt to their phone through the
 * VENDOR's own M-Pesa connection, so the money lands in the vendor's
 * M-Pesa business account. The request stays open until the customer
 * approves or declines on the phone.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("CUSTOMER");
    const { msisdn: rawMsisdn } = mpesaPaySchema.parse(await req.json());
    const msisdn = normaliseLesothoMsisdn(rawMsisdn);
    if (!msisdn) throw new BusinessError("Enter your 8-digit M-Pesa number, e.g. 5812 3456.");

    const vendorOrder = await prisma.vendorOrder.findUnique({
      where: { id: params.id },
      include: { order: true, vendor: true },
    });
    if (!vendorOrder || vendorOrder.order.customerId !== user.id) throw new BusinessError("Order not found");
    if (vendorOrder.paymentMethod !== "mpesa") throw new BusinessError("This order isn't set up for M-Pesa payment.");
    if (vendorOrder.status !== "PENDING") throw new BusinessError("This order has already been paid or cancelled.");
    if (!vendorOrder.vendor.mpesaApiEnabled) {
      throw new BusinessError(`${vendorOrder.vendor.storeName} has switched off M-Pesa payments. Please message the seller.`);
    }

    // Never send a second prompt while an earlier one might still succeed —
    // that's how customers get charged twice.
    const pending = await prisma.mpesaTransaction.findFirst({
      where: { vendorOrderId: vendorOrder.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (pending) {
      if (Date.now() - pending.createdAt.getTime() < IN_FLIGHT_MS) {
        throw new BusinessError("A payment prompt was just sent to your phone. Approve it there, or wait two minutes and try again.");
      }
      const resolved = await resolvePendingMpesaTransaction(pending, vendorOrder.vendor, user);
      if (resolved.status === "SUCCESS") return NextResponse.json(publicTxn(resolved));
      if (resolved.status === "PENDING") {
        throw new BusinessError("We're still waiting for M-Pesa to confirm your earlier payment attempt. Please check again in a few minutes before paying again.");
      }
    }

    const credentials = vendorMpesaCredentials(vendorOrder.vendor);
    const reference = vendorOrder.order.orderNumber.replace(/[^A-Za-z0-9]/g, "").slice(-20) || vendorOrder.id.slice(-20);

    const txn = await prisma.mpesaTransaction.create({
      data: {
        vendorOrderId: vendorOrder.id,
        vendorId: vendorOrder.vendorId,
        customerMsisdn: msisdn,
        amount: vendorOrder.subtotal,
        environment: credentials.environment,
        thirdPartyConversationId: newConversationId(),
        transactionReference: reference,
        initiatedBy: user.id,
      },
    });

    let finalTxn;
    try {
      const result = await c2bPayment(credentials, {
        amount: vendorOrder.subtotal.toFixed(2),
        customerMsisdn: msisdn,
        thirdPartyConversationId: txn.thirdPartyConversationId,
        transactionReference: reference,
        description: `Order ${vendorOrder.order.orderNumber} - ${vendorOrder.vendor.storeName}`,
      });
      finalTxn = await applyMpesaOutcome(txn, outcomeFromPush(result), user);
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || e instanceof TypeError) {
        // Timed out or the connection dropped after sending: the outcome
        // is unknown, so leave it PENDING for the status check.
        finalTxn = await prisma.mpesaTransaction.update({
          where: { id: txn.id },
          data: { responseDesc: "Waiting for M-Pesa to confirm." },
        });
      } else if (e instanceof MpesaError) {
        finalTxn = await applyMpesaOutcome(txn, { success: false, responseCode: e.code ?? "", responseDesc: e.message }, user);
      } else {
        throw e;
      }
    }

    return NextResponse.json(publicTxn(finalTxn));
  } catch (err) {
    return handleApiError(err);
  }
}
