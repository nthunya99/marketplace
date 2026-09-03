import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { notify } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/vendors/[id]/reject
 * body: { status: "REJECTED" | "SUSPENDED" }
 * Combined into one route since both are "admin revokes vendor's ability
 * to sell" actions with identical authorization/side effects.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole("ADMIN");
    const body = await req.json().catch(() => ({}));
    const status = body.status === "SUSPENDED" ? "SUSPENDED" : "REJECTED";

    const vendor = await prisma.vendorProfile.findUnique({ where: { id: params.id } });
    if (!vendor) throw new BusinessError("Vendor not found");

    const updated = await prisma.vendorProfile.update({
      where: { id: params.id },
      data: { status },
    });

    await recordAudit(prisma, {
      actorId: admin.id,
      actorEmail: admin.email,
      action: status === "SUSPENDED" ? "VENDOR_SUSPENDED" : "VENDOR_REJECTED",
      entityType: "VendorProfile",
      entityId: vendor.id,
      previousValue: { status: vendor.status },
      newValue: { status },
    });

    await notify(prisma, {
      userId: vendor.userId,
      type: "VENDOR_STATUS",
      title: status === "SUSPENDED" ? "Vendor account suspended" : "Vendor application rejected",
      message:
        status === "SUSPENDED"
          ? `${vendor.storeName} has been suspended by an administrator.`
          : `${vendor.storeName}'s vendor application was not approved.`,
      linkUrl: "/vendor/dashboard",
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
