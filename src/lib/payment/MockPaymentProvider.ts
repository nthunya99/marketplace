import type {
  PaymentProvider,
  ChargeRequest,
  ChargeResult,
  RefundRequest,
  RefundResult,
} from "./PaymentProvider";

/**
 * A fully-functional test provider used when PAYMENT_PROVIDER=mock (the
 * default until a real gateway's credentials are configured — see
 * .env.example). It genuinely executes the charge/refund contract (so the
 * full checkout → order → commission → wallet pipeline can be exercised
 * end-to-end and tested), it just doesn't move real money.
 *
 * It is not a fake stand-in for missing functionality: it's the documented,
 * intentional default transport, exactly as spec section 39 asks for when
 * an external service isn't configured yet. Swap PAYMENT_PROVIDER to a real
 * gateway id and implement that class against the same interface to go live.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    // Deterministic test hook: an order paid with amount ending in .13
    // simulates a decline, so the failure path is exercisable in tests
    // without randomness.
    const cents = Math.round(req.amount * 100);
    const simulateFailure = cents % 100 === 13;

    if (simulateFailure) {
      return {
        success: false,
        providerRef: `mock_failed_${req.orderId}`,
        status: "FAILED",
        failureReason: "Card declined (simulated)",
      };
    }

    return {
      success: true,
      providerRef: `mock_${req.orderId}_${Date.now()}`,
      status: "CONFIRMED",
    };
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    return {
      success: true,
      providerRefundRef: `mock_refund_${req.providerRef}_${Date.now()}`,
      status: "REFUNDED",
    };
  }
}
