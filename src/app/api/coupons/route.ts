import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { couponSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

/**
 * GET /api/coupons — vendors see only their own coupons; admins see all.
 */
export async function GET() {
  try {
    const user = await requireRole("VENDOR", "ADMIN");
    const coupons = await prisma.coupon.findMany({
      where: user.role === "VENDOR" ? { vendorId: user.vendorId ?? "" } : undefined,
      orderBy: { createdAt: "desc" },
      include: { category: { select: { name: true } }, product: { select: { name: true } } },
    });
    return NextResponse.json(coupons);
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/coupons
 * Vendors may only create VENDOR-scoped coupons attached to their own
 * store (scope/vendorId are forced server-side, never trusted from the
 * client). Admins may create PLATFORM-wide coupons.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("VENDOR", "ADMIN");
    const data = couponSchema.parse(await req.json());

    if (data.type === "PERCENTAGE" && data.value > 100) {
      throw new BusinessError("A percentage discount cannot exceed 100.");
    }

    const existing = await prisma.coupon.findUnique({ where: { code: data.code.toUpperCase() } });
    if (existing) throw new BusinessError("A coupon with this code already exists.");

    const coupon = await prisma.coupon.create({
      data: {
        code: data.code.toUpperCase(),
        type: data.type,
        value: data.value,
        scope: user.role === "VENDOR" ? "VENDOR" : data.scope ?? "PLATFORM",
        vendorId: user.role === "VENDOR" ? user.vendorId : undefined,
        categoryId: data.categoryId,
        productId: data.productId,
        minPurchaseAmount: data.minPurchaseAmount,
        usageLimit: data.usageLimit,
        perUserLimit: data.perUserLimit,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(coupon, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
