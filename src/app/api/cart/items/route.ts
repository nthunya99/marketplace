import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { cartItemSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

/**
 * POST /api/cart/items — add (or increment) a line item.
 * Stock is validated here against current DB state, and re-validated again
 * at checkout time inside the checkout transaction (spec section 6: never
 * let a customer buy more than available stock; stock can change between
 * add-to-cart and checkout).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("CUSTOMER");
    const data = cartItemSchema.parse(await req.json());

    const product = await prisma.product.findUnique({
      where: { id: data.productId },
      include: { variants: true },
    });
    if (!product || product.status !== "PUBLISHED") {
      throw new BusinessError("Product not available.");
    }

    let variant = null;
    if (data.variantId) {
      variant = product.variants.find((v) => v.id === data.variantId);
      if (!variant) throw new BusinessError("Selected variant not found.");
    }

    const availableStock = variant ? variant.stockQuantity : product.stockQuantity;

    const cart = await prisma.cart.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    // Prisma's compound-unique selector (cartId_productId_variantId)
    // rejects an explicit `null` for the nullable variantId field at
    // runtime, even though null is exactly what "no variant" means in
    // the schema — so a variant-less quick-add (the product grid's
    // "Add to cart" button, or any product without variants) has to be
    // looked up with plain field filters instead of the compound key.
    const existingItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: data.productId,
        variantId: data.variantId ?? null,
      },
    });

    const desiredQuantity = (existingItem?.quantity ?? 0) + data.quantity;
    if (desiredQuantity > availableStock) {
      throw new BusinessError(
        `Only ${availableStock} unit(s) of this item are in stock.`
      );
    }

    const item = existingItem
      ? await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: desiredQuantity },
        })
      : await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId: data.productId,
            variantId: data.variantId,
            quantity: data.quantity,
          },
        });

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
