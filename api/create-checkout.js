import Stripe from "stripe";
import { isDbConfigured } from "../lib/db.js";
import { DEFAULT_CURING, getCuringSettings, isSoapCuring, normalizeCuringRow } from "../lib/curing.js";
import { isPickupFulfillment, PICKUP_CHECKOUT_MESSAGE } from "../lib/fulfillment.js";
import { getProduct, isInStock } from "../lib/inventory.js";

const PRICES = {
  classic_bar: "price_1TwPqo3g9gfEXpEjxXosRtcu",
  lotion_8oz: "price_1TwPqp3g9gfEXpEj9QEhanCr",
  lotion_16oz: "price_1TwPqq3g9gfEXpEj9fAoAmYs",
};

const SITE_ORIGIN = "https://glorygoatmilksoap.com";

function safeReturnPath(value) {
  if (typeof value !== "string") return "/";
  const path = value.trim().split("?")[0].split("#")[0];
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return res.status(500).json({ error: "Checkout is not configured" });
  }

  let product;
  let fulfillment = "ship";
  let returnPath = "/";
  let quantity = 1;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    product = body.product;
    fulfillment = body.fulfillment === "pickup" ? "pickup" : "ship";
    returnPath = safeReturnPath(body.return_path);
    const parsedQty = Number.parseInt(body.quantity, 10);
    quantity = Number.isFinite(parsedQty) ? parsedQty : 1;
  } catch {
    return res.status(400).json({ error: "Invalid request" });
  }
  const priceId = PRICES[product];
  if (!priceId) {
    return res.status(400).json({ error: "Unknown product" });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    return res.status(400).json({ error: "Choose a quantity between 1 and 20" });
  }

  if (product === "classic_bar") {
    let curing = normalizeCuringRow(DEFAULT_CURING);
    if (isDbConfigured()) {
      try {
        curing = await getCuringSettings();
      } catch (err) {
        console.error("curing check failed", err.message);
      }
    }
    if (isSoapCuring(curing)) {
      return res.status(409).json({ error: "Classic Glory Bar is still curing and not available yet" });
    }
  }

  if (isDbConfigured()) {
    try {
      const row = await getProduct(product);
      if (row && !isInStock(row)) {
        return res.status(409).json({ error: "This item is out of stock" });
      }
      if (
        row &&
        row.auto_stop &&
        row.inventory_count != null &&
        quantity > row.inventory_count
      ) {
        return res.status(409).json({
          error:
            row.inventory_count === 1
              ? "Only 1 left in stock"
              : `Only ${row.inventory_count} left in stock`,
        });
      }
    } catch (err) {
      console.error("inventory check failed", err.message);
    }
  }

  const origin =
    req.headers.origin?.startsWith("http") ? req.headers.origin : SITE_ORIGIN;
  const returnUrl = `${origin}${returnPath === "/" ? "/?ordered=1#shop" : `${returnPath}?ordered=1`}`;

  try {
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded_page",
      line_items: [{ price: priceId, quantity }],
      return_url: returnUrl,
      ...(isPickupFulfillment(fulfillment)
        ? {
            custom_text: {
              submit: { message: PICKUP_CHECKOUT_MESSAGE },
            },
          }
        : {
            shipping_address_collection: { allowed_countries: ["US"] },
          }),
      metadata: {
        brand: "glory_goat_milk",
        product,
        fulfillment,
        quantity: String(quantity),
      },
    });
    return res.status(200).json({ clientSecret: session.client_secret });
  } catch (err) {
    // Fallback for accounts/SDKs that still use the older embedded ui_mode name.
    if (String(err.message || "").toLowerCase().includes("ui_mode")) {
      try {
        const stripe = new Stripe(secret);
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          ui_mode: "embedded",
          line_items: [{ price: priceId, quantity }],
          return_url: returnUrl,
          ...(isPickupFulfillment(fulfillment)
            ? {
                custom_text: {
                  submit: { message: PICKUP_CHECKOUT_MESSAGE },
                },
              }
            : {
                shipping_address_collection: { allowed_countries: ["US"] },
              }),
          metadata: {
            brand: "glory_goat_milk",
            product,
            fulfillment,
            quantity: String(quantity),
          },
        });
        return res.status(200).json({ clientSecret: session.client_secret });
      } catch (fallbackErr) {
        console.error("checkout session error", fallbackErr.message);
        return res.status(500).json({ error: "Could not start checkout" });
      }
    }
    console.error("checkout session error", err.message);
    return res.status(500).json({ error: "Could not start checkout" });
  }
}
