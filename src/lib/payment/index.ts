import type { PaymentProvider } from "./PaymentProvider";
import { MockPaymentProvider } from "./MockPaymentProvider";

/**
 * Provider registry. Add real gateways here as they're implemented, e.g.:
 *   import { StripePaymentProvider } from "./StripePaymentProvider";
 *   case "stripe": return new StripePaymentProvider();
 *
 * StripePaymentProvider would read STRIPE_SECRET_KEY /
 * STRIPE_WEBHOOK_SECRET from env — those are documented in .env.example
 * but intentionally left unset until you have real credentials to put
 * there. Nothing in this file, or in the checkout/order code that calls
 * it, hard-codes a specific gateway.
 */
export function getPaymentProvider(): PaymentProvider {
  const providerId = process.env.PAYMENT_PROVIDER ?? "mock";

  switch (providerId) {
    case "mock":
      return new MockPaymentProvider();
    // case "stripe": return new StripePaymentProvider();
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${providerId}". Set it to "mock" or implement + register a provider in src/lib/payment/index.ts.`
      );
  }
}
