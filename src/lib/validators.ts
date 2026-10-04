import { z } from "zod";

export const registerCustomerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * Where a vendor on offline payments gets paid: a bank account, an M-Pesa
 * number, an EcoCash number, or any mix. The mobile money numbers can be a
 * merchant (till) number OR an ordinary phone number registered for M-Pesa /
 * EcoCash — plenty of small businesses don't have a merchant account.
 * (The columns are still called mpesaMerchantNumber / ecocashMerchantNumber;
 * renaming them would mean a data migration for no functional gain.)
 */
export type PayoutDetails = {
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  mpesaMerchantNumber?: string | null;
  ecocashMerchantNumber?: string | null;
  mobileMoneyAccountType?: "PERSONAL" | "MERCHANT" | string;
};

const MOBILE_NUMBER_RE = /^\+?[0-9][0-9 ]{3,19}$/;

/**
 * Returns a message describing what's wrong with a set of payout details,
 * or null if they're usable. Shared by the registration form, the Store
 * settings form and both APIs, so every place applies the same rules:
 *   - at least one place to pay into;
 *   - a bank account needs its bank name and account holder name too,
 *     or a customer can't actually make the transfer;
 *   - mobile money numbers must look like phone/till numbers.
 */
export function payoutDetailsIssue(d: PayoutDetails): string | null {
  const t = (v?: string | null) => (v ?? "").trim();
  const bankName = t(d.bankName);
  const bankAccountName = t(d.bankAccountName);
  const bankAccountNumber = t(d.bankAccountNumber);
  const mpesa = t(d.mpesaMerchantNumber);
  const ecocash = t(d.ecocashMerchantNumber);

  if (!bankAccountNumber && !mpesa && !ecocash) {
    return "Add a bank account, an M-Pesa number or an EcoCash number so customers know where to send payment.";
  }
  if ((bankName || bankAccountName) && !bankAccountNumber) {
    return "Add the bank account number, or clear the bank fields if you only take mobile money.";
  }
  if (bankAccountNumber && (!bankName || !bankAccountName)) {
    return "Add the bank name and account holder name so customers can make the transfer.";
  }
  const merchant = d.mobileMoneyAccountType === "MERCHANT";
  if (mpesa && !MOBILE_NUMBER_RE.test(mpesa)) {
    return merchant
      ? "The M-Pesa merchant number should be digits only."
      : "The M-Pesa number should be a phone number, digits only (e.g. 5XXXXXXX).";
  }
  if (ecocash && !MOBILE_NUMBER_RE.test(ecocash)) {
    return merchant
      ? "The EcoCash merchant number should be digits only."
      : "The EcoCash number should be a phone number, digits only (e.g. 6XXXXXXX).";
  }
  return null;
}

/**
 * At registration a vendor answers "Do you have a merchant account?":
 *   No                    → paymentMode MANUAL, mobileMoneyAccountType
 *                           PERSONAL: customers send money to their
 *                           personal M-Pesa / EcoCash numbers (and/or bank)
 *                           and upload proof.
 *   Yes, no API           → MANUAL + MERCHANT: customers pay to the
 *                           merchant numbers and upload proof.
 *   Yes, with API access  → ONLINE: customers pay through the vendor's own
 *                           merchant API (direct M-Pesa or MoPay). The
 *                           credentials are entered right after sign-up on
 *                           Seller centre → Payments, where they're tested
 *                           live before being switched on.
 * MANUAL stores give their payout details here, so they can take orders
 * as soon as they're approved.
 */
