import type { Coupon, Prisma, PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { BusinessError } from "./api-utils";

export interface EligibleLine {
  vendorId: string;
  categoryId: string;
  productId: string;
  lineTotal: Decimal;
}

/**
 * Validates a coupon against the current cart contents and returns the
 * discount amount plus which lines it applied to. All checks are
 * server-side and re-run at checkout time against live DB state — a
 * coupon's usage count, expiry, or active flag can change between when a
 * customer types the code and when they actually pay.
 */
export async function validateAndPriceCoupon(
  tx: Prisma.TransactionClient | PrismaClient,
  code: string,
  userId: string,
  lines: EligibleLine[]
): Promise<{ coupon: Coupon; discountAmount: Decimal; eligibleSubtotal: Decimal }> {
  const coupon = await tx.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.isActive) throw new BusinessError("This coupon code is not valid.");

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) throw new BusinessError("This coupon is not active yet.");
  if (coupon.expiresAt && coupon.expiresAt < now) throw new BusinessError("This coupon has expired.");
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
    throw new BusinessError("This coupon has reached its usage limit.");
  }
  if (coupon.perUserLimit != null) {
    const userUsage = await tx.couponRedemption.count({ where: { couponId: coupon.id, userId } });
    if (userUsage >= coupon.perUserLimit) {
      throw new BusinessError("You have already used this coupon the maximum number of times.");
    }
  }

  const eligibleLines = lines.filter((line) => {
    if (coupon.scope === "VENDOR" && coupon.vendorId && line.vendorId !== coupon.vendorId) return false;
    if (coupon.categoryId && line.categoryId !== coupon.categoryId) return false;
    if (coupon.productId && line.productId !== coupon.productId) return false;
    return true;
  });

  if (eligibleLines.length === 0) {
    throw new BusinessError("This coupon does not apply to any items in your cart.");
  }

  const eligibleSubtotal = eligibleLines.reduce((sum, l) => sum.add(l.lineTotal), new Decimal(0));

  if (coupon.minPurchaseAmount && eligibleSubtotal.lessThan(coupon.minPurchaseAmount)) {
    throw new BusinessError(
      `This coupon requires a minimum purchase of ${coupon.minPurchaseAmount.toString()} on eligible items.`
    );
  }

  const discountAmount =
    coupon.type === "PERCENTAGE"
      ? eligibleSubtotal.mul(coupon.value).div(100).toDecimalPlaces(2)
      : Decimal.min(coupon.value, eligibleSubtotal);

  return { coupon, discountAmount, eligibleSubtotal };
}
