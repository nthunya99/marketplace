import crypto from "crypto";

/**
 * Client for the Vodacom M-Pesa Open API, Lesotho market (vodacomLES).
 *
 * Every vendor brings their own credentials from the M-Pesa Open API
 * portal (https://openapiportal.m-pesa.com):
 *   - apiKey              the key of the application they created
 *   - publicKey           the Open API public key shown in the portal
 *   - serviceProviderCode their M-Pesa business short code
 *   - environment         "sandbox" while testing, "openapi" once Vodacom
 *                         has approved the application to go live
 *
 * Authentication is Vodacom's two-step scheme: the API key is RSA-encrypted
 * with the public key to request a session, and that session ID is
 * RSA-encrypted again and sent as the bearer token on each transaction.
 * Sessions are cached per credential set.
 *
 * Endpoint shapes and response codes follow the Open API documentation.
 * They could not be exercised against Vodacom from the development
 * environment, so run the sandbox end to end before switching a vendor to
 * live.
 */

const HOST = process.env.MPESA_API_HOST ?? "https://openapi.m-pesa.com";
const MARKET = "vodacomLES";
export const MPESA_COUNTRY = "LES";
export const MPESA_CURRENCY = "LSL";

export type MpesaEnvironment = "sandbox" | "openapi";

export type MpesaCredentials = {
  apiKey: string;
  publicKey: string;
  serviceProviderCode: string;
  environment: MpesaEnvironment;
};

export type MpesaResult = {
  ok: boolean;
  responseCode: string;
  responseDesc: string;
  raw: Record<string, unknown>;
};

export class MpesaError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

/** The portal shows the key as bare base64; accept that or full PEM. */
export function toPem(publicKey: string): string {
  const trimmed = publicKey.trim();
  if (trimmed.includes("BEGIN PUBLIC KEY")) return trimmed;
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
}

/** Throws if the text isn't a usable RSA public key. */
export function assertValidPublicKey(publicKey: string) {
  try {
    crypto.createPublicKey(toPem(publicKey));
  } catch {
    throw new MpesaError("The public key isn't valid. Copy it exactly as shown in the M-Pesa Open API portal.");
  }
}

function rsaEncrypt(publicKey: string, value: string): string {
  return crypto
    .publicEncrypt({ key: toPem(publicKey), padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(value))
    .toString("base64");
}

function url(env: MpesaEnvironment, path: string) {
  return `${HOST}/${env}/ipg/v2/${MARKET}/${path}/`;
}

const SESSION_TTL_MS = 45 * 60 * 1000; // sessions last about an hour; refresh early
const sessionCache = new Map<string, { sessionId: string; expiresAt: number }>();

function cacheKey(c: MpesaCredentials) {
  return crypto.createHash("sha256").update(`${c.environment}|${c.serviceProviderCode}|${c.apiKey}`).digest("hex");
}

async function callApi(
  method: "GET" | "POST" | "PUT",
  endpoint: string,
  bearer: string,
  body: Record<string, unknown> | null,
  timeoutMs: number
): Promise<{ status: number; json: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: "*",
        Authorization: `Bearer ${bearer}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function toResult(json: Record<string, unknown>): MpesaResult {
  const responseCode = String(json.output_ResponseCode ?? "");
  const responseDesc = String(json.output_ResponseDesc ?? json.output_error ?? "No response description");
  return { ok: responseCode === "INS-0", responseCode, responseDesc, raw: json };
}

/** Get (or reuse) a session ID. forceNew skips the cache. */
export async function getSession(c: MpesaCredentials, forceNew = false): Promise<string> {
  const key = cacheKey(c);
  const cached = sessionCache.get(key);
  if (!forceNew && cached && cached.expiresAt > Date.now()) return cached.sessionId;

  let status: number;
  let json: Record<string, unknown>;
  try {
    ({ status, json } = await callApi("GET", url(c.environment, "getSession"), rsaEncrypt(c.publicKey, c.apiKey), null, 20_000));
  } catch {
    throw new MpesaError("Couldn't reach M-Pesa. Check your internet connection and try again.");
  }
  const result = toResult(json);
  const sessionId = json.output_SessionID as string | undefined;
  if (!result.ok || !sessionId) {
    throw new MpesaError(
      status === 401 || result.responseCode === "INS-2"
        ? "M-Pesa rejected the API key. Check it matches the application in the Open API portal and the selected environment."
        : `M-Pesa couldn't start a session: ${result.responseDesc}`,
      result.responseCode || String(status)
    );
  }
  sessionCache.set(key, { sessionId, expiresAt: Date.now() + SESSION_TTL_MS });
  return sessionId;
}

