import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { vendorStoreSettingsSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

/**
 * GET /api/vendor/settings — a vendor's own opt-in flags for the
 * platform's promotional systems.
 */
export async function GET() {
  try {
    const user = await requireRole("VENDOR");
    if (!user.vendorId) throw new BusinessError("Vendor profile not found");
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: user.vendorId },
      select: { participatesInCoupons: true, participatesInLoyalty: true },
    });
    return NextResponse.json(vendor);
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * PATCH /api/vendor/settings
 * Lets a vendor turn coupon and/or loyalty participation on or off for
 * their own store. Turning coupons off doesn't retroactively deactivate
 * coupons they've already created — it stops those coupons (and any
 * platform-wide coupon) from discounting their products going forward
 * (see validateAndPriceCoupon). Turning loyalty off stops purchases from
 * this vendor earning the customer points going forward (see
 * earnLoyaltyPoints call sites in checkout and the manual-payment
 * confirm route).
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireRole("VENDOR");
    if (!user.vendorId) throw new BusinessError("Vendor profile not found");
    const data = vendorStoreSettingsSchema.parse(await req.json());

    const updated = await prisma.vendorProfile.update({
      where: { id: user.vendorId },
      data,
      select: { participatesInCoupons: true, participatesInLoyalty: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
