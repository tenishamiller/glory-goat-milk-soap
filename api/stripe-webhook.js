import Stripe from "stripe";
import { getSupabase, isDbConfigured } from "../lib/db.js";
import { formatPickupAddress, isPickupFulfillment } from "../lib/fulfillment.js";
import { isEmailBlocked, normalizeCustomerEmail } from "../lib/customer-block.js";
import { decrementInventory, incrementInventory } from "../lib/inventory.js";
import {
  buildOrderConfirmationHtml,
  buildOwnerNotificationHtml,
  sendGloryEmail,
} from "../lib/glory-email.js";
import { PRODUCT_LABELS } from "../lib/glory-products.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function handleCheckoutCompleted(stripe, session) {
  const full = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["line_items.data.price.product"],
  });

  const customerEmail =
    full.customer_details?.email || full.customer_email || session.customer_email;

  if (!customerEmail) {
    console.warn("[Glory Goat webhook] no customer email on session", session.id);
    return { received: true };
  }

  const normalizedEmail = normalizeCustomerEmail(customerEmail);
  const productKey = full.metadata?.product;
  const lineItem = full.line_items?.data?.[0];
  const quantity = Math.max(
    1,
    Number.parseInt(lineItem?.quantity ?? full.metadata?.quantity ?? "1", 10) || 1,
  );
  const productName =
    lineItem?.description ||
    lineItem?.price?.product?.name ||
    PRODUCT_LABELS[productKey] ||
    "Glory Goat Milk Soap";
  const amountCents = full.amount_total ?? lineItem?.amount_total ?? 0;
  const currency = full.currency ?? "usd";
  const fulfillment = full.metadata?.fulfillment ?? "ship";
  const customerName = full.customer_details?.name ?? "";
  const paymentIntentId =
    typeof full.payment_intent === "string" ? full.payment_intent : full.payment_intent?.id;

  if (isDbConfigured()) {
    try {
      const supabase = getSupabase();
      if (await isEmailBlocked(supabase, normalizedEmail)) {
        if (paymentIntentId) {
          try {
            await stripe.refunds.create({
              payment_intent: paymentIntentId,
              reason: "requested_by_customer",
            });
          } catch (err) {
            console.error("[Glory Goat webhook] blocked customer refund failed", err.message);
          }
        }

        const ownerEmail = process.env.GLORY_OWNER_EMAIL?.trim() || "hello@glorygoatmilksoap.com";
        if (ownerEmail) {
          await sendGloryEmail({
            to: ownerEmail,
            subject: `Blocked customer order refunded — ${productName}`,
            html: `<p>A blocked customer attempted to order <strong>${productName}</strong>.</p><p>Email: ${normalizedEmail}</p><p>Stripe session: ${session.id}</p><p>The payment was automatically refunded and the order was not fulfilled.</p>`,
            replyTo: "hello@glorygoatmilksoap.com",
          });
        }

        if (productKey) {
          await supabase.from("gg_orders").upsert(
            {
              stripe_session_id: session.id,
              stripe_payment_intent_id: paymentIntentId || null,
              product_key: productKey,
              customer_email: normalizedEmail,
              customer_name: customerName.trim(),
              amount_cents: amountCents,
              currency,
              fulfillment,
              status: "blocked",
              refunded_at: new Date().toISOString(),
            },
            { onConflict: "stripe_session_id" },
          );
        }

        return { received: true, blocked: true };
      }
    } catch (err) {
      console.error("[Glory Goat webhook] blocked customer check failed", err.message);
    }
  }

  const isPickup = isPickupFulfillment(fulfillment);
  const shippingAddress = isPickup
    ? formatPickupAddress()
    : full.shipping_details?.address
      ? {
          name: full.shipping_details.name ?? full.customer_details?.name ?? "",
          ...full.shipping_details.address,
        }
      : null;

  const customerHtml = buildOrderConfirmationHtml({
    customerName,
    productName,
    amountCents,
    currency,
    shippingAddress,
    orderId: session.id,
    fulfillment,
  });
  await sendGloryEmail({
    to: customerEmail,
    subject: `Order confirmed — ${productName} · Glory Goat Milk Soap`,
    html: customerHtml,
    replyTo: "hello@glorygoatmilksoap.com",
  });

  const ownerEmail = process.env.GLORY_OWNER_EMAIL?.trim() || "hello@glorygoatmilksoap.com";
  if (ownerEmail && ownerEmail !== customerEmail) {
    const ownerHtml = buildOwnerNotificationHtml({
      customerEmail,
      productName,
      amountCents,
      currency,
      shippingAddress,
      orderId: session.id,
      fulfillment,
    });
    await sendGloryEmail({
      to: ownerEmail,
      subject: `New order — ${productName}`,
      html: ownerHtml,
      replyTo: customerEmail,
    });
  }

  if (isDbConfigured() && productKey) {
    try {
      await decrementInventory(productKey, quantity);
    } catch (err) {
      console.error("[Glory Goat webhook] inventory decrement failed", err.message);
    }

    try {
      const supabase = getSupabase();

      const { error: orderError } = await supabase.from("gg_orders").upsert(
        {
          stripe_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId || null,
          product_key: productKey,
          customer_email: normalizedEmail,
          customer_name: customerName.trim(),
          amount_cents: amountCents,
          currency,
          fulfillment,
        },
        { onConflict: "stripe_session_id" },
      );
      if (orderError) {
        console.error("[Glory Goat webhook] order save failed", orderError.message);
      }
    } catch (err) {
      console.error("[Glory Goat webhook] order save failed", err.message);
    }
  }

  return { received: true, emailed: true };
}

