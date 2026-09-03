import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { AuthError } from "@/lib/auth-utils";
import { notify } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/admin/payouts/auto-run
 * Automated vendor payouts (spec section 37, Phase 4). Finds every vendor
 * whose available balance is at or above the configured threshold,
 * creates a payout for their full available balance, and immediately
 * completes it (auto-approval is inherent to "automated" — a human never
 * reviews these individually, which is the whole point).
 *
 * This app has no built-in scheduler — Next.js API routes only run when
 * something calls them. To actually run this on a schedule, point an
 * external scheduler at this endpoint:
 *   - Vercel Cron (vercel.json `crons` entry) if deployed on Vercel
 *   - A GitHub Action on a `schedule` trigger
 *   - A plain OS cron job running `curl`
 * calling it with header `x-cron-secret: $CRON_SECRET` (set CRON_SECRET
 * in your environment — see .env.example). An authenticated admin
 * session also works, so this can be triggered manually from the admin
 * settings page.
 */
export async function POST(req: NextRequest) {
  try {
    const cronSecret = req.headers.get("x-cron-secret");
    const isCron = cronSecret && cronSecret === process.env.CRON_SECRET;

    let actorId: string | null = null;
    let actorEmail: string | null = null;
    if (!isCron) {
      const session = await getServerSession(authOptions);
      if (!session?.user || session.user.role !== "ADMIN") {
        throw new AuthError("Not authorized.", 401);
      }
      actorId = session.user.id;
      actorEmail = session.user.email;
    }

    const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
    if (!settings?.autoPayoutEnabled) {
      return NextResponse.json({ ran: false, reason: "Automated payouts are disabled." });
    }

    const threshold = settings.autoPayoutThreshold;
    const eligibleWallets = await prisma.vendorWallet.findMany({
      where: { availableBalance: { gte: threshold } },
      include: { vendor: true },
    });

    const results = [];
    for (const wallet of eligibleWallets) {
      if (Number(wallet.availableBalance) <= 0) continue;

      const payout = await prisma.$transaction(async (tx) => {
        const fresh = await tx.vendorWallet.findUniqueOrThrow({ where: { vendorId: wallet.vendorId } });
        if (fresh.availableBalance.lessThan(threshold) || fresh.availableBalance.lessThanOrEqualTo(0)) {
          return null;
        }

        const created = await tx.payout.create({
          data: {
            vendorId: wallet.vendorId,
            amount: fresh.availableBalance,
            status: "COMPLETED",
            adminNote: "Automated payout",
            processedAt: new Date(),
          },
        });

        await tx.vendorWallet.update({
          where: { vendorId: wallet.vendorId },
          data: {
            availableBalance: { decrement: created.amount },
            totalWithdrawn: { increment: created.amount },
          },
        });

        await recordAudit(tx, {
          actorId,
          actorEmail,
          action: "AUTO_PAYOUT_COMPLETED",
          entityType: "Payout",
          entityId: created.id,
          newValue: { amount: created.amount.toString(), vendorId: wallet.vendorId },
        });

        return created;
      });

      if (payout) {
        await notify(prisma, {
          userId: wallet.vendor.userId,
          type: "PAYOUT",
          title: "Automatic payout sent",
          message: `An automatic payout of ${payout.amount} has been sent to your account.`,
          linkUrl: "/vendor/wallet",
        });
        results.push({ vendorId: wallet.vendorId, amount: payout.amount.toString() });
      }
    }

    return NextResponse.json({ ran: true, payoutsCreated: results.length, results });
  } catch (err) {
    return handleApiError(err);
  }
}
