/**
 * Register Glory Goat Stripe webhook for order confirmation emails.
 *
 * Usage:
 *   node --env-file=../Projects/braidbook/.env.local scripts/stripe-setup-webhook.mjs
 */
import Stripe from "stripe";

const WEBHOOK_URL = "https://glorygoatmilksoap.com/api/stripe-webhook";
const EVENTS = ["checkout.session.completed", "charge.refunded"];

const secret = process.env.STRIPE_SECRET_KEY?.trim();
if (!secret?.startsWith("sk_test_") && !secret?.startsWith("sk_live_")) {
  console.error("Set STRIPE_SECRET_KEY and run again.");
  process.exit(1);
}

const stripe = new Stripe(secret);

const listed = await stripe.webhookEndpoints.list({ limit: 100 });
const existing = listed.data.find((ep) => ep.url === WEBHOOK_URL);

let endpoint;
if (existing) {
  endpoint = await stripe.webhookEndpoints.update(existing.id, {
    enabled_events: EVENTS,
    disabled: false,
  });
  console.log("Updated webhook:", endpoint.id);
} else {
  endpoint = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: EVENTS,
    description: "Glory Goat Milk Soap order emails",
    metadata: { brand: "glory_goat_milk" },
  });
  console.log("Created webhook:", endpoint.id);
}

console.log("");
console.log("URL:", WEBHOOK_URL);
console.log("Events:", EVENTS.join(", "));
console.log("");
console.log("Add this to Vercel (glory-goat-milk-soap project):");
console.log(`STRIPE_WEBHOOK_SECRET=${endpoint.secret}`);
console.log("");
console.log("Also ensure RESEND_API_KEY is set on Vercel.");
console.log("Verify glorygoatmilksoap.com in Resend to send from hello@glorygoatmilksoap.com");
