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
    if (payout.status === "COMPLETED") {
      throw new BusinessError("Cannot reject a payout that has already been completed.");
    }

    const updated = await prisma.payout.update({
      where: { id: params.id },
      data: { status: "REJECTED", adminNote, processedAt: new Date() },
    });

    await notify(prisma, {
      userId: payout.vendor.userId,
      type: "PAYOUT",
      title: "Payout rejected",
      message: adminNote
        ? `Your payout request for ${payout.amount} was rejected: ${adminNote}`
        : `Your payout request for ${payout.amount} was rejected.`,
      linkUrl: "/vendor/wallet",
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
