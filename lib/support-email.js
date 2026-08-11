import { sendGloryEmail } from "./glory-email.js";
import { buildSupportReplyToAddress, getAdminEmail, getSupportPublicEmail } from "./support-address.js";
import {
  buildAdminTicketNotifyEmailHtml,
  buildBackInStockEmailHtml,
  buildGuestReplyEmailHtml,
  buildTicketConfirmationEmailHtml,
} from "./email-templates.js";

export async function sendTicketConfirmation({ to, guestName, ticketId, subject, bodyPreview }) {
  return sendGloryEmail({
    to,
    subject: "We got your message — Glory Goat Milk Soap",
    html: buildTicketConfirmationEmailHtml({ guestName, subject, bodyPreview }),
    replyTo: buildSupportReplyToAddress(ticketId),
    from: `Glory Goat Milk Soap <${getSupportPublicEmail()}>`,
  });
}

export async function sendNewTicketAdminNotify({ guestName, guestEmail, subject, body, ticketId }) {
  return sendGloryEmail({
    to: getAdminEmail(),
    subject: `New message from ${guestName}`,
    html: buildAdminTicketNotifyEmailHtml({ guestName, guestEmail, subject, body }),
    replyTo: buildSupportReplyToAddress(ticketId),
  });
}

export async function sendGuestReplyEmail({ to, guestName, body, ticketId, subject }) {
  return sendGloryEmail({
    to,
    subject: subject || "Reply from Glory Goat Milk Soap",
    html: buildGuestReplyEmailHtml({ guestName, body }),
    replyTo: buildSupportReplyToAddress(ticketId),
    from: `Glory Goat Milk Soap <${getSupportPublicEmail()}>`,
  });
}

export async function sendBackInStockEmail({ to, productName, productKey }) {
  return sendGloryEmail({
    to,
    subject: `${productName} is back in stock!`,
    html: buildBackInStockEmailHtml({ productName, productKey }),
    from: `Glory Goat Milk Soap <${getSupportPublicEmail()}>`,
  });
}
