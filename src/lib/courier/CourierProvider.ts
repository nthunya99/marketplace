/**
 * Courier/shipping-tracking abstraction (spec section 12: "design
 * shipping so external courier APIs can be integrated later"). Mirrors
 * the payment provider pattern in src/lib/payment exactly on purpose —
 * same shape of problem (a pluggable external service), same solution.
 */

export interface TrackingEvent {
  status: string;
  description: string;
  occurredAt: string; // ISO timestamp
  location?: string;
}

export interface TrackingResult {
  trackingNumber: string;
  carrier: string;
  currentStatus: string;
  estimatedDelivery?: string;
  events: TrackingEvent[];
}

export interface CourierProvider {
  readonly name: string;
  track(trackingNumber: string): Promise<TrackingResult>;
}
