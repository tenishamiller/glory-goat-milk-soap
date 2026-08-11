import { getSupabase, isDbConfigured } from "../lib/db.js";
import { PRODUCT_LABELS, PRODUCT_URLS } from "../lib/glory-products.js";
import { uploadReviewImage } from "../lib/review-image.js";
import { sendDueReviewInvites } from "../lib/review-invites.js";
import { formatPublicReviewerName } from "../lib/reviewer-name.js";
import { verifyReviewToken } from "../lib/review-token.js";

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

function authorizeCron(req) {
  const secret = process.env.CRON_SECRET?.trim() || process.env.GLORY_ADMIN_SECRET?.trim();
  const auth = req.headers.authorization?.trim();
  return Boolean(secret && auth === `Bearer ${secret}`);
}

function formatReview(review) {
  return {
    ...review,
    reviewer_name: formatPublicReviewerName(review.reviewer_name),
  };
}

async function getOrderForReview(supabase, orderId, token) {
  if (!verifyReviewToken(orderId, token)) {
    return { error: "This review link is invalid or expired.", status: 403 };
  }

  const { data: order, error } = await supabase.from("gg_orders").select("*").eq("id", orderId).maybeSingle();
  if (error) throw error;
  if (!order) return { error: "Order not found.", status: 404 };
  if (order.refunded_at || order.status === "refunded" || order.status === "blocked") {
    return { error: "This order is not eligible for a review.", status: 403 };
  }

  const { data: existingReview } = await supabase
    .from("gg_reviews")
    .select("id, created_at")
    .eq("order_id", orderId)
    .maybeSingle();

  return {
    order,
    alreadyReviewed: Boolean(existingReview),
    existingReview,
  };
}

export default async function handler(req, res) {
  if (req.query?.cron === "send-invites") {
    if (!authorizeCron(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!isDbConfigured()) {
      return res.status(503).json({ error: "Not configured" });
    }

    try {
      const supabase = getSupabase();
      const result = await sendDueReviewInvites(supabase);
      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      console.error("[reviews cron]", err.message);
      return res.status(500).json({ error: "Could not send review invites" });
    }
  }

  if (!isDbConfigured()) {
    return res.status(503).json({ error: "Reviews are not configured yet" });
  }

  const supabase = getSupabase();

  if (req.method === "GET") {
    const invite = req.query?.invite === "1" || req.query?.invite === "true";
    if (invite) {
      const orderId = req.query?.order?.trim();
      const token = req.query?.token?.trim();
      if (!orderId || !token) {
        return res.status(400).json({ error: "Invalid review link" });
      }

      try {
        const result = await getOrderForReview(supabase, orderId, token);
        if (result.error) {
          return res.status(result.status).json({ error: result.error });
        }

        const { order, alreadyReviewed, existingReview } = result;
        return res.status(200).json({
          orderId: order.id,
          productKey: order.product_key,
          productLabel: PRODUCT_LABELS[order.product_key] || order.product_key,
          productUrl: PRODUCT_URLS[order.product_key] || "/",
          customerName: order.customer_name,
          alreadyReviewed,
          reviewedAt: existingReview?.created_at ?? null,
        });
      } catch (err) {
        console.error("[reviews invite GET]", err.message);
        return res.status(500).json({ error: "Could not load review invitation" });
      }
    }

    const productKey = req.query?.product?.trim();
    if (!productKey) {
      return res.status(400).json({ error: "Product is required" });
    }

    try {
      const { data, error } = await supabase
        .from("gg_reviews")
        .select("id, reviewer_name, rating, body, image_url, created_at")
        .eq("product_key", productKey)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return res.status(200).json({ reviews: (data ?? []).map(formatReview) });
    } catch (err) {
      console.error("[reviews GET]", err.message);
      return res.status(500).json({ error: "Could not load reviews" });
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
  const token = body.token?.trim();
  const rating = Number(body.rating);
  const reviewBody = body.body?.trim();
  const imageData = body.imageData?.trim() || null;

  if (!orderId || !token || !reviewBody) {
    return res.status(400).json({ error: "Review link and message are required" });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Choose a rating from 1 to 5 stars" });
  }

  if (reviewBody.length > 2000) {
    return res.status(400).json({ error: "Review must be 2000 characters or less" });
  }

  try {
    const invite = await getOrderForReview(supabase, orderId, token);
    if (invite.error) {
      return res.status(invite.status).json({ error: invite.error });
    }
    if (invite.alreadyReviewed) {
      return res.status(409).json({ error: "You already submitted a review for this order." });
    }

    const order = invite.order;
    const reviewerName = order.customer_name?.trim() || "Customer";

    const { data: review, error: insertError } = await supabase
      .from("gg_reviews")
      .insert({
        order_id: order.id,
        product_key: order.product_key,
        reviewer_name: reviewerName,
        rating,
        body: reviewBody,
      })
      .select("id, reviewer_name, rating, body, image_url, created_at")
      .single();

    if (insertError) throw insertError;

    let imageUrl = null;
    if (imageData) {
      imageUrl = await uploadReviewImage(supabase, review.id, imageData);
      if (imageUrl) {
        const { error: imageUpdateError } = await supabase
          .from("gg_reviews")
          .update({ image_url: imageUrl })
          .eq("id", review.id);
        if (imageUpdateError) throw imageUpdateError;
        review.image_url = imageUrl;
      }
    }

    return res.status(200).json({
      ok: true,
      review: formatReview(review),
      productUrl: PRODUCT_URLS[order.product_key] || "/",
    });
  } catch (err) {
    console.error("[reviews POST]", err.message);
    return res.status(500).json({ error: err.message || "Could not submit review" });
  }
}
