import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const user = await requireRole("CUSTOMER");

    const wishlist = await prisma.wishlist.findUnique({
      where: { userId: user.id },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: { take: 1, orderBy: { sortOrder: "asc" } },
                vendor: { select: { storeName: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json(wishlist?.items ?? []);
  } catch (err) {
    return handleApiError(err);
  }
}
