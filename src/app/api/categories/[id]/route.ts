import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { categorySchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole("ADMIN");
    const data = categorySchema.partial().parse(await req.json());

    const existing = await prisma.category.findUnique({ where: { id: params.id } });
    if (!existing) throw new BusinessError("Category not found");

    const updated = await prisma.category.update({
      where: { id: params.id },
      data: {
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
        parentId: data.parentId,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole("ADMIN");

    const productCount = await prisma.product.count({ where: { categoryId: params.id } });
    if (productCount > 0) {
      throw new BusinessError(
        "Cannot delete a category that still has products. Reassign or archive those products first."
      );
    }

    await prisma.category.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
