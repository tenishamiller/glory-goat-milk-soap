import { sendReviewInviteEmail } from "./review-email.js";

export const REVIEW_INVITE_DAYS = 30;

export async function sendDueReviewInvites(supabase) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - REVIEW_INVITE_DAYS);

  const { data: orders, error } = await supabase
    .from("gg_orders")
    .select("id, customer_email, customer_name, product_key, created_at, status, refunded_at, review_invite_sent_at")
    .lte("created_at", cutoff.toISOString())
    .is("review_invite_sent_at", null)
    .is("refunded_at", null)
    .neq("status", "blocked")
    .neq("status", "refunded")
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) throw error;
  if (!orders?.length) return { sent: 0, skipped: 0 };

  let sent = 0;
  let skipped = 0;

  for (const order of orders) {
    const { data: existingReview } = await supabase
      .from("gg_reviews")
      .select("id")
      .eq("order_id", order.id)
      .maybeSingle();

    if (existingReview) {
      await supabase
        .from("gg_orders")
        .update({ review_invite_sent_at: new Date().toISOString() })
        .eq("id", order.id);
      skipped += 1;
      continue;
    }

    try {
      await sendReviewInviteEmail({
        to: order.customer_email,
        customerName: order.customer_name,
        productKey: order.product_key,
        orderId: order.id,
      });

      await supabase
        .from("gg_orders")
        .update({ review_invite_sent_at: new Date().toISOString() })
        .eq("id", order.id);

      sent += 1;
    } catch (err) {
      console.error("[review invites] failed for order", order.id, err.message);
      skipped += 1;
    }
  }

  return { sent, skipped };
}
