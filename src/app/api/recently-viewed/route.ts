import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";

export async function GET() {
  try {
    const user = await requireRole("CUSTOMER");
    const items = await prisma.recentlyViewed.findMany({
      where: { userId: user.id },
      orderBy: { viewedAt: "desc" },
      take: 12,
      include: {
        product: {
          include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, vendor: { select: { storeName: true } } },
        },
      },
    });
    return NextResponse.json(items.filter((i) => i.product.status === "PUBLISHED"));
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/recently-viewed — called from the product detail page on
 * view. Upserts so re-viewing a product just bumps it to the top rather
 * than creating duplicate history rows.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("CUSTOMER");
    const { productId } = await req.json();
    if (!productId) throw new BusinessError("productId is required.");

    const item = await prisma.recentlyViewed.upsert({
      where: { userId_productId: { userId: user.id, productId } },
      update: { viewedAt: new Date() },
      create: { userId: user.id, productId },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
