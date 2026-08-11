export const PICKUP_DEADLINE_DAYS = 3;

export const PICKUP_POLICY_TEXT =
  "Raleigh, NC Pickup orders must be collected within 3 days after the ready-for-pickup email. Weekends are included. Uncollected orders may be canceled and refunded.";

export const PICKUP_ACKNOWLEDGMENT_TEXT =
  "I understand Raleigh, NC Pickup orders must be collected within 3 days after the ready-for-pickup email, including weekends, or my order may be canceled and refunded.";

export const PICKUP_PRE_READY_TEXT =
  "When your order is ready, we'll email you. You'll have 3 days from that email to pick up, including weekends.";

export function getPickupWindowStart(order) {
  return order?.pickup_ready_notified_at || order?.pickup_ready_at || null;
}

export function getPickupDeadline(order) {
  const start = getPickupWindowStart(order);
  if (!start) return null;

  const deadline = new Date(start);
  deadline.setDate(deadline.getDate() + PICKUP_DEADLINE_DAYS);
  return deadline;
}

export function isPickupExpired(order, now = new Date()) {
  if (!order || order.picked_up_at || order.refunded_at || order.status === "refunded") {
    return false;
  }

  const deadline = getPickupDeadline(order);
  if (!deadline) return false;
  return deadline <= now;
}

export function canRefundExpiredPickup(order, now = new Date()) {
  return (
    order?.fulfillment === "pickup" &&
    Boolean(getPickupWindowStart(order)) &&
    !order.picked_up_at &&
    !order.refunded_at &&
    order.status !== "refunded" &&
    isPickupExpired(order, now)
  );
}

export function pickupDaysRemaining(order, now = new Date()) {
  const deadline = getPickupDeadline(order);
  if (!deadline) return null;

  const ms = deadline.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}