export const registerVendorSchema = registerCustomerSchema
  .extend({
    storeName: z.string().min(2).max(120),
    storeDescription: z.string().max(2000).optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().max(40).optional(),
    paymentMode: z.enum(["MANUAL", "ONLINE"]).default("MANUAL"),
    bankName: optionalText(120),
    bankAccountName: optionalText(120),
    bankAccountNumber: optionalText(60),
    mpesaMerchantNumber: optionalText(40),
    ecocashMerchantNumber: optionalText(40),
    mobileMoneyAccountType: z.enum(["PERSONAL", "MERCHANT"]).default("PERSONAL"),
  })
  .superRefine((d, ctx) => {
    if (d.paymentMode !== "MANUAL") return;
    const issue = payoutDetailsIssue(d);
    if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue, path: ["payoutDetails"] });
  });

export const categorySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  parentId: z.string().cuid().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const productVariantSchema = z.object({
  sku: z.string().min(1).max(80),
  options: z.record(z.string()),
  price: z.number().positive(),
  stockQuantity: z.number().int().min(0),
  imageUrl: z.string().url().optional(),
});

/**
 * Product images must be files uploaded through /api/uploads/product-images
 * (stored locally, see src/lib/uploads.ts) — external image URLs are no
 * longer accepted from vendors. The pattern is duplicated from
 * PRODUCT_IMAGE_URL_RE rather than imported so this file stays free of
 * Node-only imports.
 */
const productImageSchema = z.object({
  url: z
    .string()
    .regex(/^\/api\/uploads\/products\/[a-z0-9]+\/[a-f0-9-]{36}\.(jpg|png|webp)$/, "Upload images from your device."),
  altText: z.string().max(200).optional(),
});

export const productSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().min(1),
  shortDescription: z.string().max(500).optional(),
  categoryId: z.string().cuid(),
  price: z.number().positive(),
  discountPrice: z.number().positive().optional(),
  sku: z.string().min(1).max(80),
  stockQuantity: z.number().int().min(0),
  brand: z.string().max(120).optional(),
  tags: z.array(z.string()).optional(),
  images: z.array(productImageSchema).max(8, "You can add up to 8 images.").optional(),
  attributes: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  variants: z.array(productVariantSchema).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "OUT_OF_STOCK", "ARCHIVED"]).optional(),
});

/** Creating a product requires at least one uploaded image. */
export const productCreateSchema = productSchema.extend({
  images: z
    .array(productImageSchema)
    .min(1, "Add at least one product image.")
    .max(8, "You can add up to 8 images."),
});

export const cartItemSchema = z.object({
  productId: z.string().cuid(),
  variantId: z.string().cuid().optional(),
  quantity: z.number().int().min(1).max(999),
});

export const checkoutSchema = z.object({
  shippingAddressId: z.string().cuid().optional(),
});

export const vendorOrderStatusSchema = z.object({
  status: z.enum([
    "PENDING",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
  ]),
  trackingNumber: z.string().max(120).optional(),
});

export const wishlistItemSchema = z.object({
  productId: z.string().cuid(),
});

export const productReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(150).optional(),
  body: z.string().max(4000).optional(),
  images: z.array(z.string().url()).max(6).optional(),
});

export const vendorReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().max(4000).optional(),
});

export const reviewModerationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export const payoutRequestSchema = z.object({
  amount: z.number().positive(),
});

export const payoutDecisionSchema = z.object({
  adminNote: z.string().max(500).optional(),
});