/**
 * Run an authenticated call. A fresh session can take a few seconds to
 * become active on Vodacom's side, and a cached one can be revoked early,
 * so an auth failure is retried once with a new session.
 */
async function withSession(
  c: MpesaCredentials,
  method: "GET" | "POST" | "PUT",
  path: string,
  body: Record<string, unknown> | null,
  timeoutMs: number
): Promise<MpesaResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const sessionId = await getSession(c, attempt > 0);
    const endpoint = url(c.environment, path);
    const query = method === "GET" && body ? `?${new URLSearchParams(body as Record<string, string>)}` : "";
    const { status, json } = await callApi(
      method,
      endpoint + query,
      rsaEncrypt(c.publicKey, sessionId),
      method === "GET" ? null : body,
      timeoutMs
    );
    if (status === 401 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    return toResult(json);
  }
  throw new MpesaError("M-Pesa session could not be authorised.");
}

/**
 * Customer-to-business single-stage payment: the customer gets a PIN
 * prompt on their phone, and the call returns once they approve, decline
 * or the prompt times out. Can take over a minute. Throws AbortError if
 * our own timeout fires first — the outcome is then unknown and must be
 * checked with queryTransactionStatus.
 */
export function c2bPayment(
  c: MpesaCredentials,
  p: { amount: string; customerMsisdn: string; thirdPartyConversationId: string; transactionReference: string; description: string }
) {
  return withSession(
    c,
    "POST",
    "c2bPayment/singleStage",
    {
      input_Amount: p.amount,
      input_Country: MPESA_COUNTRY,
      input_Currency: MPESA_CURRENCY,
      input_CustomerMSISDN: p.customerMsisdn,
      input_ServiceProviderCode: c.serviceProviderCode,
      input_ThirdPartyConversationID: p.thirdPartyConversationId,
      input_TransactionReference: p.transactionReference,
      input_PurchasedItemsDesc: p.description.slice(0, 100),
    },
    110_000
  );
}

/** Look up a transaction by the conversation ID we generated for it. */
export function queryTransactionStatus(c: MpesaCredentials, p: { queryReference: string }) {
  return withSession(
    c,
    "GET",
    "queryTransactionStatus",
    {
      input_QueryReference: p.queryReference,
      input_ServiceProviderCode: c.serviceProviderCode,
      input_ThirdPartyConversationID: newConversationId(),
      input_Country: MPESA_COUNTRY,
    },
    30_000
  );
}

/** Reverse all or part of a successful payment (used for refunds). */
export function reversal(c: MpesaCredentials, p: { transactionId: string; amount: string }) {
  return withSession(
    c,
    "PUT",
    "reversal",
    {
      input_ReversalAmount: p.amount,
      input_Country: MPESA_COUNTRY,
      input_ServiceProviderCode: c.serviceProviderCode,
      input_ThirdPartyConversationID: newConversationId(),
      input_TransactionID: p.transactionId,
    },
    60_000
  );
}

export function newConversationId() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Normalise a Lesotho mobile number to 266XXXXXXXX. Accepts "5812 3456",
 * "+266 58123456", "26658123456", etc.
 */
export function normaliseLesothoMsisdn(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const local = digits.startsWith("266") ? digits.slice(3) : digits;
  return /^\d{8}$/.test(local) ? `266${local}` : null;
}

/** Customer-facing wording for the Open API's common response codes. */
const FRIENDLY: Record<string, string> = {
  "INS-5": "The payment was cancelled on the phone.",
  "INS-6": "The payment didn't go through. Please try again.",
  "INS-9": "The payment request timed out before it was approved on the phone.",
  "INS-10": "This payment was already submitted.",
  "INS-996": "This M-Pesa account isn't active.",
  "INS-2001": "The M-Pesa PIN was incorrect.",
  "INS-2006": "There isn't enough money in the M-Pesa account.",
  "INS-2051": "That number isn't a valid M-Pesa number.",
};

export function describeResponse(code: string, desc: string) {
  return FRIENDLY[code] ?? `M-Pesa said: ${desc}${code ? ` (${code})` : ""}`;
}
