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

    // Same nullable-compound-key limitation as /api/cart/items — upsert's
    // `where` can't take an explicit null for variantId at runtime, so
    // resolve whether the cart item already exists first, then run a
    // plain update-or-create in the transaction instead of an upsert on
    // the compound unique key.
    const existingCartItem = await prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId: item.productId, variantId: null },
    });

    await prisma.$transaction([
      existingCartItem
        ? prisma.cartItem.update({
            where: { id: existingCartItem.id },
            data: { quantity: { increment: 1 } },
          })
        : prisma.cartItem.create({
            data: { cartId: cart.id, productId: item.productId, quantity: 1 },
          }),
      prisma.wishlistItem.delete({ where: { id: params.id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