export const shippingMethodSchema = z.object({
  name: z.string().min(1).max(80),
  cost: z.number().min(0),
  estimatedDaysMin: z.number().int().min(0).optional(),
  estimatedDaysMax: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const returnRequestSchema = z.object({
  orderItemId: z.string().cuid(),
  reason: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  images: z.array(z.string().url()).max(6).optional(),
});

export const returnDecisionSchema = z.object({
  status: z.enum([
    "UNDER_REVIEW",
    "APPROVED",
    "REJECTED",
    "RETURN_IN_PROGRESS",
    "RETURNED",
    "REFUND_PROCESSING",
    "REFUNDED",
  ]),
  adminResponse: z.string().max(2000).optional(),
  refundAmount: z.number().positive().optional(),
});

export const couponSchema = z.object({
  code: z.string().min(3).max(40),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.number().positive(),
  scope: z.enum(["PLATFORM", "VENDOR"]).optional(),
  categoryId: z.string().cuid().optional(),
  productId: z.string().cuid().optional(),
  minPurchaseAmount: z.number().positive().optional(),
  usageLimit: z.number().int().positive().optional(),
  perUserLimit: z.number().int().positive().optional(),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export const checkoutWithExtrasSchema = z.object({
  shippingAddressId: z.string().cuid().optional(),
  couponCode: z.string().optional(),
  redeemPoints: z.number().int().min(0).optional(),
  // No payment method here any more: the customer chooses how to pay
  // each seller on the order page after checkout — see
  // vendorOrderPaymentMethodSchema below.
});

// The customer's choice for one vendor order, made after checkout.
export const vendorOrderPaymentMethodSchema = z.object({
  method: z.enum(["manual", "mpesa", "mopay"]),
});

// A vendor switching how their store collects payment.
export const vendorPaymentModeSchema = z.object({
  paymentMode: z.enum(["MANUAL", "ONLINE"]),
});

export const conversationStartSchema = z.object({
  vendorId: z.string().cuid(),
  productId: z.string().cuid().optional(),
});

export const messageSchema = z.object({
  body: z.string().min(1).max(4000).optional(),
  attachmentUrl: z.string().url().optional(),
}).refine((d) => d.body || d.attachmentUrl, { message: "Message must have text or an attachment." });

export const vendorStoreSettingsSchema = z.object({
  participatesInCoupons: z.boolean().optional(),
  participatesInLoyalty: z.boolean().optional(),
});

export const vendorPaymentDetailsSchema = z.object({
  acceptsManualPayment: z.boolean().optional(),
  bankName: z.string().max(120).optional().nullable(),
  bankAccountName: z.string().max(120).optional().nullable(),
  bankAccountNumber: z.string().max(60).optional().nullable(),
  // Merchant (till) number or a personal number registered for M-Pesa /
  // EcoCash. Format and completeness are checked by payoutDetailsIssue.
  mpesaMerchantNumber: z.string().max(40).optional().nullable(),
  ecocashMerchantNumber: z.string().max(40).optional().nullable(),
  mobileMoneyAccountType: z.enum(["PERSONAL", "MERCHANT"]).optional(),
});

// Data URLs are "data:<mime>;base64,<payload>". Capped well under
// Postgres's practical limits — proof-of-payment screenshots are small,
// and this cap exists to stop someone pasting an oversized file, not
// because the database can't hold more.
const MAX_PROOF_BASE64_LENGTH = 7_000_000; // ~5MB raw file, base64-inflated

export const proofOfPaymentSchema = z.object({
  imageData: z
    .string()
    .max(MAX_PROOF_BASE64_LENGTH, "File is too large. Please upload an image under 5MB.")
    .refine(
      (v) => /^data:(image\/(png|jpeg|jpg|webp)|application\/pdf);base64,/.test(v),
      "Proof must be a PNG, JPEG, WEBP image, or a PDF."
    ),
  fileName: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

export const proofRejectSchema = z.object({
  rejectionReason: z.string().min(1).max(500),
});

/** Vendor's own M-Pesa Open API connection (see src/lib/mpesa). */
export const vendorMpesaSettingsSchema = z.object({
  // Omit to keep the saved key; the saved key is never sent to the browser.
  apiKey: z.string().trim().min(8, "That API key looks too short.").max(500).optional(),
  publicKey: z.string().trim().min(100, "Paste the full public key from the portal.").max(5000),
  serviceProviderCode: z
    .string()
    .trim()
    .regex(/^[0-9]{3,12}$/, "The service provider code is the numeric short code of your M-Pesa business account."),
  environment: z.enum(["sandbox", "openapi"]),
  enabled: z.boolean(),
});

export const mpesaPaySchema = z.object({
  msisdn: z.string().trim().min(8).max(20),
});
