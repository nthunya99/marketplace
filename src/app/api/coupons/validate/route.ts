import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { validateAndPriceCoupon, type EligibleLine } from "@/lib/coupons";

/**
 * POST /api/coupons/validate — lets the cart/checkout page preview a
 * coupon's discount before the customer commits to paying. This performs
 * the exact same validation as checkout but does not persist anything
 * (no usage count increment, no redemption record) — checkout re-runs the
 * real validation itself, so a stale preview can never let a bad coupon
 * through.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("CUSTOMER");
    const { code } = await req.json();
    if (!code) throw new BusinessError("Coupon code is required.");

    const cart = await prisma.cart.findUnique({
      where: { userId: user.id },
      include: { items: { include: { product: true, variant: true } } },
    });
    if (!cart || cart.items.length === 0) throw new BusinessError("Your cart is empty.");

    const lines: EligibleLine[] = cart.items.map((item) => {
      const unitPrice = item.variant ? item.variant.price : item.product.discountPrice ?? item.product.price;
      return {
        vendorId: item.product.vendorId,
        categoryId: item.product.categoryId,
        productId: item.productId,
        lineTotal: unitPrice.mul(item.quantity),
      };
    });

    const { discountAmount, eligibleSubtotal } = await validateAndPriceCoupon(prisma, code, user.id, lines);

    return NextResponse.json({
      valid: true,
      discountAmount: discountAmount.toString(),
      eligibleSubtotal: eligibleSubtotal.toString(),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
