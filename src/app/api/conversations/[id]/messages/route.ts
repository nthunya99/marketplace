import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-utils";
import { messageSchema } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { notify } from "@/lib/notifications";

async function assertParticipant(conversationId: string, userId: string, role: string, vendorId?: string | null) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { vendor: true },
  });
  if (!conversation) throw new BusinessError("Conversation not found");

  const isCustomer = role === "CUSTOMER" && conversation.customerId === userId;
  const isVendor = role === "VENDOR" && conversation.vendorId === vendorId;
  const isAdmin = role === "ADMIN";
  if (!isCustomer && !isVendor && !isAdmin) {
    throw new BusinessError("You do not have access to this conversation.");
  }
  return conversation;
}

/**
 * GET /api/conversations/[id]/messages — the client polls this on an
 * interval to approximate real-time delivery (see the schema comment on
 * the Conversation model). Marks the other party's messages as read as a
 * side effect of viewing the thread.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await assertParticipant(params.id, user.id, user.role, user.vendorId);

    const messages = await prisma.message.findMany({
      where: { conversationId: params.id },
      orderBy: { createdAt: "asc" },
      include: { sender: { select: { name: true, role: true } } },
    });

    await prisma.message.updateMany({
      where: { conversationId: params.id, senderId: { not: user.id }, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json(messages);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const conversation = await assertParticipant(params.id, user.id, user.role, user.vendorId);
    const data = messageSchema.parse(await req.json());

    const message = await prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          conversationId: params.id,
          senderId: user.id,
          body: data.body,
          attachmentUrl: data.attachmentUrl,
        },
      });
      await tx.conversation.update({ where: { id: params.id }, data: { lastMessageAt: new Date() } });
      return m;
    });

    // Notify the other participant.
    const recipientId =
      user.id === conversation.customerId ? conversation.vendor.userId : conversation.customerId;
    const recipientIsVendor = recipientId === conversation.vendor.userId;
    await notify(prisma, {
      userId: recipientId,
      type: "MESSAGE",
      title: "New message",
      message: data.body ? data.body.slice(0, 140) : "Sent an attachment.",
      linkUrl: recipientIsVendor ? `/vendor/messages/${params.id}` : `/messages/${params.id}`,
    });

    return NextResponse.json(message, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
