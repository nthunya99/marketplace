import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { proofRejectSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { notify } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/vendor-orders/[id]/proof/[proofId]/reject
 * The vendor order stays PENDING so the customer can submit a corrected
 * proof — rejection isn't a dead end, just a "not this one, here's why."
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; proofId: string } }) {
  try {
    const user = await requireRole("VENDOR", "ADMIN");
    const { rejectionReason } = proofRejectSchema.parse(await req.json());

    const vendorOrder = await prisma.vendorOrder.findUnique({
      where: { id: params.id },
      include: { order: { select: { customerId: true } }, vendor: { select: { storeName: true } } },
    });
    if (!vendorOrder) throw new BusinessError("Order not found");
    if (user.role === "VENDOR" && vendorOrder.vendorId !== user.vendorId) {
      throw new BusinessError("You do not have permission to review payment for this order.");
    }

    const proof = await prisma.proofOfPayment.findUnique({ where: { id: params.proofId } });
    if (!proof || proof.vendorOrderId !== params.id) throw new BusinessError("Proof of payment not found");
    if (proof.status !== "PENDING") {
      throw new BusinessError("This proof of payment has already been reviewed.");
    }

    const updated = await prisma.proofOfPayment.update({
      where: { id: proof.id },
      data: { status: "REJECTED", rejectionReason, reviewedAt: new Date(), reviewedBy: user.id },
    });

    await recordAudit(prisma, {
      actorId: user.id,
      actorEmail: user.email,
      action: "MANUAL_PAYMENT_PROOF_REJECTED",
      entityType: "ProofOfPayment",
      entityId: proof.id,
      newValue: { rejectionReason },
    });

    await notify(prisma, {
      userId: vendorOrder.order.customerId,
      type: "PAYMENT_PROOF",
      title: "Proof of payment rejected",
      message: `${vendorOrder.vendor.storeName} couldn't confirm your payment: ${rejectionReason}. Please upload a new proof of payment.`,
      linkUrl: `/orders/${vendorOrder.orderId}`,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
