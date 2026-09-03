import type { Prisma, PrismaClient, VendorProfile } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Resolves the effective commission percent for a vendor: vendor-specific
 * override > platform default. (Category-specific commission is a Phase 2
 * extension point — this function is the single place that decision is
 * made, so adding category-level rules later doesn't touch checkout code.)
 */
export async function resolveCommissionPercent(
  tx: Prisma.TransactionClient | PrismaClient,
  vendor: Pick<VendorProfile, "commissionPercent">
): Promise<Decimal> {
  if (vendor.commissionPercent != null) {
    return new Decimal(vendor.commissionPercent);
  }
  const settings = await tx.platformSettings.findUnique({ where: { id: "singleton" } });
  return new Decimal(settings?.defaultCommission ?? 10);
}

export function calculateCommission(subtotal: Decimal, commissionPercent: Decimal) {
  const commissionAmount = subtotal.mul(commissionPercent).div(100).toDecimalPlaces(2);
  const vendorEarnings = subtotal.sub(commissionAmount);
  return { commissionAmount, vendorEarnings };
}
