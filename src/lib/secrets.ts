import crypto from "crypto";

/**
 * Encryption for third-party credentials stored in the database (vendor
 * M-Pesa API keys). AES-256-GCM with a key that lives only in the
 * environment, so a database leak alone doesn't expose vendors' keys.
 *
 * PAYMENT_CREDENTIALS_KEY must be 32 random bytes, base64-encoded:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Changing or losing the key makes stored credentials unreadable —
 * vendors would have to re-enter them. Back it up with your other secrets.
 */

const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.PAYMENT_CREDENTIALS_KEY;
  if (!raw) {
    throw new Error("PAYMENT_CREDENTIALS_KEY is not set — cannot store or read payment credentials.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("PAYMENT_CREDENTIALS_KEY must be 32 bytes, base64-encoded.");
  }
  return key;
}

export function secretsConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, ivB64, tagB64, dataB64] = stored.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) throw new Error("Unrecognised secret format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** "••••••••3f9a" — enough for a vendor to recognise which key is saved. */
export function maskSecret(plain: string): string {
  return plain.length <= 4 ? "••••" : `••••••••${plain.slice(-4)}`;
}
