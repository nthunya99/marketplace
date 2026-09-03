import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { wishlistItemSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

/**
 * POST /api/wishlist/items — prevents duplicate entries per spec section
 * 14 via the (wishlistId, productId) unique constraint; a duplicate add
 * is treated as a no-op success rather than an error, since from the
 * customer's perspective "add to wishlist" on an already-wishlisted item
 * isn't a mistake worth surfacing.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("CUSTOMER");
    const { productId } = wishlistItemSchema.parse(await req.json());

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new BusinessError("Product not found");

    const wishlist = await prisma.wishlist.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    const item = await prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
      update: {},
      create: { wishlistId: wishlist.id, productId },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
