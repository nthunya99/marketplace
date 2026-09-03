import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";

/**
 * POST /api/reviews/[id]/report?type=product|vendor
 * Any authenticated user can flag a review for admin attention. This is
 * intentionally not itself a removal action — it just increments a
 * counter admins see in the moderation queue.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const type = req.nextUrl.searchParams.get("type") === "vendor" ? "vendor" : "product";

    if (type === "vendor") {
      const existing = await prisma.vendorReview.findUnique({ where: { id: params.id } });
      if (!existing) throw new BusinessError("Review not found");
      await prisma.vendorReview.update({
        where: { id: params.id },
        data: { reportCount: { increment: 1 } },
      });
    } else {
      const existing = await prisma.productReview.findUnique({ where: { id: params.id } });
      if (!existing) throw new BusinessError("Review not found");
      await prisma.productReview.update({
        where: { id: params.id },
        data: { reportCount: { increment: 1 } },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
