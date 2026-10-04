import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();

    // Lightweight path for the header badge, which polls this endpoint.
    if (req.nextUrl.searchParams.get("countOnly") === "true") {
      const unreadCount = await prisma.notification.count({ where: { userId: user.id, isRead: false } });
      return NextResponse.json({ unreadCount });
    }
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    return handleApiError(err);
  }
}
