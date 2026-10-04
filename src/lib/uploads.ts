import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Local-disk file storage for vendor uploads (product images).
 *
 * This is the single choke point for writing and reading uploaded files,
 * the same pattern as src/lib/payment and src/lib/courier: everything goes
 * through saveProductImage()/readUpload(), so moving to object storage
 * (Cloudflare R2 / S3) later means changing this file only.
 *
 * Files live OUTSIDE /public (default: <project>/storage/uploads) and are
 * served by /api/uploads/[...path]. Next.js does not reliably serve files
 * added to /public after the server starts, so writing there would break
 * under `next start`.
 *
 * NOTE: local disk is fine for development and for a single VPS. On
 * serverless hosts (Vercel etc.) the disk is ephemeral — swap to object
 * storage before deploying there.
 */

export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "storage", "uploads");

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PRODUCT_IMAGES = 8;

type ImageKind = { ext: "jpg" | "png" | "webp"; mime: string };

/**
 * Identify the image type from its first bytes rather than trusting the
 * browser-supplied MIME type or file extension, which a client can set to
 * anything.
 */
export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { ext: "png", mime: "image/png" };
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Public URL prefix for a vendor's product images. */
export function productImagePrefix(vendorId: string) {
  return `/api/uploads/products/${vendorId}/`;
}

/** Shape every stored product image URL must match. */
export const PRODUCT_IMAGE_URL_RE =
  /^\/api\/uploads\/products\/[a-z0-9]+\/[a-f0-9-]{36}\.(jpg|png|webp)$/;

/**
 * Save an already-validated image buffer. Returns the URL to store on
 * ProductImage.url.
 */
export async function saveProductImage(vendorId: string, buf: Buffer, kind: ImageKind) {
  if (!/^[a-z0-9]+$/.test(vendorId)) throw new Error("Invalid vendor id");
  const dir = path.join(UPLOAD_ROOT, "products", vendorId);
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${crypto.randomUUID()}.${kind.ext}`;
  await fs.writeFile(path.join(dir, fileName), buf);
  return `${productImagePrefix(vendorId)}${fileName}`;
}

/**
 * Resolve a request path (the segments after /api/uploads/) to a file on
 * disk, refusing anything that escapes UPLOAD_ROOT. Returns null when the
 * file doesn't exist or the path is unsafe.
 */
export async function readUpload(segments: string[]) {
  if (segments.some((s) => !s || s === "." || s === ".." || s.includes("\\") || s.includes("\0"))) {
    return null;
  }
  const full = path.resolve(UPLOAD_ROOT, ...segments);
  if (!full.startsWith(UPLOAD_ROOT + path.sep)) return null;

  const ext = path.extname(full).slice(1).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;

  try {
    const data = await fs.readFile(full);
    return { data, mime };
  } catch {
    return null;
  }
}
