import { z } from "zod";

export const registerCustomerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const registerVendorSchema = registerCustomerSchema.extend({
  storeName: z.string().min(2).max(120),
  storeDescription: z.string().max(2000).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(40).optional(),
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
  images: z.array(z.object({ url: z.string().url(), altText: z.string().optional() })).optional(),
  attributes: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  variants: z.array(productVariantSchema).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "OUT_OF_STOCK", "ARCHIVED"]).optional(),
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
});

export const conversationStartSchema = z.object({
  vendorId: z.string().cuid(),
  productId: z.string().cuid().optional(),
});

export const messageSchema = z.object({
  body: z.string().min(1).max(4000).optional(),
  attachmentUrl: z.string().url().optional(),
}).refine((d) => d.body || d.attachmentUrl, { message: "Message must have text or an attachment." });
