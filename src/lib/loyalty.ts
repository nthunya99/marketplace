import type { Prisma, PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { BusinessError } from "./api-utils";

/**
 * Converts a requested points redemption into a currency discount, capped
 * at the customer's actual balance and at the order subtotal (can never
 * make the order total negative). Returns 0 points/0 discount if the
 * customer didn't ask to redeem any — redemption is opt-in at checkout.
 */
export async function priceLoyaltyRedemption(
  tx: Prisma.TransactionClient | PrismaClient,
  userId: string,
  requestedPoints: number,
  maxDiscountable: Decimal
): Promise<{ pointsToRedeem: number; discount: Decimal }> {
  if (!requestedPoints || requestedPoints <= 0) return { pointsToRedeem: 0, discount: new Decimal(0) };

  const account = await tx.loyaltyAccount.findUnique({ where: { userId } });
  if (!account || account.pointsBalance <= 0) {
    throw new BusinessError("You have no loyalty points to redeem.");
  }
  if (requestedPoints > account.pointsBalance) {
    throw new BusinessError(`You only have ${account.pointsBalance} points available.`);
  }

  const settings = await tx.platformSettings.findUnique({ where: { id: "singleton" } });
  const pointsPerUnit = settings?.loyaltyRedeemPointsPerUnit ?? 100;

  let discount = new Decimal(requestedPoints).div(pointsPerUnit).toDecimalPlaces(2);
  let pointsToRedeem = requestedPoints;

  if (discount.greaterThan(maxDiscountable)) {
    discount = maxDiscountable;
    pointsToRedeem = discount.mul(pointsPerUnit).toDecimalPlaces(0).toNumber();
  }

  return { pointsToRedeem, discount };
}

export async function earnLoyaltyPoints(
  tx: Prisma.TransactionClient | PrismaClient,
  userId: string,
  amountPaid: Decimal,
  orderId: string
): Promise<number> {
  const settings = await tx.platformSettings.findUnique({ where: { id: "singleton" } });
  const rate = settings?.loyaltyEarnRatePerCurrency ?? 1;
  const pointsEarned = amountPaid.mul(rate).toDecimalPlaces(0).toNumber();
  if (pointsEarned <= 0) return 0;

  const account = await tx.loyaltyAccount.upsert({
    where: { userId },
    update: { pointsBalance: { increment: pointsEarned }, lifetimePoints: { increment: pointsEarned } },
    create: { userId, pointsBalance: pointsEarned, lifetimePoints: pointsEarned },
  });

  await tx.loyaltyTransaction.create({
    data: {
      loyaltyAccountId: account.id,
      type: "EARNED",
      points: pointsEarned,
      orderId,
      description: `Order ${orderId}`,
    },
  });

  return pointsEarned;
}

export async function redeemLoyaltyPoints(
  tx: Prisma.TransactionClient | PrismaClient,
  userId: string,
  points: number,
  orderId: string
) {
  if (points <= 0) return;
  const account = await tx.loyaltyAccount.findUniqueOrThrow({ where: { userId } });

  await tx.loyaltyAccount.update({
    where: { userId },
    data: { pointsBalance: { decrement: points } },
  });

  await tx.loyaltyTransaction.create({
    data: {
      loyaltyAccountId: account.id,
      type: "REDEEMED",
      points: -points,
      orderId,
      description: `Redeemed on order ${orderId}`,
    },
  });
}
