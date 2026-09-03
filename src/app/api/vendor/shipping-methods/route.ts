import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { shippingMethodSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

export async function GET() {
  try {
    const user = await requireRole("VENDOR");
    if (!user.vendorId) throw new BusinessError("Vendor profile not found");
    const methods = await prisma.shippingMethod.findMany({
      where: { vendorId: user.vendorId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(methods);
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/vendor/shipping-methods
 * Only one method per vendor may be `isDefault` — checkout picks that one
 * automatically (see src/app/api/checkout/route.ts). Setting a new
 * default here un-sets any previous one in the same transaction.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("VENDOR");
    if (!user.vendorId) throw new BusinessError("Vendor profile not found");
    const data = shippingMethodSchema.parse(await req.json());

    const method = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.shippingMethod.updateMany({
          where: { vendorId: user.vendorId! },
          data: { isDefault: false },
        });
      }
      return tx.shippingMethod.create({
        data: {
          vendorId: user.vendorId!,
          name: data.name,
          cost: data.cost,
          estimatedDaysMin: data.estimatedDaysMin,
          estimatedDaysMax: data.estimatedDaysMax,
          isActive: data.isActive ?? true,
          isDefault: data.isDefault ?? false,
        },
      });
    });

    return NextResponse.json(method, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
