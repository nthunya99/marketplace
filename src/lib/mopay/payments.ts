import type { MopayPayment, VendorProfile } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { BusinessError } from "@/lib/api-utils";
import { confirmDirectVendorOrderPayment } from "@/lib/direct-payment";
import { getSession, mapSessionStatus, METHOD_LABEL, MopayError } from "./client";

export function vendorMopayKey(vendor: Pick<VendorProfile, "storeName" | "mopayApiKeyEnc">) {
  if (!vendor.mopayApiKeyEnc) throw new BusinessError(`${vendor.storeName} hasn't finished setting up online payments.`);
  try {
    return decryptSecret(vendor.mopayApiKeyEnc);
  } catch {
    throw new BusinessError(`${vendor.storeName}'s payment connection needs to be re-entered. Please try again later.`);
  }
}

const FINAL = ["SUCCESS", "FAILED", "CANCELLED", "EXPIRED"];

/**
 * Ask MoPay for the current state of a session and apply it. Success
 * confirms the vendor order (once — both the row update and the order
 * confirmation are conditional). The amount and reference MoPay reports
 * must match what we asked for, or the payment is not accepted.
 */
export async function syncMopayPayment(
  payment: MopayPayment,
  vendor: VendorProfile,
  actor: { id: string; email?: string | null }
): Promise<MopayPayment> {
  if (FINAL.includes(payment.status)) return payment;

  let session;
  try {
    session = await getSession(vendorMopayKey(vendor), payment.sessionId);
  } catch (e) {
    if (e instanceof MopayError) return payment; // try again later
    throw e;
  }

  let status = mapSessionStatus(session);
  let failureReason: string | null = null;
  if (
    status === "SUCCESS" &&
    (session.reference !== payment.reference || !new Decimal(session.amount).equals(payment.amount))
  ) {
    status = "FAILED";
    failureReason = `MoPay reported ${session.amount} for ${session.reference}; expected ${payment.amount} for ${payment.reference}.`;
  }
  if (status === payment.status) return payment;

  return prisma.$transaction(async (tx) => {
    const moved = await tx.mopayPayment.updateMany({
      where: { id: payment.id, status: { in: ["CREATED", "PROCESSING"] } },
      data: {
        status,
        selectedPaymentMethod: session.selectedPaymentMethod ?? undefined,
        mopayTransactionId: session.transactionId ?? undefined,
        failureReason: failureReason ?? (status === "SUCCESS" ? null : undefined),
      },
    });
    if (moved.count > 0 && status === "SUCCESS") {
      await confirmDirectVendorOrderPayment(tx, {
        vendorOrderId: payment.vendorOrderId,
        actor,
        method: "mopay",
        methodLabel: METHOD_LABEL[session.selectedPaymentMethod ?? ""] ?? "online",
        reference: session.transactionId ?? payment.sessionId,
      });
    }
    return tx.mopayPayment.findUniqueOrThrow({ where: { id: payment.id } });
  });
}

export async function latestOpenMopayPayment(vendorOrderId: string) {
  return prisma.mopayPayment.findFirst({
    where: { vendorOrderId, status: { in: ["CREATED", "PROCESSING"] } },
    orderBy: { createdAt: "desc" },
  });
}
