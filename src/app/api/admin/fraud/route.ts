import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const flags = await prisma.fraudFlag.findMany({
      where: { status: "OPEN" },
      orderBy: { score: "desc" },
      include: {
        order: {
          select: {
            orderNumber: true,
            grandTotal: true,
            createdAt: true,
            customer: { select: { name: true, email: true } },
          },
        },
      },
    });
    return NextResponse.json(flags);
  } catch (err) {
    return handleApiError(err);
  }
}
