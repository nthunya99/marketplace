import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { reviewModerationSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

/**
 * PATCH /api/reviews/[id]/moderate?type=product|vendor
 * A single moderation endpoint for both review types since the
 * authorization and action shape (admin sets APPROVED/REJECTED) is
 * identical; `type` disambiguates which table `id` refers to.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole("ADMIN");
    const { status } = reviewModerationSchema.parse(await req.json());
    const type = req.nextUrl.searchParams.get("type") === "vendor" ? "vendor" : "product";

    if (type === "vendor") {
      const existing = await prisma.vendorReview.findUnique({ where: { id: params.id } });
      if (!existing) throw new BusinessError("Review not found");
      const updated = await prisma.vendorReview.update({ where: { id: params.id }, data: { status } });
      return NextResponse.json(updated);
    }

    const existing = await prisma.productReview.findUnique({ where: { id: params.id } });
    if (!existing) throw new BusinessError("Review not found");
    const updated = await prisma.productReview.update({ where: { id: params.id }, data: { status } });
    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
