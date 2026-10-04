import crypto from "crypto";

/**
 * Client for MoPay (https://mopay.co.ls/docs), a Lesotho payment gateway.
 * A vendor creates their own MoPay project and gives us its API key; one
 * integration then covers M-Pesa, EcoCash and Visa/Mastercard through
 * MoPay's hosted checkout page.
 *
 * Flow: create a session (server-side, with the vendor's key) → send the
 * customer to paymentUrl → MoPay redirects back to our redirectUrl → we
 * fetch the session from MoPay to confirm the result. The redirect's own
 * query parameters are never trusted, as MoPay's docs advise.
 *
 * New MoPay projects start in sandbox, where preset phone numbers simulate
 * each outcome (e.g. M-Pesa 52211111 = success, EcoCash 63211111 =
 * success). Sandbox vs live is a setting on the vendor's MoPay project.
 */

const HOST = process.env.MOPAY_API_HOST ?? "https://mopay.co.ls";

export class MopayError extends Error {}

export type MopaySession = {
  sessionId: string;
  amount: string;
  reference: string;
  status: "CREATED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED" | string;
  transactionStatus: "success" | "failed" | "cancelled" | null;
  selectedPaymentMethod: string | null;
  transactionId: string | null;
};

async function request(path: string, init: RequestInit, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${HOST}${path}`, { ...init, signal: controller.signal, cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    return { status: res.status, json };
  } catch {
    throw new MopayError("Couldn't reach MoPay. Please try again in a moment.");
  } finally {
    clearTimeout(timer);
  }
}

/** MoPay references must be letters and digits only, and unique. */
export function makeReference(orderNumber: string) {
  const base = orderNumber.replace(/[^A-Za-z0-9]/g, "").slice(-16);
  return `${base}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function createSession(
  apiKey: string,
  p: { amount: string; reference: string; redirectUrl: string; description: string; customerEmail?: string; customerName?: string }
) {
  const { status, json } = await request("/api/external/payment", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: p.amount,
      reference: p.reference,
      redirectUrl: p.redirectUrl,
      description: p.description.slice(0, 200),
      customerEmail: p.customerEmail,
      customerName: p.customerName,
    }),
  });
  if (!json.success || !json.sessionId || !json.paymentUrl) {
    const msg = String(json.error ?? `HTTP ${status}`);
    if (status === 401 || /api key/i.test(msg)) {
      throw new MopayError("MoPay rejected the API key. Copy it again from your MoPay project settings.");
    }
    throw new MopayError(`MoPay couldn't create the payment: ${msg}`);
  }
  return { sessionId: String(json.sessionId), paymentUrl: String(json.paymentUrl) };
}

export async function getSession(apiKey: string, sessionId: string): Promise<MopaySession> {
  const { status, json } = await request(`/api/external/session/v1/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
  });
  if (!json.success || !json.session) {
    throw new MopayError(`MoPay couldn't look up the payment (${json.error ?? `HTTP ${status}`}).`);
  }
  const s = json.session;
  return {
    sessionId: String(s.sessionId),
    amount: String(s.amount),
    reference: String(s.reference),
    status: String(s.status),
    transactionStatus: s.transactionStatus ?? null,
    selectedPaymentMethod: s.selectedPaymentMethod ?? null,
    transactionId: s.transactionId ?? null,
  };
}

/** Our status for a MoPay session. */
export function mapSessionStatus(s: MopaySession) {
  if (s.status === "COMPLETED" || s.transactionStatus === "success") return "SUCCESS" as const;
  if (s.status === "FAILED" || s.transactionStatus === "failed") return "FAILED" as const;
  if (s.status === "CANCELLED" || s.transactionStatus === "cancelled") return "CANCELLED" as const;
  if (s.status === "EXPIRED") return "EXPIRED" as const;
  if (s.status === "PROCESSING") return "PROCESSING" as const;
  return "CREATED" as const;
}

export const METHOD_LABEL: Record<string, string> = {
  mpesa: "M-Pesa",
  ecocash: "EcoCash",
  card: "card",
};

/** Base URL MoPay redirects customers back to. Must be reachable by the browser. */
export function appBaseUrl() {
  return (process.env.PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
