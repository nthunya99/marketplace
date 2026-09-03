import type { CourierProvider, TrackingResult } from "./CourierProvider";

/**
 * A deterministic test provider, same philosophy as MockPaymentProvider:
 * it genuinely implements the tracking contract (so the vendor-order
 * tracking UI can be built and exercised end-to-end) without calling a
 * real carrier API. Swap COURIER_PROVIDER to a real carrier id and
 * implement that class against CourierProvider to go live — see
 * src/lib/courier/index.ts.
 */
export class MockCourierProvider implements CourierProvider {
  readonly name = "mock";

  async track(trackingNumber: string): Promise<TrackingResult> {
    // Deterministic "days since shipped" derived from the tracking
    // number's characters, so repeated calls for the same number return
    // a consistent, plausible-looking progression instead of random data.
    const seed = trackingNumber.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const daysElapsed = seed % 6; // 0-5

    const stages = [
      { status: "LABEL_CREATED", description: "Shipping label created" },
      { status: "PICKED_UP", description: "Package picked up by courier" },
      { status: "IN_TRANSIT", description: "Package in transit" },
      { status: "OUT_FOR_DELIVERY", description: "Out for delivery" },
      { status: "DELIVERED", description: "Package delivered" },
    ];

    const reached = stages.slice(0, Math.min(daysElapsed + 1, stages.length));
    const now = Date.now();
    const events = reached.map((stage, i) => ({
      status: stage.status,
      description: stage.description,
      occurredAt: new Date(now - (reached.length - i) * 86400000).toISOString(),
    }));

    return {
      trackingNumber,
      carrier: "MockCourier",
      currentStatus: reached[reached.length - 1].status,
      estimatedDelivery: new Date(now + (5 - daysElapsed) * 86400000).toISOString(),
      events,
    };
  }
}
