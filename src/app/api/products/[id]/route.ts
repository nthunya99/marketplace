import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/auth-utils";
import { productSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { recordAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const product = await prisma.product.findFirst({
      where: { OR: [{ id: params.id }, { slug: params.id }] },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        variants: true,
        attributes: true,
        category: { select: { name: true, slug: true } },
        vendor: {
          select: { storeName: true, storeSlug: true, isVerified: true, id: true, status: true },
        },
      },
    });
    if (!product || (product.status !== "PUBLISHED" && !(await isOwnerOrAdmin(product.vendorId))))
      throw new BusinessError("Product not found");

    return NextResponse.json(product);
  } catch (err) {
    return handleApiError(err);
  }
}

async function isOwnerOrAdmin(vendorId: string): Promise<boolean> {
  try {
    const user = await requireUser();
    if (user.role === "ADMIN") return true;
    if (user.role === "VENDOR" && user.vendorId === vendorId) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * PATCH — vendor edits their own product (or admin edits any).
 * Ownership is re-checked server-side; a vendor can never edit another
 * vendor's product no matter what productId the client sends.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("VENDOR", "ADMIN");
    const existing = await prisma.product.findUnique({ where: { id: params.id } });
    if (!existing) throw new BusinessError("Product not found");

    if (user.role === "VENDOR" && existing.vendorId !== user.vendorId) {
      throw new BusinessError("You do not have permission to edit this product.");
    }

    const data = productSchema.partial().parse(await req.json());

    const updated = await prisma.product.update({
      where: { id: params.id },
      data: {
        name: data.name,
        description: data.description,
        shortDescription: data.shortDescription,
        categoryId: data.categoryId,
        price: data.price,
        discountPrice: data.discountPrice,
        stockQuantity: data.stockQuantity,
        brand: data.brand,
        tags: data.tags,
        status: data.status,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole("VENDOR", "ADMIN");
    const existing = await prisma.product.findUnique({ where: { id: params.id } });
    if (!existing) throw new BusinessError("Product not found");

    if (user.role === "VENDOR" && existing.vendorId !== user.vendorId) {
      throw new BusinessError("You do not have permission to delete this product.");
    }

    // Soft-delete via ARCHIVED status preserves order history integrity
    // (OrderItem snapshots product name/price already, but we still never
    // want to hard-delete a product that has historical orders).
    const orderCount = await prisma.orderItem.count({ where: { productId: params.id } });
    if (orderCount > 0) {
      await prisma.product.update({ where: { id: params.id }, data: { status: "ARCHIVED" } });
    } else {
      await prisma.product.delete({ where: { id: params.id } });
    }

    await recordAudit(prisma, {
      actorId: user.id,
      actorEmail: user.email,
      action: "PRODUCT_DELETED",
      entityType: "Product",
      entityId: params.id,
      previousValue: { name: existing.name, status: existing.status },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
