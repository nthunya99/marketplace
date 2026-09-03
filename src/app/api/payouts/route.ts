import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { payoutRequestSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

/**
 * GET /api/payouts — vendor sees their own payout history; admin sees all
 * (optionally filtered by status) for the approval queue.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole("VENDOR", "ADMIN");
    const status = req.nextUrl.searchParams.get("status");

    if (user.role === "VENDOR") {
      const payouts = await prisma.payout.findMany({
        where: { vendorId: user.vendorId ?? "" },
        orderBy: { requestedAt: "desc" },
      });
      return NextResponse.json(payouts);
    }

    const payouts = await prisma.payout.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { requestedAt: "desc" },
      include: { vendor: { select: { storeName: true } } },
    });
    return NextResponse.json(payouts);
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/payouts — vendor requests a withdrawal. Never allows a
 * request for more than the vendor's current available balance (spec
 * section 10); the balance itself isn't touched here — it's only
 * decremented once an admin marks the payout COMPLETED, so a vendor can't
 * double-spend by filing several pending requests (each new request is
 * checked against the *current*, not-yet-reserved balance minus any other
 * still-pending requests).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("VENDOR");
    if (!user.vendorId) throw new BusinessError("Vendor profile not found");
    const { amount } = payoutRequestSchema.parse(await req.json());

    const wallet = await prisma.vendorWallet.findUnique({ where: { vendorId: user.vendorId } });
    if (!wallet) throw new BusinessError("Wallet not found");

    const pendingPayouts = await prisma.payout.aggregate({
      where: { vendorId: user.vendorId, status: { in: ["REQUESTED", "APPROVED"] } },
      _sum: { amount: true },
    });
    const alreadyReserved = Number(pendingPayouts._sum.amount ?? 0);
    const reservableBalance = Number(wallet.availableBalance) - alreadyReserved;

    if (amount > reservableBalance) {
      throw new BusinessError(
        `You can request at most ${reservableBalance.toFixed(2)} (your available balance minus any pending requests).`
      );
    }

    const payout = await prisma.payout.create({
      data: { vendorId: user.vendorId, amount, status: "REQUESTED" },
    });

    return NextResponse.json(payout, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
