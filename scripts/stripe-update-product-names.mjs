/**
 * Update Glory Goat Body Crème product name in Stripe.
 *
 * Usage:
 *   node --env-file=../Projects/braidbook/.env.local scripts/stripe-update-product-names.mjs
 */
import Stripe from "stripe";

const BRAND = "glory_goat_milk";
const PRODUCT_NAME = "Glory Goat Milk Body Cream";
const PRODUCT_DESCRIPTION =
  "Rich, silky cream made with creamy goat milk to soften and hydrate your skin.";

const UPDATES = [
  {
    lookupKey: "glory_goat_lotion_8oz",
    priceLabel: "8 oz",
    priceMetadata: {
      brand: BRAND,
      product_type: "creme_da_la_creme",
      size_oz: "8",
      sku: "creme-da-la-creme-8oz",
    },
  },
  {
    lookupKey: "glory_goat_lotion_16oz",
    priceLabel: "16 oz",
    priceMetadata: {
      brand: BRAND,
      product_type: "creme_da_la_creme",
      size_oz: "16",
      sku: "creme-da-la-creme-16oz",
    },
  },
];

const secret = process.env.STRIPE_SECRET_KEY?.trim();
if (!secret?.startsWith("sk_test_") && !secret?.startsWith("sk_live_")) {
  console.error("Set STRIPE_SECRET_KEY and run again.");
  process.exit(1);
}

const stripe = new Stripe(secret);
const updatedProducts = new Set();

for (const item of UPDATES) {
  const prices = await stripe.prices.list({
    lookup_keys: [item.lookupKey],
    active: true,
    limit: 1,
    expand: ["data.product"],
  });

  const price = prices.data[0];
  if (!price) {
    console.error(`Missing price for lookup_key ${item.lookupKey}`);
    process.exit(1);
  }

  const productId = typeof price.product === "string" ? price.product : price.product.id;

  if (!updatedProducts.has(productId)) {
    const product = await stripe.products.update(productId, {
      name: PRODUCT_NAME,
      description: PRODUCT_DESCRIPTION,
      metadata: { brand: BRAND, product_type: "creme_da_la_creme" },
    });
    updatedProducts.add(productId);
    console.log(`Product updated: ${product.id} → ${product.name}`);
  }

  const updatedPrice = await stripe.prices.update(price.id, {
    metadata: item.priceMetadata,
  });

  console.log(
    `Price updated: ${updatedPrice.id} (${item.priceLabel}, $${(updatedPrice.unit_amount ?? 0) / 100})`,
  );
}

console.log("");
console.log(`Done. Mode: ${secret.startsWith("sk_test_") ? "TEST" : "LIVE"}`);
