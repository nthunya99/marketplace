import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { shippingMethodSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("VENDOR");
    const existing = await prisma.shippingMethod.findUnique({ where: { id: params.id } });
    if (!existing || existing.vendorId !== user.vendorId) {
      throw new BusinessError("Shipping method not found");
    }

    const data = shippingMethodSchema.partial().parse(await req.json());

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.shippingMethod.updateMany({
          where: { vendorId: user.vendorId!, id: { not: params.id } },
          data: { isDefault: false },
        });
      }
      return tx.shippingMethod.update({ where: { id: params.id }, data });
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("VENDOR");
    const existing = await prisma.shippingMethod.findUnique({ where: { id: params.id } });
    if (!existing || existing.vendorId !== user.vendorId) {
      throw new BusinessError("Shipping method not found");
    }
    await prisma.shippingMethod.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
