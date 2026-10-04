import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncMopayPayment } from "@/lib/mopay/payments";
import { appBaseUrl } from "@/lib/mopay/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/mopay/return/[paymentId] — where MoPay sends the customer after
 * checkout. MoPay's query parameters (status=success etc.) are ignored:
 * the result is fetched from MoPay's API with the vendor's key, so a
 * forged redirect can't mark an order paid. Then the customer lands back
 * on their order page.
 */
export async function GET(_req: NextRequest, { params }: { params: { paymentId: string } }) {
  const payment = await prisma.mopayPayment.findUnique({
    where: { id: params.paymentId },
    include: { vendor: true, vendorOrder: { select: { orderId: true } } },
  });
  if (!payment) return NextResponse.redirect(`${appBaseUrl()}/orders`);

  let status: string = payment.status;
  try {
    const synced = await syncMopayPayment(payment, payment.vendor, { id: payment.initiatedBy });
    status = synced.status;
  } catch (e) {
    console.error("MoPay return sync failed", e);
  }
  return NextResponse.redirect(`${appBaseUrl()}/orders/${payment.vendorOrder.orderId}?payment=${status.toLowerCase()}`);
}
