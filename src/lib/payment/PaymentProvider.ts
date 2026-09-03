/**
 * Payment abstraction layer (spec section 8).
 *
 * Business logic (checkout / order service) only ever talks to this
 * interface — never to a specific gateway's SDK. To add a new gateway,
 * implement this interface and register it in `index.ts`; nothing in
 * the order/commission/checkout flow needs to change.
 */

export interface ChargeRequest {
  orderId: string;
  amount: number; // in currency's smallest-usable unit as a decimal, e.g. 199.99
  currency: string;
  customerEmail: string;
  metadata?: Record<string, string>;
}

export interface ChargeResult {
  success: boolean;
  providerRef: string;
  status: "CONFIRMED" | "FAILED";
  failureReason?: string;
}

export interface RefundRequest {
  providerRef: string;
  amount: number;
  reason?: string;
}

export interface RefundResult {
  success: boolean;
  providerRefundRef: string;
  status: "REFUNDED" | "FAILED";
}

export interface PaymentProvider {
  readonly name: string;
  charge(req: ChargeRequest): Promise<ChargeResult>;
  refund(req: RefundRequest): Promise<RefundResult>;
}
