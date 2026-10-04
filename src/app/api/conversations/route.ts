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
 * with a vendor. Messaging is only available once a customer has an
 * actual relationship with that vendor: a VendorOrder that has moved
 * past PENDING (i.e. the vendor has confirmed payment, whether that was
 * instant via card or manual via a reviewed proof of payment). This
 * replaces the old "message seller from any product page" entry point —
 * a stranger browsing a listing can no longer message a vendor before
 * ever buying from them; the thread opens once there's a real order to
 * talk about. The (customerId, vendorId, productId) unique constraint
 * means calling this twice for the same context just returns the
 * existing thread rather than creating duplicates.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("CUSTOMER");
    const { vendorId, productId } = conversationStartSchema.parse(await req.json());

    const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new BusinessError("Vendor not found");

    const confirmedOrder = await prisma.vendorOrder.findFirst({
      where: {
        vendorId,
        status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "REFUNDED", "PARTIALLY_REFUNDED"] },
        order: { customerId: user.id },
      },
    });
    if (!confirmedOrder) {
      throw new BusinessError(
        "You can message a seller once you have a confirmed order with them."
      );
    }

    // Same nullable-compound-key limitation as cart items (see that
    // route's comment): upsert's `where` can't take an explicit null for
    // productId at runtime, so look the conversation up with plain field
    // filters and create it only if missing, instead of upserting on the
    // compound unique key.
    const existing = await prisma.conversation.findFirst({
      where: { customerId: user.id, vendorId, productId: productId ?? null },
    });
    const conversation =
      existing ??
      (await prisma.conversation.create({
        data: { customerId: user.id, vendorId, productId },
      }));

    return NextResponse.json(conversation, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
