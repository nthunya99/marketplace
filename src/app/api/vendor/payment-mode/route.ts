import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { vendorPaymentModeSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { recordAudit } from "@/lib/audit";
import {
  availablePaymentMethods,
  hasManualPayoutDetails,
  VENDOR_PAYMENT_SELECT,
} from "@/lib/vendor-payment-methods";

export const dynamic = "force-dynamic";

async function summary(vendorId: string) {
  const v = await prisma.vendorProfile.findUniqueOrThrow({
    where: { id: vendorId },
    select: VENDOR_PAYMENT_SELECT,
  });
  return {
    paymentMode: v.paymentMode,
    // What customers can choose from right now under the current mode.
    activeMethods: availablePaymentMethods(v),
    manualReady: v.acceptsManualPayment && hasManualPayoutDetails(v),
    hasManualDetails: hasManualPayoutDetails(v),
    onlineReady: v.mopayEnabled || v.mpesaApiEnabled,
  };
}

/** GET /api/vendor/payment-mode — how this store collects payment. */
export async function GET() {
  try {
    const user = await requireRole("VENDOR");
    if (!user.vendorId) throw new BusinessError("Vendor profile not found");
    return NextResponse.json(await summary(user.vendorId));
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * PUT /api/vendor/payment-mode  body: { paymentMode: "MANUAL" | "ONLINE" }
 *
 * Switching is only allowed to a mode the store can actually take payment
 * in, so a live store can't accidentally lock customers out:
 *   ONLINE needs MoPay or direct M-Pesa connected and switched on.
 *   MANUAL needs a bank account or mobile money number on file; switching
 *          to it also turns manual payment on.
 * (Registration is the one exception — a new ONLINE store connects its
 * merchant API after signing up.)
 *
 * Only affects choices customers make from now on. Vendor orders where the
 * customer already picked a method keep it.
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireRole("VENDOR");
    if (!user.vendorId) throw new BusinessError("Vendor profile not found");
    const { paymentMode } = vendorPaymentModeSchema.parse(await req.json());

    const vendor = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: user.vendorId } });

    if (paymentMode === "ONLINE" && !vendor.mopayEnabled && !vendor.mpesaApiEnabled) {
      throw new BusinessError("Connect and turn on MoPay or direct M-Pesa below before switching to online payments.");
    }
    if (paymentMode === "MANUAL" && !hasManualPayoutDetails(vendor)) {
      throw new BusinessError(
        "Add a bank account or mobile money number under Store settings → Payment details before switching to offline payments."
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.vendorProfile.update({
        where: { id: vendor.id },
        data: { paymentMode, ...(paymentMode === "MANUAL" ? { acceptsManualPayment: true } : {}) },
      });
      await recordAudit(tx, {
        actorId: user.id,
        actorEmail: user.email ?? undefined,
        action: "VENDOR_PAYMENT_MODE_CHANGED",
        entityType: "VendorProfile",
        entityId: vendor.id,
        previousValue: { paymentMode: vendor.paymentMode },
        newValue: { paymentMode },
      });
    });

    return NextResponse.json(await summary(vendor.id));
  } catch (err) {
    return handleApiError(err);
  }
}
