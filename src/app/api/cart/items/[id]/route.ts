import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { z } from "zod";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("CUSTOMER");
    const { quantity } = z.object({ quantity: z.number().int().min(1).max(999) }).parse(
      await req.json()
    );

    const item = await prisma.cartItem.findUnique({
      where: { id: params.id },
      include: { cart: true, product: true, variant: true },
    });
    if (!item || item.cart.userId !== user.id) throw new BusinessError("Cart item not found");

    const availableStock = item.variant ? item.variant.stockQuantity : item.product.stockQuantity;
    if (quantity > availableStock) {
      throw new BusinessError(`Only ${availableStock} unit(s) of this item are in stock.`);
    }

    const updated = await prisma.cartItem.update({ where: { id: params.id }, data: { quantity } });
    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("CUSTOMER");
    const item = await prisma.cartItem.findUnique({ where: { id: params.id }, include: { cart: true } });
    if (!item || item.cart.userId !== user.id) throw new BusinessError("Cart item not found");

    await prisma.cartItem.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
