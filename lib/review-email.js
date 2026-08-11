import { buildGloryEmailLayout } from "./email-layout.js";
import { sendGloryEmail } from "./glory-email.js";
import { PRODUCT_LABELS } from "./glory-products.js";
import { buildReviewInviteUrl } from "./review-token.js";
import { getSupportPublicEmail } from "./support-address.js";

export function buildReviewInviteEmailHtml({ customerName, productName, reviewUrl }) {
  const greeting = customerName ? `Hi ${customerName},` : "Hi there,";

  return buildGloryEmailLayout({
    preheader: `How are you enjoying your ${productName}?`,
    eyebrow: "Glory Goat Milk Soap",
    title: "We'd love your review",
    subtitle: productName,
    bodyHtml: `
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 16px;">It's been about a month since your order arrived, and we hope you're enjoying your handmade goat milk goodness.</p>
      <p style="margin:0 0 16px;">If you have a moment, we'd love to hear what you think. Your review helps other customers discover Glory Goat Milk Soap.</p>
      <p style="margin:0;color:#6b5d52;font-size:14px;">You can add an optional photo with your review.</p>`,
    primaryCta: {
      href: reviewUrl,
      label: "Write your review",
    },
  });
}

export async function sendReviewInviteEmail({ to, customerName, productKey, orderId }) {
  const productName = PRODUCT_LABELS[productKey] || productKey;
  const reviewUrl = buildReviewInviteUrl(orderId);

  return sendGloryEmail({
    to,
    subject: `How's your ${productName}? · Glory Goat Milk Soap`,
    html: buildReviewInviteEmailHtml({
      customerName,
      productName,
      reviewUrl,
    }),
    replyTo: getSupportPublicEmail(),
    from: `Glory Goat Milk Soap <${getSupportPublicEmail()}>`,
  });
}
