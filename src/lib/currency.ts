import type { PrismaClient } from "@prisma/client";

/**
 * Display-only currency conversion (see the CurrencyRate model's doc
 * comment for the scope of what this does and doesn't cover — actual
 * charging always happens in the platform's base currency).
 */
export async function getCurrencyRates(prisma: PrismaClient) {
  const rates = await prisma.currencyRate.findMany();
  return rates.reduce<Record<string, number>>((acc, r) => {
    acc[r.currencyCode] = Number(r.rateToBase);
    return acc;
  }, {});
}
