import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { getAIProvider } from "@/lib/ai";
import { z } from "zod";
import { BRAND } from "@/lib/brand";

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .min(1)
    .max(20),
});

/**
 * POST /api/ai/support
 * Answers general marketplace questions and, when the signed-in customer
 * has real orders, grounds answers in their actual order data (fetched
 * fresh from the DB — never trusted from the client, never invented by
 * the model) so it can answer "where's my order" accurately instead of
 * guessing. Returns a clear, honest message if no AI provider is
 * configured rather than a fake canned reply.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { messages } = schema.parse(await req.json());

    const provider = getAIProvider();
    if (!provider) {
      return NextResponse.json({
        reply:
          "AI support isn't configured on this deployment yet. An administrator needs to set ANTHROPIC_API_KEY in the environment. In the meantime, you can check your orders under \"My Orders\" or message the seller directly from a product page.",
        configured: false,
      });
    }

    // Ground the assistant in this customer's real, recent orders — never
    // let the model invent order details.
    let orderContext = "";
    if (user.role === "CUSTOMER") {
      const orders = await prisma.order.findMany({
        where: { customerId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { vendorOrders: { include: { vendor: { select: { storeName: true } }, items: true } } },
      });
      if (orders.length > 0) {
        orderContext = orders
          .map((o) => {
            const vendorSummaries = o.vendorOrders
              .map(
                (vo) =>
                  `  - ${vo.vendor.storeName}: ${vo.status}${vo.trackingNumber ? `, tracking ${vo.trackingNumber}` : ""}`
              )
              .join("\n");
            return `Order ${o.orderNumber} (placed ${o.createdAt.toISOString().slice(0, 10)}, total ${o.grandTotal}, status ${o.status}):\n${vendorSummaries}`;
          })
          .join("\n\n");
      }
    }

    const systemPrompt = `You are the customer support assistant for ${BRAND.name} (${BRAND.domain}), a multi-vendor online marketplace in Lesotho. "${BRAND.name}" is Sesotho for "${BRAND.meaning}". Prices are in Maloti (LSL). Answer only using the order information provided below (if any) and general knowledge of how ${BRAND.name} works (multi-vendor checkout, returns, wishlists, coupons, loyalty points). If asked about specific order details not shown below, say you don't have that information and suggest checking "My Orders" or contacting the seller directly. Be concise and friendly. Never invent order numbers, statuses, or tracking numbers.

${orderContext ? `This customer's recent orders:\n${orderContext}` : "This customer has no orders yet."}`;

    const reply = await provider.chat(messages, systemPrompt);
    return NextResponse.json({ reply, configured: true });
  } catch (err) {
    return handleApiError(err);
  }
}
