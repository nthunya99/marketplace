import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { syncMopayPayment, latestOpenMopayPayment } from "@/lib/mopay/payments";

export const dynamic = "force-dynamic";

/** POST /api/vendor-orders/[id]/mopay/check — re-check an unfinished MoPay payment. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const vendorOrder = await prisma.vendorOrder.findUnique({
      where: { id: params.id },
      include: { order: { select: { customerId: true } }, vendor: true },
    });
    if (!vendorOrder) throw new BusinessError("Order not found");
    const allowed =
      (user.role === "CUSTOMER" && vendorOrder.order.customerId === user.id) ||
      (user.role === "VENDOR" && vendorOrder.vendorId === user.vendorId) ||
      user.role === "ADMIN";
    if (!allowed) throw new BusinessError("You do not have access to this order.");

    const open = await latestOpenMopayPayment(vendorOrder.id);
    if (!open) throw new BusinessError("There's no unfinished payment on this order.");
    const p = await syncMopayPayment(open, vendorOrder.vendor, user);
    return NextResponse.json({ status: p.status, method: p.selectedPaymentMethod, failureReason: p.failureReason });
  } catch (err) {
    return handleApiError(err);
  }
}
