import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { payoutDecisionSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { notify } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/payouts/[id]/complete
 * The only point where a vendor's available balance is actually debited
 * (spec section 10: "never allow a vendor to withdraw more than their
 * available balance" — enforced again here, transactionally, in case the
 * balance shifted between request and completion, e.g. a refund landed
 * in between).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole("ADMIN");
    const { adminNote } = payoutDecisionSchema.parse(await req.json().catch(() => ({})));

    const payout = await prisma.payout.findUnique({ where: { id: params.id }, include: { vendor: true } });
    if (!payout) throw new BusinessError("Payout not found");
    if (payout.status !== "APPROVED") {
      throw new BusinessError("Only approved payouts can be marked completed.");
    }

    await prisma.$transaction(async (tx) => {
      const wallet = await tx.vendorWallet.findUniqueOrThrow({ where: { vendorId: payout.vendorId } });
      if (Number(wallet.availableBalance) < Number(payout.amount)) {
        throw new BusinessError("Vendor's available balance is insufficient to complete this payout.");
      }

      await tx.vendorWallet.update({
        where: { vendorId: payout.vendorId },
        data: {
          availableBalance: { decrement: payout.amount },
          totalWithdrawn: { increment: payout.amount },
        },
      });

      await tx.payout.update({
        where: { id: params.id },
        data: { status: "COMPLETED", adminNote: adminNote ?? payout.adminNote, processedAt: new Date() },
      });

      await recordAudit(tx, {
        actorId: admin.id,
        actorEmail: admin.email,
        action: "PAYOUT_COMPLETED",
        entityType: "Payout",
        entityId: payout.id,
        newValue: { amount: payout.amount.toString(), vendorId: payout.vendorId },
      });
    });

    await notify(prisma, {
      userId: payout.vendor.userId,
      type: "PAYOUT",
      title: "Payout completed",
      message: `Your payout of ${payout.amount} has been sent.`,
      linkUrl: "/vendor/wallet",
    });

    const updated = await prisma.payout.findUnique({ where: { id: params.id } });
    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
