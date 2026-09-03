import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";
import { Decimal } from "@prisma/client/runtime/library";

export async function GET() {
  try {
    const user = await requireRole("CUSTOMER");

    const cart = await prisma.cart.findUnique({
      where: { userId: user.id },
      include: {
        items: {
          include: {
            product: {
              include: { images: { orderBy: { sortOrder: "asc" }, take: 1 }, vendor: true },
            },
            variant: true,
          },
        },
      },
    });

    if (!cart) return NextResponse.json({ items: [], subtotal: "0.00" });

    let subtotal = new Decimal(0);
    const items = cart.items.map((item) => {
      const unitPrice = item.variant
        ? item.variant.price
        : item.product.discountPrice ?? item.product.price;
      const lineTotal = new Decimal(unitPrice).mul(item.quantity);
      subtotal = subtotal.add(lineTotal);

      const availableStock = item.variant ? item.variant.stockQuantity : item.product.stockQuantity;

      return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        name: item.product.name,
        image: item.product.images[0]?.url ?? null,
        vendorName: item.product.vendor.storeName,
        unitPrice: unitPrice.toString(),
        quantity: item.quantity,
        lineTotal: lineTotal.toString(),
        availableStock,
        inStock: item.quantity <= availableStock,
      };
    });

    return NextResponse.json({ items, subtotal: subtotal.toString() });
  } catch (err) {
    return handleApiError(err);
  }
}
