import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const notification = await prisma.notification.findUnique({ where: { id: params.id } });
    if (!notification || notification.userId !== user.id) {
      throw new BusinessError("Notification not found");
    }
    const updated = await prisma.notification.update({
      where: { id: params.id },
      data: { isRead: true },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
