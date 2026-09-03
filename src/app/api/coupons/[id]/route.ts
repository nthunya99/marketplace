import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { couponSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("VENDOR", "ADMIN");
    const existing = await prisma.coupon.findUnique({ where: { id: params.id } });
    if (!existing) throw new BusinessError("Coupon not found");
    if (user.role === "VENDOR" && existing.vendorId !== user.vendorId) {
      throw new BusinessError("You do not have permission to edit this coupon.");
    }

    const data = couponSchema.partial().parse(await req.json());
    const updated = await prisma.coupon.update({
      where: { id: params.id },
      data: {
        isActive: data.isActive,
        usageLimit: data.usageLimit,
        perUserLimit: data.perUserLimit,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("VENDOR", "ADMIN");
    const existing = await prisma.coupon.findUnique({ where: { id: params.id } });
    if (!existing) throw new BusinessError("Coupon not found");
    if (user.role === "VENDOR" && existing.vendorId !== user.vendorId) {
      throw new BusinessError("You do not have permission to delete this coupon.");
    }
    await prisma.coupon.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
