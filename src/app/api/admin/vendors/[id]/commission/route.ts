import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({ commissionPercent: z.number().min(0).max(100).nullable() });

/**
 * PATCH /api/admin/vendors/[id]/commission
 * Sets (or clears, with null) a vendor-specific commission override
 * (spec section 9). Clearing it falls back to the platform default via
 * resolveCommissionPercent. Commission changes are exactly the kind of
 * financial-policy action spec section 26 calls out for the audit trail.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole("ADMIN");
    const { commissionPercent } = schema.parse(await req.json());

    const vendor = await prisma.vendorProfile.findUnique({ where: { id: params.id } });
    if (!vendor) throw new BusinessError("Vendor not found");

    const updated = await prisma.vendorProfile.update({
      where: { id: params.id },
      data: { commissionPercent },
    });

    await recordAudit(prisma, {
      actorId: admin.id,
      actorEmail: admin.email,
      action: "VENDOR_COMMISSION_CHANGED",
      entityType: "VendorProfile",
      entityId: vendor.id,
      previousValue: { commissionPercent: vendor.commissionPercent?.toString() ?? null },
      newValue: { commissionPercent },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
