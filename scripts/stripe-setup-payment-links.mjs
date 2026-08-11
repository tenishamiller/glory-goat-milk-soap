/**
 * Create Stripe Payment Links for Glory Goat products (same account as BraidAppt).
 *
 * Usage:
 *   node --env-file=../Projects/braidbook/.env.local scripts/stripe-setup-payment-links.mjs
 */
import Stripe from "stripe";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SUCCESS_URL = "https://glorygoatmilksoap.com/#shop?ordered=1";

const ITEMS = [
  {
    key: "classic_bar",
    lookupKey: "glory_goat_classic_bar",
    label: "Classic Glory Bar",
  },
  {
    key: "lotion_8oz",
    lookupKey: "glory_goat_lotion_8oz",
    label: "Glory Goat Milk Body Cream (8 oz)",
  },
  {
    key: "lotion_16oz",
    lookupKey: "glory_goat_lotion_16oz",
    label: "Glory Goat Milk Body Cream (16 oz)",
  },
];

const secret = process.env.STRIPE_SECRET_KEY?.trim();
if (!secret?.startsWith("sk_test_") && !secret?.startsWith("sk_live_")) {
  console.error("Set STRIPE_SECRET_KEY and run again.");
  process.exit(1);
}

const stripe = new Stripe(secret);

async function priceForLookup(lookupKey) {
  const listed = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = listed.data[0];
  if (!price) throw new Error(`Missing price with lookup_key ${lookupKey}. Run stripe-setup-products.mjs first.`);
  return price;
}

async function findExistingLink(priceId) {
  const links = await stripe.paymentLinks.list({ active: true, limit: 100 });
  return links.data.find(
    (link) =>
      link.metadata?.brand === "glory_goat_milk" &&
      link.metadata?.price_id === priceId,
  );
}

async function ensurePaymentLink(item, price) {
  const existing = await findExistingLink(price.id);
  if (existing) return existing;

  return stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: {
      brand: "glory_goat_milk",
      price_id: price.id,
      sku: item.key,
    },
    after_completion: {
      type: "redirect",
      redirect: { url: SUCCESS_URL },
    },
    allow_promotion_codes: false,
    billing_address_collection: "auto",
    shipping_address_collection: { allowed_countries: ["US"] },
  });
}

const checkout = {};

for (const item of ITEMS) {
  const price = await priceForLookup(item.lookupKey);
  const link = await ensurePaymentLink(item, price);
  checkout[item.key] = link.url;

  console.log(`${item.label}`);
  console.log(`  Price: ${price.id} ($${(price.unit_amount ?? 0) / 100})`);
  console.log(`  Pay:   ${link.url}`);
  console.log("");
}

const outPath = path.join(ROOT, "checkout-links.json");
fs.writeFileSync(outPath, JSON.stringify(checkout, null, 2) + "\n");

console.log(`Wrote ${outPath}`);
console.log(`Mode: ${secret.startsWith("sk_test_") ? "TEST" : "LIVE"}`);
