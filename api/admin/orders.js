import { getSupabase, isDbConfigured } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-auth.js";
import { sendPickupReadyEmail } from "../../lib/order-email.js";
import { PRODUCT_LABELS } from "../../lib/glory-products.js";
import {
  canRefundExpiredPickup,
  getPickupDeadline,
  isPickupExpired,
  pickupDaysRemaining,
} from "../../lib/pickup-policy.js";
import { refundOrderInStripe } from "../../lib/stripe-refund.js";
import { getBlockedEmailSet } from "../../lib/customer-block.js";

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function formatMoney(cents, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format((cents ?? 0) / 100);
}

function decorateOrder(order, blockedEmails) {
  const isRefunded = order.status === "refunded" || Boolean(order.refunded_at);
  const isPickedUp = Boolean(order.picked_up_at);
  const isReady = Boolean(order.pickup_ready_at);
  const isExpired = isPickupExpired(order);
  const canRefund = canRefundExpiredPickup(order);
  const normalizedEmail = order.customer_email?.trim().toLowerCase() ?? "";

  return {
    ...order,
    product_label: PRODUCT_LABELS[order.product_key] || order.product_key,
    amount_display: formatMoney(order.amount_cents, order.currency),
    is_ready: isReady,
    is_refunded: isRefunded,
    is_picked_up: isPickedUp,
    is_expired: isExpired,
    can_refund: canRefund,
    is_blocked: blockedEmails?.has(normalizedEmail) ?? false,
    pickup_deadline_at: getPickupDeadline(order)?.toISOString() ?? null,
    pickup_days_remaining: pickupDaysRemaining(order),
    pickup_window_started: Boolean(order.pickup_ready_notified_at || order.pickup_ready_at),
  };
}

async function getOrder(supabase, orderId) {
  const { data: order, error } = await supabase.from("gg_orders").select("*").eq("id", orderId).maybeSingle();
  if (error) throw error;
  return order;
}

async function handleMarkReadyForPickup(supabase, order, body) {
  if (order.fulfillment !== "pickup") {
    throw new Error("This order is not a pickup order");
  }
  if (order.status === "refunded" || order.refunded_at) {
    throw new Error("This order was refunded");
  }
  if (order.pickup_ready_notified_at) {
    throw new Error("Customer was already notified");
  }

  const pickupScheduledAt = body.pickupScheduledAt?.trim() || null;
  const pickupNotes = body.pickupNotes?.trim() || null;
  const now = new Date().toISOString();

  const emailResult = await sendPickupReadyEmail({
    to: order.customer_email,
    customerName: order.customer_name,
    productName: PRODUCT_LABELS[order.product_key] || order.product_key,
    pickupScheduledAt,
    pickupNotes,
  });

  if (!emailResult.sent) {
    throw new Error("Could not send pickup email");
  }

  const { data: updated, error: updateError } = await supabase
    .from("gg_orders")
    .update({
      pickup_scheduled_at: pickupScheduledAt,
      pickup_notes: pickupNotes,
      pickup_ready_at: now,
      pickup_ready_notified_at: now,
    })
    .eq("id", order.id)
    .select("*")
    .single();

  if (updateError) throw updateError;
  return updated;
}

async function handleMarkPickedUp(supabase, order) {
  if (order.fulfillment !== "pickup") {
    throw new Error("This order is not a pickup order");
  }
  if (order.status === "refunded" || order.refunded_at) {
    throw new Error("This order was refunded");
  }
  if (order.picked_up_at) {
    throw new Error("Order is already marked as picked up");
  }

  const { data: updated, error } = await supabase
    .from("gg_orders")
    .update({ picked_up_at: new Date().toISOString() })
    .eq("id", order.id)
    .select("*")
    .single();

  if (error) throw error;
  return updated;
}

async function handleRefundStripe(supabase, order) {
  if (order.fulfillment !== "pickup") {
    throw new Error("This order is not a pickup order");
  }
  if (order.status === "refunded" || order.refunded_at) {
    throw new Error("This order was already refunded");
  }
  if (order.picked_up_at) {
    throw new Error("This order was already picked up");
  }
  if (!canRefundExpiredPickup(order)) {
    throw new Error("Refund is available after 3 days if the order was not picked up");
  }

  await refundOrderInStripe(order);

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("gg_orders")
    .update({ refunded_at: now, status: "refunded" })
    .eq("id", order.id)
    .select("*")
    .single();

  if (error) throw error;
  return updated;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!isDbConfigured()) {
    return res.status(503).json({ error: "Not configured" });
  }

  const supabase = getSupabase();

  if (req.method === "GET") {
    const fulfillment = req.query?.fulfillment === "ship" ? "ship" : "pickup";

    try {
      const { data, error } = await supabase
        .from("gg_orders")
        .select("*")
        .eq("fulfillment", fulfillment)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      const blockedEmails = await getBlockedEmailSet(
        supabase,
        (data ?? []).map((order) => order.customer_email),
      );

      return res.status(200).json({
        orders: (data ?? []).map((order) => decorateOrder(order, blockedEmails)),
      });
    } catch (err) {
      console.error("[admin orders GET]", err.message);
      return res.status(500).json({ error: "Could not load orders" });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const orderId = body.orderId?.trim();
  const action = body.action?.trim();

  if (!orderId || !action) {
    return res.status(400).json({ error: "Invalid request" });
  }

  try {
    const order = await getOrder(supabase, orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    let updated = order;

    if (action === "mark_ready_for_pickup") {
      updated = await handleMarkReadyForPickup(supabase, order, body);
    } else if (action === "mark_picked_up") {
      updated = await handleMarkPickedUp(supabase, order);
    } else if (action === "refund_stripe") {
      updated = await handleRefundStripe(supabase, order);
    } else {
      return res.status(400).json({ error: "Unknown action" });
    }

    return res.status(200).json({ ok: true, order: decorateOrder(updated) });
  } catch (err) {
    console.error("[admin orders POST]", err.message);
    return res.status(400).json({ error: err.message || "Could not update order" });
  }
}
