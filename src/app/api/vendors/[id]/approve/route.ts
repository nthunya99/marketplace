import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { notify } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole("ADMIN");

    const vendor = await prisma.vendorProfile.findUnique({ where: { id: params.id } });
    if (!vendor) throw new BusinessError("Vendor not found");

    const updated = await prisma.vendorProfile.update({
      where: { id: params.id },
      data: { status: "APPROVED" },
    });

    await recordAudit(prisma, {
      actorId: admin.id,
      actorEmail: admin.email,
      action: "VENDOR_APPROVED",
      entityType: "VendorProfile",
      entityId: vendor.id,
      previousValue: { status: vendor.status },
      newValue: { status: "APPROVED" },
    });

    await notify(prisma, {
      userId: vendor.userId,
      type: "VENDOR_STATUS",
      title: "Vendor account approved",
      message: `${vendor.storeName} has been approved. You can now list products.`,
      linkUrl: "/vendor/dashboard",
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
