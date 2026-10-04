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

/**
 * Credits a vendor's wallet once their money has actually landed:
 * immediately after a successful card charge, or once a vendor confirms
 * a manual payment's proof. Pulled out as a shared helper so both paths
 * credit the wallet identically instead of drifting apart.
 */
export async function creditVendorWallet(
  tx: Prisma.TransactionClient | PrismaClient,
  params: { vendorId: string; vendorEarnings: Decimal; commissionAmount: Decimal }
) {
  await tx.vendorWallet.upsert({
    where: { vendorId: params.vendorId },
    update: {
      pendingBalance: { increment: params.vendorEarnings },
      totalEarnings: { increment: params.vendorEarnings },
      totalCommission: { increment: params.commissionAmount },
    },
    create: {
      vendorId: params.vendorId,
      pendingBalance: params.vendorEarnings,
      totalEarnings: params.vendorEarnings,
      totalCommission: params.commissionAmount,
    },
  });
}

/**
 * Payment methods where the customer's money goes straight to the vendor
 * and never passes through the marketplace. For these, the vendor's
 * earnings must NOT enter pending/available balance (the platform would
 * otherwise pay the vendor a second time through payouts); instead the
 * commission is recorded as owed by the vendor.
 *
 * "manual" is deliberately not listed yet: it still uses the older
 * creditVendorWallet behaviour. Moving it here is a one-line change once
 * that decision is made for manual payments too.
 */
export const DIRECT_PAYMENT_METHODS = ["mpesa", "mopay"] as const;

export function isDirectPaymentMethod(method: string) {
  return (DIRECT_PAYMENT_METHODS as readonly string[]).includes(method);
}

/**
 * Ledger entry for a sale the vendor collected directly: earnings and
 * commission are recorded for reporting, and the commission becomes a
 * debt to the marketplace — nothing is added to any withdrawable balance.
 */
export async function recordDirectVendorPayment(
  tx: Prisma.TransactionClient | PrismaClient,
  params: { vendorId: string; vendorEarnings: Decimal; commissionAmount: Decimal }
) {
  await tx.vendorWallet.upsert({
    where: { vendorId: params.vendorId },
    update: {
      totalEarnings: { increment: params.vendorEarnings },
      totalCommission: { increment: params.commissionAmount },
      commissionOwed: { increment: params.commissionAmount },
    },
    create: {
      vendorId: params.vendorId,
      totalEarnings: params.vendorEarnings,
      totalCommission: params.commissionAmount,
      commissionOwed: params.commissionAmount,
    },
  });
}