async function handleChargeRefunded(stripe, charge) {
  if (charge.amount_refunded < charge.amount) {
    return { received: true, skipped: "partial_refund" };
  }

  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;

  if (!paymentIntentId) {
    return { received: true, skipped: "no_payment_intent" };
  }

  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });
  const session = sessions.data[0];
  if (!session || session.metadata?.brand !== "glory_goat_milk") {
    return { received: true, skipped: true };
  }

  const productKey = session.metadata?.product;
  if (!isDbConfigured() || !productKey) {
    return { received: true, skipped: "no_product" };
  }

  const supabase = getSupabase();
  const { error: refundEventError } = await supabase.from("gg_refund_events").insert({
    charge_id: charge.id,
    product_key: productKey,
    stripe_session_id: session.id,
  });

  if (refundEventError?.code === "23505") {
    return { received: true, skipped: "already_restored" };
  }
  if (refundEventError) {
    throw refundEventError;
  }

  const restoreQty = Math.max(1, Number.parseInt(session.metadata?.quantity ?? "1", 10) || 1);

  try {
    await incrementInventory(productKey, restoreQty);
  } catch (err) {
    console.error("[Glory Goat webhook] inventory restore failed", err.message);
    throw err;
  }

  await supabase
    .from("gg_orders")
    .update({
      refunded_at: new Date().toISOString(),
      status: "refunded",
    })
    .eq("stripe_session_id", session.id);

  return { received: true, inventory_restored: true, product_key: productKey };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!secret || !webhookSecret) {
    return res.status(500).json({ error: "Webhook not configured" });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ error: "Missing signature" });
  }

  const stripe = new Stripe(secret);
  let event;

  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("webhook signature error", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    let result;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.metadata?.brand !== "glory_goat_milk") {
        return res.status(200).json({ received: true, skipped: true });
      }
      result = await handleCheckoutCompleted(stripe, session);
    } else if (event.type === "charge.refunded") {
      result = await handleChargeRefunded(stripe, event.data.object);
    } else {
      return res.status(200).json({ received: true });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("[Glory Goat webhook]", err.message);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}
