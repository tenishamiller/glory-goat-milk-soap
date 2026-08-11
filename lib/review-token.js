import { createHmac, timingSafeEqual } from "crypto";
import { SITE_ORIGIN } from "./glory-products.js";

const TOKEN_LENGTH = 16;

function reviewSecret() {
  const secret =
    process.env.REVIEW_TOKEN_SECRET?.trim() ||
    process.env.EMAIL_REPLY_SECRET?.trim() ||
    process.env.GLORY_ADMIN_SECRET?.trim();
  if (!secret) throw new Error("Review token secret is not configured");
  return secret;
}

function signOrder(orderId) {
  return createHmac("sha256", reviewSecret())
    .update(`glory-review:${orderId}`)
    .digest("hex")
    .slice(0, TOKEN_LENGTH);
}

export function buildReviewInviteUrl(orderId) {
  const token = signOrder(orderId);
  return `${SITE_ORIGIN}/review.html?order=${encodeURIComponent(orderId)}&token=${token}`;
}

export function verifyReviewToken(orderId, token) {
  if (!orderId || !token) return false;

  const expected = signOrder(orderId);
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }

  return true;
}
