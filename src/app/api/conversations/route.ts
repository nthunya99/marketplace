import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole } from "@/lib/auth-utils";
import { conversationStartSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

/**
 * GET /api/conversations — customer sees their own conversations, vendor
 * sees conversations with their store. Includes the latest message and an
 * unread count so the list view doesn't need N+1 requests.
 */
export async function GET() {
  try {
    const user = await requireUser();

    const where =
      user.role === "VENDOR"
        ? { vendorId: user.vendorId ?? "" }
        : user.role === "CUSTOMER"
        ? { customerId: user.id }
        : {}; // admins can see all for moderation purposes

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      include: {
        customer: { select: { name: true } },
        vendor: { select: { storeName: true } },
        product: { select: { name: true, slug: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const withUnread = await Promise.all(
      conversations.map(async (c) => {
        const unreadCount = await prisma.message.count({
          where: { conversationId: c.id, isRead: false, senderId: { not: user.id } },
        });
        return { ...c, unreadCount };
      })
    );

    return NextResponse.json(withUnread);
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/conversations — a customer starts (or reuses) a conversation
 * with a vendor, optionally from a specific product page (spec section
 * 16: "customers should be able to start a conversation from a product
 * page"). The (customerId, vendorId, productId) unique constraint means
 * calling this twice for the same context just returns the existing
 * thread rather than creating duplicates.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("CUSTOMER");
    const { vendorId, productId } = conversationStartSchema.parse(await req.json());

    const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new BusinessError("Vendor not found");

    const conversation = await prisma.conversation.upsert({
      where: {
        customerId_vendorId_productId: {
          customerId: user.id,
          vendorId,
          productId: productId ?? null,
        } as any,
      },
      update: {},
      create: { customerId: user.id, vendorId, productId },
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
