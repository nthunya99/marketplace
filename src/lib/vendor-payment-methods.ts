import type { VendorProfile } from "@prisma/client";

/**
 * The single place that decides which payment methods a customer can use
 * to pay a vendor. Used by checkout (to refuse items from a store that
 * can't take payment), the cart, the order page (to list the choices after
 * checkout) and the payment-method route (to validate the choice).
 *
 *   MANUAL mode → "manual" (pay offline, upload proof), once the vendor has
 *                 it switched on with somewhere to pay into.
 *   ONLINE mode → "mopay" and/or "mpesa", whichever merchant API the vendor
 *                 has connected and switched on.
 */
export type CustomerPaymentMethod = "manual" | "mpesa" | "mopay";

export const PAYMENT_MODES = ["MANUAL", "ONLINE"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

type VendorPaymentFields = Pick<
  VendorProfile,
  | "paymentMode"
  | "acceptsManualPayment"
  | "bankAccountNumber"
  | "mpesaMerchantNumber"
  | "ecocashMerchantNumber"
  | "mopayEnabled"
  | "mpesaApiEnabled"
>;

export function hasManualPayoutDetails(
  v: Pick<VendorProfile, "bankAccountNumber" | "mpesaMerchantNumber" | "ecocashMerchantNumber">
) {
  return !!(v.bankAccountNumber || v.mpesaMerchantNumber || v.ecocashMerchantNumber);
}

export function availablePaymentMethods(v: VendorPaymentFields): CustomerPaymentMethod[] {
  if (v.paymentMode === "ONLINE") {
    const methods: CustomerPaymentMethod[] = [];
    if (v.mopayEnabled) methods.push("mopay");
    if (v.mpesaApiEnabled) methods.push("mpesa");
    return methods;
  }
  return v.acceptsManualPayment && hasManualPayoutDetails(v) ? ["manual"] : [];
}

/** Prisma `select` covering everything availablePaymentMethods reads. */
export const VENDOR_PAYMENT_SELECT = {
  paymentMode: true,
  acceptsManualPayment: true,
  bankAccountNumber: true,
  mpesaMerchantNumber: true,
  ecocashMerchantNumber: true,
  mopayEnabled: true,
  mpesaApiEnabled: true,
} as const;
