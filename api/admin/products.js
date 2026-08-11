import { getSupabase, isDbConfigured } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-auth.js";
import {
  getProduct,
  isInStock,
  listProducts,
  notifyWaitlist,
  updateProductInventory,
} from "../../lib/inventory.js";
import { deleteReviewImage } from "../../lib/review-image.js";
import { PRODUCT_LABELS } from "../../lib/glory-products.js";
import { sendBackInStockEmail } from "../../lib/support-email.js";

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

async function handleReviewsAdmin(req, res, supabase) {
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("gg_reviews")
      .select("id, reviewer_name, rating, body, image_url, product_key, created_at, order_id")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const orderIds = [...new Set((data ?? []).map((review) => review.order_id).filter(Boolean))];
    let emailByOrder = new Map();

    if (orderIds.length) {
      const { data: orders } = await supabase
        .from("gg_orders")
        .select("id, customer_email")
        .in("id", orderIds);
      emailByOrder = new Map((orders ?? []).map((order) => [order.id, order.customer_email]));
    }

    const reviews = (data ?? []).map((review) => ({
      ...review,
      product_label: PRODUCT_LABELS[review.product_key] || review.product_key,
      customer_email: emailByOrder.get(review.order_id) ?? null,
    }));

    return res.status(200).json({ reviews });
  }

  if (req.method === "DELETE") {
    const reviewId = req.query?.reviewId?.trim();
    if (!reviewId) {
      return res.status(400).json({ error: "Review id is required" });
    }

    const { data: review, error: fetchError } = await supabase
      .from("gg_reviews")
      .select("id, image_url")
      .eq("id", reviewId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!review) return res.status(404).json({ error: "Review not found" });

    if (review.image_url) {
      try {
        await deleteReviewImage(supabase, review.image_url);
      } catch (err) {
        console.error("[admin reviews delete image]", err.message);
      }
    }

    const { error: deleteError } = await supabase.from("gg_reviews").delete().eq("id", reviewId);
    if (deleteError) throw deleteError;

    return res.status(200).json({ ok: true, reviewId });
  }

  res.setHeader("Allow", "GET, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!isDbConfigured()) {
    return res.status(503).json({ error: "Not configured" });
  }

  const supabase = getSupabase();
  const reviewsResource = req.query?.resource === "reviews";

  if (reviewsResource) {
    try {
      return await handleReviewsAdmin(req, res, supabase);
    } catch (err) {
      console.error("[admin reviews]", err.message);
      return res.status(500).json({ error: err.message || "Could not manage reviews" });
    }
  }

  if (req.method === "GET") {
    try {
      const products = await listProducts();
      return res.status(200).json({ products });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "PATCH") {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const productKey = body.productKey?.trim();
    if (!productKey) return res.status(400).json({ error: "productKey required" });

    try {
      const before = await getProduct(productKey);
      const updated = await updateProductInventory(productKey, body.inventory_count, body.auto_stop);

      let notified = 0;
      if (before && !isInStock(before) && isInStock(updated)) {
        notified = await notifyWaitlist(productKey, async ({ to, productName, productKey: key }) => {
          await sendBackInStockEmail({ to, productName, productKey: key });
        });
      }

      return res.status(200).json({ product: updated, notified });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const productKey = body.productKey?.trim();
    const action = body.action?.trim();
    if (!productKey) return res.status(400).json({ error: "productKey required" });

    if (action === "notify_waitlist") {
      try {
        const sent = await notifyWaitlist(productKey, async ({ to, productName, productKey: key }) => {
          await sendBackInStockEmail({ to, productName, productKey: key });
        });
        return res.status(200).json({ ok: true, notified: sent });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  res.setHeader("Allow", "GET, PATCH, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
