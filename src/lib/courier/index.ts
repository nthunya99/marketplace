import type { CourierProvider } from "./CourierProvider";
import { MockCourierProvider } from "./MockCourierProvider";

/**
 * Registry, mirroring src/lib/payment/index.ts. Add real carriers here,
 * e.g.:
 *   case "dhl": return new DhlCourierProvider(); // reads DHL_API_KEY
 * Nothing in the tracking route or UI needs to change when you do.
 */
export function getCourierProvider(providerName?: string | null): CourierProvider {
  const id = providerName ?? process.env.COURIER_PROVIDER ?? "mock";
  switch (id) {
    case "mock":
      return new MockCourierProvider();
    default:
      return new MockCourierProvider();
  }
}
