import type { Prisma, PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Rule-based fraud signal scoring (spec sections 25 & 37). Deliberately
 * NOT dressed up as "AI" — these are plain, explainable heuristics an
 * admin can audit and adjust. A real ML fraud model would slot in here
 * behind the same return shape ({ score, reasons }) without changing any
 * caller.
 *
 * This never blocks a purchase by itself: checkout always proceeds if
 * payment succeeds. A high score only creates a FraudFlag for admin
 * review — the tradeoff is deliberate, since auto-blocking risks denying
 * legitimate customers and a false decline is its own kind of harm.
 */
export async function scoreOrderForFraud(
  tx: Prisma.TransactionClient | PrismaClient,
  params: { userId: string; userCreatedAt: Date; orderTotal: Decimal }
): Promise<{ score: number; reasons: string[] }> {
  let score = 0;
  const reasons: string[] = [];

  // Signal 1: brand-new account placing an unusually large order.
  const accountAgeHours = (Date.now() - params.userCreatedAt.getTime()) / 3600000;
  if (accountAgeHours < 24 && params.orderTotal.greaterThan(1000)) {
    score += 30;
    reasons.push("New account (<24h old) placing a high-value order");
  }

  // Signal 2: several failed payments from this customer very recently —
  // could indicate card testing.
  const recentFailedPayments = await tx.payment.count({
    where: {
      status: "FAILED",
      order: { customerId: params.userId },
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recentFailedPayments >= 3) {
    score += 40;
    reasons.push(`${recentFailedPayments} failed payment attempts in the last hour`);
  }

  // Signal 3: order value far above this customer's historical average.
  const pastOrders = await tx.order.findMany({
    where: { customerId: params.userId, status: { in: ["CONFIRMED", "DELIVERED", "SHIPPED", "PROCESSING"] } },
    select: { grandTotal: true },
    take: 20,
  });
  if (pastOrders.length >= 3) {
    const avg =
      pastOrders.reduce((sum, o) => sum + Number(o.grandTotal), 0) / pastOrders.length;
    if (avg > 0 && Number(params.orderTotal) > avg * 5) {
      score += 20;
      reasons.push("Order total is more than 5x this customer's historical average");
    }
  }

  // Signal 4: unusually high absolute order value regardless of history.
  if (params.orderTotal.greaterThan(20000)) {
    score += 15;
    reasons.push("Very high absolute order value");
  }

  return { score, reasons };
}
