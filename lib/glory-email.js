import { escapeHtml } from "./email-layout.js";
import { isPickupFulfillment } from "./fulfillment.js";
import { PICKUP_POLICY_TEXT, PICKUP_PRE_READY_TEXT } from "./pickup-policy.js";
import { GOAT_IMAGE_URL, MEADOW_IMAGE_URL, SITE_ORIGIN } from "./glory-products.js";

function formatMoney(cents, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format((cents ?? 0) / 100);
}

function formatAddress(address) {
  if (!address) return null;
  const lines = [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(", "),
    address.country,
  ].filter(Boolean);
  return lines.join("<br>");
}

export function buildOrderConfirmationHtml({
  customerName,
  productName,
  amountCents,
  currency,
  shippingAddress,
  orderId,
  fulfillment = "ship",
}) {
  const total = formatMoney(amountCents, currency);
  const greeting = customerName ? `Hi ${escapeHtml(customerName)},` : "Hi there,";
  const shipHtml = formatAddress(shippingAddress);
  const isPickup = isPickupFulfillment(fulfillment);
  const fulfillmentMessage = isPickup
    ? `Your order is confirmed for Raleigh, NC Pickup. ${PICKUP_PRE_READY_TEXT} ${PICKUP_POLICY_TEXT}`
    : "Your order is confirmed. We'll prepare your handmade goat milk goodness and ship it soon.";
  const fulfillmentLabel = isPickup ? "Raleigh, NC Pickup" : "Shipping to";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order confirmed — Glory Goat Milk Soap</title>
</head>
<body style="margin:0;padding:0;background:#dce8d6;font-family:Georgia,'Times New Roman',serif;color:#3d342b;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Your Glory Goat Milk Soap order is confirmed — ${escapeHtml(productName)}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg,#dce8d6 0%,#f5f0e8 42%,#faf8f4 100%);padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#faf8f4;border:1px solid #e8dfd0;border-radius:16px;box-shadow:0 16px 40px rgba(45,35,25,0.12);">
          <tr>
            <td align="center" style="padding:0;background:#faf8f4;border-radius:16px 16px 0 0;">
              <div style="height:92px;background:#87b56a url('${MEADOW_IMAGE_URL}') center/cover no-repeat;border-radius:16px 16px 0 0;"></div>
              <img src="${GOAT_IMAGE_URL}" alt="Glory Goat" width="112" height="112" style="display:block;margin:14px auto 6px;border-radius:18px;border:4px solid #faf8f4;box-shadow:0 10px 24px rgba(45,35,25,0.16);">
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 8px;text-align:center;">
              <p style="margin:0 0 6px;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#6b5344;font-family:Arial,sans-serif;">Glory Goat Milk Soap</p>
              <h1 style="margin:0 0 8px;font-size:32px;line-height:1.15;color:#2f4f2f;font-weight:600;">Thank you for your order</h1>
              <p style="margin:0;font-size:16px;line-height:1.6;color:#6b5d52;font-family:Arial,sans-serif;">Handmade with care in North Carolina</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0;font-family:Arial,sans-serif;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#3d342b;">${greeting}</p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#3d342b;">
                ${fulfillmentMessage}
              </p>
              <div style="background:linear-gradient(135deg,#f5f0e8 0%,#dce8d6 100%);border:1px solid #c9a66b;border-radius:14px;padding:20px 22px;margin-bottom:20px;">
                <p style="margin:0 0 6px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6b5344;">Your order</p>
                <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#2f4f2f;">${escapeHtml(productName)}</p>
                <p style="margin:0;font-size:24px;font-weight:700;color:#3d6b34;">${escapeHtml(total)}</p>
                ${orderId ? `<p style="margin:10px 0 0;font-size:12px;color:#8b7355;">Order #${escapeHtml(orderId.slice(-8).toUpperCase())}</p>` : ""}
              </div>
              ${
                shipHtml
                  ? `<div style="background:#ffffff;border:1px solid #e8dfd0;border-radius:14px;padding:18px 20px;margin-bottom:20px;">
                <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6b5344;">${fulfillmentLabel}</p>
                <p style="margin:0;font-size:15px;line-height:1.7;color:#3d342b;">${shipHtml}</p>
              </div>`
                  : ""
              }
              <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#6b5d52;">
                Questions? Reply to this email or write us at
                <a href="mailto:hello@glorygoatmilksoap.com" style="color:#3d6b34;text-decoration:none;font-weight:700;">hello@glorygoatmilksoap.com</a>.
              </p>
              <div style="text-align:center;padding-bottom:8px;">
                <a href="${SITE_ORIGIN}" style="display:inline-block;background:#3d6b34;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:15px;font-weight:700;font-family:Arial,sans-serif;">Visit the shop</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 28px;text-align:center;border-top:1px solid #e8dfd0;background:#f5f0e8;">
              <p style="margin:0 0 4px;font-size:18px;color:#2f4f2f;font-weight:600;">Glory Goat Milk Soap</p>
              <p style="margin:0;font-size:13px;color:#8b7355;font-family:Arial,sans-serif;">
                <a href="${SITE_ORIGIN}" style="color:#3d6b34;text-decoration:none;">glorygoatmilksoap.com</a>
                · Handmade with wildflower love
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildOwnerNotificationHtml({
  customerEmail,
  productName,
  amountCents,
  currency,
  shippingAddress,
  orderId,
  fulfillment = "ship",
}) {
  const total = formatMoney(amountCents, currency);
  const shipHtml = formatAddress(shippingAddress);
  const fulfillmentLabel = isPickupFulfillment(fulfillment) ? "Raleigh, NC Pickup" : "Ship to";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New Glory Goat order</title></head>
<body style="margin:0;padding:24px;font-family:Arial,sans-serif;background:#f5f0e8;color:#3d342b;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e8dfd0;border-radius:12px;padding:24px;">
    <h1 style="margin:0 0 12px;color:#2f4f2f;font-size:22px;">New order — Glory Goat Milk Soap</h1>
    <p style="margin:0 0 8px;"><strong>${escapeHtml(productName)}</strong> — ${escapeHtml(total)}</p>
    <p style="margin:0 0 8px;">Customer: ${escapeHtml(customerEmail)}</p>
    <p style="margin:0 0 8px;">Fulfillment: ${escapeHtml(isPickupFulfillment(fulfillment) ? "Raleigh, NC Pickup" : "Shipping")}</p>
    ${orderId ? `<p style="margin:0 0 8px;">Session: ${escapeHtml(orderId)}</p>` : ""}
    ${shipHtml ? `<p style="margin:16px 0 0;"><strong>${fulfillmentLabel}:</strong><br>${shipHtml}</p>` : ""}
  </div>
</body>
</html>`;
}

export async function sendGloryEmail({ to, subject, html, replyTo, from: fromOverride }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    fromOverride ||
    process.env.GLORY_EMAIL_FROM?.trim() ||
    "Glory Goat Milk Soap <hello@glorygoatmilksoap.com>";

  if (!apiKey) {
    console.warn("[Glory Goat email] RESEND_API_KEY not set — skipped", to, subject);
    return { sent: false };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[Glory Goat email error]", err);
    return { sent: false, error: err };
  }

  return { sent: true };
}
