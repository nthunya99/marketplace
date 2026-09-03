import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { payoutDecisionSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { notify } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole("ADMIN");
    const { adminNote } = payoutDecisionSchema.parse(await req.json().catch(() => ({})));

    const payout = await prisma.payout.findUnique({ where: { id: params.id }, include: { vendor: true } });
    if (!payout) throw new BusinessError("Payout not found");
    if (payout.status !== "REQUESTED") {
      throw new BusinessError(`Cannot approve a payout that is already ${payout.status}.`);
    }

    const updated = await prisma.payout.update({
      where: { id: params.id },
      data: { status: "APPROVED", adminNote },
    });

    await notify(prisma, {
      userId: payout.vendor.userId,
      type: "PAYOUT",
      title: "Payout approved",
      message: `Your payout request for ${payout.amount} has been approved and is being processed.`,
      linkUrl: "/vendor/wallet",
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
