import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const user = await requireRole("CUSTOMER");
    const account = await prisma.loyaltyAccount.findUnique({
      where: { userId: user.id },
      include: { transactions: { orderBy: { createdAt: "desc" }, take: 30 } },
    });
    const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });

    return NextResponse.json({
      pointsBalance: account?.pointsBalance ?? 0,
      lifetimePoints: account?.lifetimePoints ?? 0,
      transactions: account?.transactions ?? [],
      earnRatePerCurrency: settings?.loyaltyEarnRatePerCurrency ?? 1,
      redeemPointsPerUnit: settings?.loyaltyRedeemPointsPerUnit ?? 100,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
