import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");
    const sp = req.nextUrl.searchParams;
    const entityType = sp.get("entityType");
    const action = sp.get("action");

    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: entityType ?? undefined,
        action: action ?? undefined,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json(logs);
  } catch (err) {
    return handleApiError(err);
  }
}
