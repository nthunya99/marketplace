import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { resolvePendingMpesaTransaction } from "@/lib/mpesa/payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/vendor-orders/[id]/mpesa/check — ask M-Pesa for the result of
 * the latest unresolved payment attempt. Available to the customer, the
 * vendor and admins.
 */
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

    const pending = await prisma.mpesaTransaction.findFirst({
      where: { vendorOrderId: vendorOrder.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) throw new BusinessError("There's no M-Pesa payment waiting for confirmation on this order.");

    const t = await resolvePendingMpesaTransaction(pending, vendorOrder.vendor, user);
    return NextResponse.json({
      id: t.id,
      status: t.status,
      message: t.status === "PENDING" ? "M-Pesa hasn't confirmed this payment yet. Try again shortly." : t.responseDesc,
      mpesaTransactionId: t.mpesaTransactionId,
      createdAt: t.createdAt,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
