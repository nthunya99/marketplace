import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { productReviewSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

/**
 * GET /api/products/[id]/reviews — public, approved reviews only, plus
 * the aggregate rating (spec section 15).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const product = await prisma.product.findFirst({
      where: { OR: [{ id: params.id }, { slug: params.id }] },
      select: { id: true },
    });
    if (!product) throw new BusinessError("Product not found");

    const [reviews, aggregate] = await Promise.all([
      prisma.productReview.findMany({
        where: { productId: product.id, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      }),
      prisma.productReview.aggregate({
        where: { productId: product.id, status: "APPROVED" },
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
 * POST /api/products/[id]/reviews
 * Only customers who have an order containing this product may review it
 * (spec section 15: "customers should only be able to submit
 * verified-purchase reviews where appropriate" — Phase 2 enforces this as
 * a hard requirement rather than a soft flag, which is the safer default
 * for marketplace trust). One review per product per customer.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("CUSTOMER");
    const data = productReviewSchema.parse(await req.json());

    const product = await prisma.product.findFirst({
      where: { OR: [{ id: params.id }, { slug: params.id }] },
    });
    if (!product) throw new BusinessError("Product not found");

    const purchase = await prisma.orderItem.findFirst({
      where: {
        productId: product.id,
        vendorOrder: {
          order: { customerId: user.id },
          status: { in: ["DELIVERED", "SHIPPED", "PROCESSING", "CONFIRMED"] },
        },
      },
    });
    if (!purchase) {
      throw new BusinessError("You can only review products you have purchased.");
    }

    const existing = await prisma.productReview.findUnique({
      where: { productId_userId: { productId: product.id, userId: user.id } },
    });
    if (existing) throw new BusinessError("You have already reviewed this product.");

    const review = await prisma.productReview.create({
      data: {
        productId: product.id,
        userId: user.id,
        rating: data.rating,
        title: data.title,
        body: data.body,
        images: data.images ?? [],
        verifiedPurchase: true,
        status: "PENDING",
      },
    });

    return NextResponse.json(review, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
