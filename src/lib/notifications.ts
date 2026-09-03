import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Central place every other service calls to raise an in-app notification
 * (spec section 17). Deliberately just inserts a row today; the interface
 * is the seam where email/SMS/WhatsApp/push fan-out gets added later
 * (Phase 3+) without touching callers.
 */
export async function notify(
  db: Prisma.TransactionClient | PrismaClient,
  params: { userId: string; type: string; title: string; message: string; linkUrl?: string }
) {
  return db.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      linkUrl: params.linkUrl,
    },
  });
}
