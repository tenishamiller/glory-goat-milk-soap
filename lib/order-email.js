import { buildGloryEmailLayout, escapeHtml } from "./email-layout.js";
import { sendGloryEmail } from "./glory-email.js";
import { SITE_ORIGIN } from "./glory-products.js";
import { getSupportPublicEmail } from "./support-address.js";
import { PICKUP_POLICY_TEXT } from "./pickup-policy.js";

function formatPickupTime(value) {
  try {
    return new Date(value).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function buildPickupReadyEmailHtml({
  customerName,
  productName,
  pickupScheduledAt,
  pickupNotes,
}) {
  const greeting = customerName ? `Hi ${escapeHtml(customerName)},` : "Hi there,";
  const timingHtml = pickupScheduledAt
    ? `<p style="margin:0 0 16px;">Please plan to pick up around <strong>${escapeHtml(formatPickupTime(pickupScheduledAt))}</strong>.</p>`
    : `<p style="margin:0 0 16px;">Your order is ready whenever you're able to stop by.</p>`;
  const notesHtml = pickupNotes
    ? `<p style="margin:0 0 16px;padding:14px 16px;background:#faf8f4;border:1px solid #e8dfd0;border-radius:12px;color:#3d342b;">${escapeHtml(pickupNotes)}</p>`
    : "";

  return buildGloryEmailLayout({
    preheader: `Your Glory Goat order is ready for Raleigh, NC Pickup`,
    eyebrow: "Raleigh, NC Pickup",
    title: "Your order is ready!",
    subtitle: productName,
    bodyHtml: `
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 16px;">Good news — your Raleigh, NC Pickup order is packed and ready.</p>
      ${timingHtml}
      ${notesHtml}
      <p style="margin:0 0 16px;color:#6b5d52;font-size:14px;">Please pick up within 3 days from this email, including weekends. Uncollected orders may be canceled and refunded.</p>
      <p style="margin:0;color:#6b5d52;">Reply to this email if you have any questions about pickup.</p>`,
    primaryCta: {
      href: SITE_ORIGIN,
      label: "Visit the shop",
    },
  });
}

export async function sendPickupReadyEmail({
  to,
  customerName,
  productName,
  pickupScheduledAt,
  pickupNotes,
}) {
  return sendGloryEmail({
    to,
    subject: `Ready for Raleigh, NC Pickup — ${productName} · Glory Goat Milk Soap`,
    html: buildPickupReadyEmailHtml({
      customerName,
      productName,
      pickupScheduledAt,
      pickupNotes,
    }),
    replyTo: getSupportPublicEmail(),
    from: `Glory Goat Milk Soap <${getSupportPublicEmail()}>`,
  });
}
