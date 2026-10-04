import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { createSession, makeReference, appBaseUrl, MopayError } from "@/lib/mopay/client";
import { vendorMopayKey, syncMopayPayment, latestOpenMopayPayment } from "@/lib/mopay/payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/vendor-orders/[id]/mopay — start paying this vendor order
 * through the VENDOR's own MoPay account. Returns the MoPay checkout URL
 * the browser should go to (M-Pesa, EcoCash or card are chosen there).
 * An unfinished session is reused rather than opening a second one, so a
 * customer can't end up paying twice.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("CUSTOMER");
    const vendorOrder = await prisma.vendorOrder.findUnique({
      where: { id: params.id },
      include: { order: { include: { customer: { select: { name: true, email: true } } } }, vendor: true },
    });
    if (!vendorOrder || vendorOrder.order.customerId !== user.id) throw new BusinessError("Order not found");
    if (vendorOrder.paymentMethod !== "mopay") throw new BusinessError("This order isn't set up for online payment.");
    if (vendorOrder.status !== "PENDING") throw new BusinessError("This order has already been paid or cancelled.");
    if (!vendorOrder.vendor.mopayEnabled) {
      throw new BusinessError(`${vendorOrder.vendor.storeName} has switched off online payments. Please message the seller.`);
    }

    const open = await latestOpenMopayPayment(vendorOrder.id);
    if (open) {
      const synced = await syncMopayPayment(open, vendorOrder.vendor, user);
      if (synced.status === "SUCCESS") return NextResponse.json({ status: "SUCCESS" });
      if (synced.status === "PROCESSING") {
        throw new BusinessError("Your earlier payment is still being processed. Use “Check payment” in a moment before paying again.");
      }
      if (synced.status === "CREATED") return NextResponse.json({ status: "CREATED", paymentUrl: synced.paymentUrl });
    }

    const apiKey = vendorMopayKey(vendorOrder.vendor);
    const reference = makeReference(vendorOrder.order.orderNumber);
    // Pre-create the row so its id can go in the return URL.
    const pendingId = crypto.randomUUID().replace(/-/g, "");
    let session;
    try {
      session = await createSession(apiKey, {
        amount: vendorOrder.subtotal.toFixed(2),
        reference,
        redirectUrl: `${appBaseUrl()}/api/mopay/return/${pendingId}`,
        description: `Order ${vendorOrder.order.orderNumber} - ${vendorOrder.vendor.storeName}`,
        customerEmail: vendorOrder.order.customer.email,
        customerName: vendorOrder.order.customer.name ?? undefined,
      });
    } catch (e) {
      if (e instanceof MopayError) throw new BusinessError(e.message);
      throw e;
    }

    await prisma.mopayPayment.create({
      data: {
        id: pendingId,
        vendorOrderId: vendorOrder.id,
        vendorId: vendorOrder.vendorId,
        amount: vendorOrder.subtotal,
        reference,
        sessionId: session.sessionId,
        paymentUrl: session.paymentUrl,
        initiatedBy: user.id,
      },
    });

    return NextResponse.json({ status: "CREATED", paymentUrl: session.paymentUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
