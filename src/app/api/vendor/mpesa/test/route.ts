import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { getSession, MpesaError } from "@/lib/mpesa/client";
import { vendorMpesaCredentials } from "@/lib/mpesa/vendor";

/**
 * POST /api/vendor/mpesa/test — check the SAVED credentials still work by
 * opening a fresh session with Vodacom. No money moves.
 */
export async function POST() {
  try {
    const user = await requireRole("VENDOR");
    if (!user.vendorId) throw new BusinessError("Vendor profile not found");
    const vendor = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: user.vendorId } });

    try {
      await getSession(vendorMpesaCredentials(vendor), true);
    } catch (e) {
      if (e instanceof MpesaError) throw new BusinessError(e.message);
      throw e;
    }
    const updated = await prisma.vendorProfile.update({
      where: { id: vendor.id },
      data: { mpesaVerifiedAt: new Date() },
    });
    return NextResponse.json({ ok: true, verifiedAt: updated.mpesaVerifiedAt });
  } catch (err) {
    return handleApiError(err);
  }
}
