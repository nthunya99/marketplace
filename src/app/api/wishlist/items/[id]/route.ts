import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("CUSTOMER");
    const item = await prisma.wishlistItem.findUnique({
      where: { id: params.id },
      include: { wishlist: true },
    });
    if (!item || item.wishlist.userId !== user.id) throw new BusinessError("Wishlist item not found");

    await prisma.wishlistItem.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/wishlist/items/[id] — "move to cart" (spec section 14):
 * adds the item to the cart (respecting current stock, same validation as
 * the regular add-to-cart flow) and removes it from the wishlist.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("CUSTOMER");
    const item = await prisma.wishlistItem.findUnique({
      where: { id: params.id },
      include: { wishlist: true, product: true },
    });
    if (!item || item.wishlist.userId !== user.id) throw new BusinessError("Wishlist item not found");
    if (item.product.status !== "PUBLISHED") throw new BusinessError("Product is no longer available.");
    if (item.product.stockQuantity < 1) throw new BusinessError("Product is out of stock.");

    const cart = await prisma.cart.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    await prisma.$transaction([
      prisma.cartItem.upsert({
        where: {
          cartId_productId_variantId: { cartId: cart.id, productId: item.productId, variantId: null } as any,
        },
        update: { quantity: { increment: 1 } },
        create: { cartId: cart.id, productId: item.productId, quantity: 1 },
      }),
      prisma.wishlistItem.delete({ where: { id: params.id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
