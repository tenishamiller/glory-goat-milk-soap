/**
 * Create Glory Goat Milk Soap one-time Stripe products (not BraidAppt subscriptions).
 *
 * Usage (PowerShell):
 *   node --env-file=../Projects/braidbook/.env.local scripts/stripe-setup-products.mjs
 *
 * Or with a local .env containing STRIPE_SECRET_KEY.
 */
import Stripe from "stripe";

const BRAND = "glory_goat_milk";

const CATALOG = [
  {
    productName: "Classic Glory Bar",
    productDescription:
      "Unscented handmade goat milk soap with olive, coconut, and palm oils. Rich, creamy lather that leaves skin clean, soft, and cared for.",
    lookupKey: "glory_goat_classic_bar",
    unitAmount: 700,
    metadata: {
      brand: BRAND,
      product_type: "soap",
      sku: "classic-glory-bar",
    },
  },
  {
    productName: "Glory Goat Milk Body Cream",
    productDescription:
      "Rich, silky cream made with creamy goat milk to soften and hydrate your skin.",
    lookupKey: "glory_goat_lotion_8oz",
    unitAmount: 1000,
    metadata: {
      brand: BRAND,
      product_type: "creme_da_la_creme",
      size_oz: "8",
      sku: "creme-da-la-creme-8oz",
    },
  },
  {
    productName: "Glory Goat Milk Body Cream",
    productDescription:
      "Rich, silky cream made with creamy goat milk to soften and hydrate your skin.",
    lookupKey: "glory_goat_lotion_16oz",
    unitAmount: 1500,
    metadata: {
      brand: BRAND,
      product_type: "creme_da_la_creme",
      size_oz: "16",
      sku: "creme-da-la-creme-16oz",
    },
  },
];

const secret = process.env.STRIPE_SECRET_KEY?.trim();
if (!secret?.startsWith("sk_test_") && !secret?.startsWith("sk_live_")) {
  console.error("Set STRIPE_SECRET_KEY (sk_test_... or sk_live_...) and run again.");
  process.exit(1);
}

const stripe = new Stripe(secret);

async function findProduct(name) {
  let startingAfter;
  for (;;) {
    const listed = await stripe.products.list({
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    const match = listed.data.find(
      (p) => p.name === name && p.metadata?.brand === BRAND,
    );
    if (match) return match;

    if (!listed.has_more) break;
    startingAfter = listed.data.at(-1)?.id;
  }

  return null;
}

async function ensureProduct(item) {
  const existing = await findProduct(item.productName);
  if (existing) return existing;

  return stripe.products.create({
    name: item.productName,
    description: item.productDescription,
    metadata: {
      brand: BRAND,
      product_type: item.metadata.product_type,
    },
  });
}

async function findPrice(productId, lookupKey, unitAmount) {
  const byLookup = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  if (byLookup.data[0]) return byLookup.data[0];

  const listed = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  return (
    listed.data.find(
      (p) =>
        p.unit_amount === unitAmount &&
        p.currency === "usd" &&
        !p.recurring,
    ) ?? null
  );
}

async function ensurePrice(productId, item) {
  const existing = await findPrice(productId, item.lookupKey, item.unitAmount);
  if (existing) return existing;

  return stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: item.unitAmount,
    lookup_key: item.lookupKey,
    metadata: item.metadata,
  });
}

const results = [];

for (const item of CATALOG) {
  const product = await ensureProduct(item);
  const price = await ensurePrice(product.id, item);
  results.push({ item, product, price });
}

console.log("=== Glory Goat Milk Stripe products (one-time, not subscriptions) ===");
console.log(`Mode: ${secret.startsWith("sk_test_") ? "TEST" : "LIVE"}`);
console.log("");

for (const { item, product, price } of results) {
  const label =
    item.metadata.size_oz != null
      ? `${item.productName} (${item.metadata.size_oz} oz)`
      : item.productName;

  console.log(`${label}`);
  console.log(`  Product: ${product.id}`);
  console.log(`  Price:   ${price.id} ($${(price.unit_amount ?? 0) / 100} one-time)`);
  console.log(`  Lookup:  ${item.lookupKey}`);
  console.log("");
}

console.log("Env vars for checkout integration:");
for (const { item, price } of results) {
  const envKey = item.lookupKey.toUpperCase();
  console.log(`STRIPE_${envKey}_PRICE_ID=${price.id}`);
}
