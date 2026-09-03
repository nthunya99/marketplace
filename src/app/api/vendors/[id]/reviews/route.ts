import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { vendorReviewSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const vendor = await prisma.vendorProfile.findFirst({
      where: { OR: [{ id: params.id }, { storeSlug: params.id }] },
      select: { id: true },
    });
    if (!vendor) throw new BusinessError("Vendor not found");

    const [reviews, aggregate] = await Promise.all([
      prisma.vendorReview.findMany({
        where: { vendorId: vendor.id, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      }),
      prisma.vendorReview.aggregate({
        where: { vendorId: vendor.id, status: "APPROVED" },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      reviews,
      averageRating: aggregate._avg.rating ?? 0,
      reviewCount: aggregate._count,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * A customer may leave a seller review if they have at least one order
 * involving this vendor — same verified-purchase philosophy as product
 * reviews.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("CUSTOMER");
    const data = vendorReviewSchema.parse(await req.json());

    const vendor = await prisma.vendorProfile.findFirst({
      where: { OR: [{ id: params.id }, { storeSlug: params.id }] },
    });
    if (!vendor) throw new BusinessError("Vendor not found");

    const purchase = await prisma.vendorOrder.findFirst({
      where: { vendorId: vendor.id, order: { customerId: user.id } },
    });
    if (!purchase) throw new BusinessError("You can only review vendors you have purchased from.");

    const existing = await prisma.vendorReview.findUnique({
      where: { vendorId_userId: { vendorId: vendor.id, userId: user.id } },
    });
    if (existing) throw new BusinessError("You have already reviewed this seller.");

    const review = await prisma.vendorReview.create({
      data: {
        vendorId: vendor.id,
        userId: user.id,
        rating: data.rating,
        body: data.body,
        status: "PENDING",
      },
    });

    return NextResponse.json(review, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
