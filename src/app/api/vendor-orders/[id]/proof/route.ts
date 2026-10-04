import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/auth-utils";
import { proofOfPaymentSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { notify } from "@/lib/notifications";

async function loadVendorOrderForAccessCheck(vendorOrderId: string) {
  const vendorOrder = await prisma.vendorOrder.findUnique({
    where: { id: vendorOrderId },
    include: { order: { select: { customerId: true } }, vendor: { select: { userId: true, storeName: true } } },
  });
  if (!vendorOrder) throw new BusinessError("Order not found");
  return vendorOrder;
}

/**
 * GET /api/vendor-orders/[id]/proof — the submission history for one
 * vendor order. Visible to the customer who placed it, the vendor it
 * belongs to, and admins.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const vendorOrder = await loadVendorOrderForAccessCheck(params.id);

    const isOwner = user.role === "CUSTOMER" && vendorOrder.order.customerId === user.id;
    const isVendor = user.role === "VENDOR" && vendorOrder.vendor.userId === user.id;
    const isAdmin = user.role === "ADMIN";
    if (!isOwner && !isVendor && !isAdmin) throw new BusinessError("You do not have access to this order.");

    const proofs = await prisma.proofOfPayment.findMany({
      where: { vendorOrderId: params.id },
      orderBy: { submittedAt: "desc" },
    });
    return NextResponse.json(proofs);
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/vendor-orders/[id]/proof — the customer uploads evidence of
 * having paid this vendor directly (bank transfer / mobile money). Only
 * allowed while the vendor order is still PENDING under paymentMethod
 * "manual" — once a vendor confirms a proof the order moves to CONFIRMED
 * and this closes; if a submission is rejected, the order stays PENDING
 * so the customer can submit again.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("CUSTOMER");
    const vendorOrder = await loadVendorOrderForAccessCheck(params.id);

    if (vendorOrder.order.customerId !== user.id) {
      throw new BusinessError("You do not have permission to upload proof for this order.");
    }
    if (vendorOrder.paymentMethod !== "manual") {
      throw new BusinessError("This order isn't set up for manual payment.");
    }
    if (vendorOrder.status !== "PENDING") {
      throw new BusinessError("This order is no longer awaiting payment confirmation.");
    }

    const data = proofOfPaymentSchema.parse(await req.json());

    const proof = await prisma.proofOfPayment.create({
      data: {
        vendorOrderId: params.id,
        imageData: data.imageData,
        fileName: data.fileName,
        note: data.note,
        submittedBy: user.id,
        status: "PENDING",
      },
    });

    await notify(prisma, {
      userId: vendorOrder.vendor.userId,
      type: "PAYMENT_PROOF",
      title: "Proof of payment submitted",
      message: `A customer uploaded proof of payment for an order from ${vendorOrder.vendor.storeName}. Please review it.`,
      linkUrl: "/vendor/orders",
    });

    // Return without imageData in the list response elsewhere, but the
    // uploader gets their own submission back in full as confirmation.
    return NextResponse.json(proof, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
