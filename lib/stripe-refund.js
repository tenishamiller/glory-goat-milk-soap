import Stripe from "stripe";

async function resolvePaymentIntentId(stripe, order) {
  if (order.stripe_payment_intent_id) {
    return order.stripe_payment_intent_id;
  }

  const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  if (!paymentIntentId) {
    throw new Error("No payment found for this order");
  }

  return paymentIntentId;
}

export async function refundOrderInStripe(order) {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error("Stripe is not configured");
  }

  const stripe = new Stripe(secret);
  const paymentIntentId = await resolvePaymentIntentId(stripe, order);

  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    reason: "requested_by_customer",
  });
}

export async function storePaymentIntentId(supabase, stripeSessionId, paymentIntentId) {
  if (!paymentIntentId) return;

  await supabase
    .from("gg_orders")
    .update({ stripe_payment_intent_id: paymentIntentId })
    .eq("stripe_session_id", stripeSessionId);
}
