export const PICKUP_CHECKOUT_MESSAGE =
  "Raleigh, NC Pickup — we'll email you when your order is ready. You will have 3 days from that email to pick up, including weekends.";

export { PICKUP_POLICY_TEXT, PICKUP_PRE_READY_TEXT, PICKUP_ACKNOWLEDGMENT_TEXT } from "./pickup-policy.js";

export function isPickupFulfillment(value) {
  return value === "pickup";
}

export function formatPickupAddress() {
  return null;
}
