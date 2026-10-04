import type { MpesaTransaction, VendorProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { confirmDirectVendorOrderPayment } from "@/lib/direct-payment";
import { queryTransactionStatus, describeResponse, MpesaError, type MpesaResult } from "./client";
import { vendorMpesaCredentials } from "./vendor";

type Actor = { id: string; email?: string | null };

/**
 * Record the outcome of a push (or a status lookup) on its transaction
 * row, and on success mark the vendor order paid — in one DB transaction
 * so a payment can never be recorded without its order being confirmed.
 */
export async function applyMpesaOutcome(
  txn: MpesaTransaction,
  outcome: { success: boolean; responseCode: string; responseDesc: string; mpesaTransactionId?: string; mpesaConversationId?: string },
  actor: Actor
) {
  return prisma.$transaction(async (tx) => {
    // Only a still-PENDING row may be resolved, so a slow response and a
    // status check can't both apply.
    const moved = await tx.mpesaTransaction.updateMany({
      where: { id: txn.id, status: "PENDING" },
      data: {
        status: outcome.success ? "SUCCESS" : "FAILED",
        responseCode: outcome.responseCode,
        responseDesc: outcome.responseDesc,
        mpesaTransactionId: outcome.mpesaTransactionId ?? undefined,
        mpesaConversationId: outcome.mpesaConversationId ?? undefined,
      },
    });
    if (moved.count > 0 && outcome.success) {
      await confirmDirectVendorOrderPayment(tx, {
        vendorOrderId: txn.vendorOrderId,
        actor,
        method: "mpesa",
        methodLabel: "M-Pesa",
        reference: outcome.mpesaTransactionId ?? txn.thirdPartyConversationId,
      });
    }
    return tx.mpesaTransaction.findUniqueOrThrow({ where: { id: txn.id } });
  });
}

export function outcomeFromPush(result: MpesaResult) {
  return {
    success: result.ok,
    responseCode: result.responseCode,
    responseDesc: result.ok ? result.responseDesc : describeResponse(result.responseCode, result.responseDesc),
    mpesaTransactionId: (result.raw.output_TransactionID as string | undefined) ?? undefined,
    mpesaConversationId: (result.raw.output_ConversationID as string | undefined) ?? undefined,
  };
}

const FINAL_FAILED_STATUSES = ["cancelled", "expired", "failed", "declined", "rejected", "reversed"];

/**
 * Ask Vodacom what happened to a push whose result we never received
 * (our request timed out). Leaves the row PENDING if M-Pesa doesn't have
 * a definite answer yet.
 */
export async function resolvePendingMpesaTransaction(
  txn: MpesaTransaction,
  vendor: VendorProfile,
  actor: Actor
): Promise<MpesaTransaction> {
  if (txn.status !== "PENDING") return txn;

  let result: MpesaResult;
  try {
    result = await queryTransactionStatus(vendorMpesaCredentials(vendor), {
      queryReference: txn.thirdPartyConversationId,
    });
  } catch (e) {
    if (e instanceof MpesaError || (e as Error)?.name === "AbortError") return txn;
    throw e;
  }
  if (!result.ok) return txn; // lookup itself failed; try again later

  const txStatus = String(result.raw.output_ResponseTransactionStatus ?? "").toLowerCase();
  if (txStatus === "completed") {
    return applyMpesaOutcome(
      txn,
      {
        success: true,
        responseCode: "INS-0",
        responseDesc: "Completed (confirmed by status check)",
        mpesaTransactionId: (result.raw.output_TransactionID as string | undefined) ?? undefined,
        mpesaConversationId: (result.raw.output_ConversationID as string | undefined) ?? undefined,
      },
      actor
    );
  }
  if (FINAL_FAILED_STATUSES.includes(txStatus)) {
    return applyMpesaOutcome(
      txn,
      { success: false, responseCode: result.responseCode, responseDesc: `The payment was ${txStatus}.` },
      actor
    );
  }
  return txn;
}
