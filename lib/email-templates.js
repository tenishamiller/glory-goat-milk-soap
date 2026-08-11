import { buildGloryEmailLayout, buildMessageQuoteBox, buildProductHighlightBox, escapeHtml } from "./email-layout.js";
import { PRODUCT_LABELS, PRODUCT_URLS, SITE_ORIGIN } from "./glory-products.js";

export function buildBackInStockEmailHtml({ productName, productKey }) {
  const shopUrl = PRODUCT_URLS[productKey] || `${SITE_ORIGIN}/#shop`;

  return buildGloryEmailLayout({
    preheader: `${productName} is back in stock at Glory Goat Milk Soap`,
    eyebrow: "Back in stock",
    title: "It's available again!",
    subtitle: "The meadow has delivered — your waitlisted favorite is ready.",
    bodyHtml: `
      <p style="margin:0 0 16px;">Good news! You asked us to let you know when this item returned, and we're happy to say it's back.</p>
      ${buildProductHighlightBox(productName, "Handcrafted in small batches with fresh goat milk.")}
      <p style="margin:0;color:#6b5d52;font-size:15px;">Quantities may be limited while fresh batches are available. We'd love for you to grab yours while it's here.</p>`,
    primaryCta: {
      href: shopUrl,
      label: "Shop now",
    },
  });
}

export function buildTicketConfirmationEmailHtml({ guestName, subject, bodyPreview }) {
  return buildGloryEmailLayout({
    preheader: "We received your message at Glory Goat Milk Soap",
    eyebrow: "Message received",
    title: "We got your note",
    subtitle: "Thanks for reaching out to our small shop.",
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${escapeHtml(guestName)},</p>
      <p style="margin:0 0 16px;">Thanks for contacting Glory Goat Milk Soap about <strong>${escapeHtml(subject)}</strong>.</p>
      ${buildMessageQuoteBox(bodyPreview)}
      <p style="margin:0;color:#6b5d52;">We'll reply soon. You can also reply directly to this email to continue the conversation.</p>`,
    primaryCta: {
      href: SITE_ORIGIN,
      label: "Visit the shop",
    },
  });
}

export function buildGuestReplyEmailHtml({ guestName, body }) {
  return buildGloryEmailLayout({
    preheader: "New reply from Glory Goat Milk Soap",
    eyebrow: "Reply from Glory",
    title: "A note for you",
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${escapeHtml(guestName)},</p>
      ${buildMessageQuoteBox(body)}
      <p style="margin:0;color:#6b5d52;">Reply to this email anytime — we're here to help.</p>`,
    primaryCta: {
      href: SITE_ORIGIN,
      label: "Visit the shop",
    },
  });
}

export function buildAdminTicketNotifyEmailHtml({ guestName, guestEmail, subject, body }) {
  return buildGloryEmailLayout({
    preheader: `New contact message from ${guestName}`,
    eyebrow: "Admin notification",
    title: "New contact message",
    bodyHtml: `
      <p style="margin:0 0 8px;"><strong>${escapeHtml(guestName)}</strong> &lt;${escapeHtml(guestEmail)}&gt;</p>
      <p style="margin:0 0 16px;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      ${buildMessageQuoteBox(body)}
      <p style="margin:0;"><a href="${SITE_ORIGIN}/ops.html" style="color:#3d6b34;font-weight:700;text-decoration:none;">Open admin inbox →</a></p>`,
    primaryCta: {
      href: `${SITE_ORIGIN}/ops.html`,
      label: "Open admin",
    },
    footerNote: "Glory Goat admin notification",
  });
}

export const EMAIL_PREVIEW_SAMPLES = {
  "back-in-stock": {
    label: "Back in stock",
    html: buildBackInStockEmailHtml({
      productName: PRODUCT_LABELS.classic_bar,
      productKey: "classic_bar",
    }),
  },
  "back-in-stock-creme": {
    label: "Back in stock (Cream)",
    html: buildBackInStockEmailHtml({
      productName: PRODUCT_LABELS.lotion_8oz,
      productKey: "lotion_8oz",
    }),
  },
  "contact-confirmation": {
    label: "Contact confirmation",
    html: buildTicketConfirmationEmailHtml({
      guestName: "Sarah",
      subject: "Question about shipping",
      bodyPreview: "Hi! I'd love to order a few bars for gifts. Do you ship to South Carolina?",
    }),
  },
  "contact-reply": {
    label: "Reply to customer",
    html: buildGuestReplyEmailHtml({
      guestName: "Sarah",
      body: "Yes, we ship anywhere in the US! Most orders go out within 2–3 business days. Let us know if you'd like help picking scents.",
    }),
  },
};
