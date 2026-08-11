import { getSupabase, isDbConfigured } from "../lib/db.js";
import { parseInboundBody } from "../lib/parse-reply.js";
import { fetchReceivedEmail } from "../lib/resend-receiving.js";
import {
  parseSupportReplyAddress,
  pickPublicSupportAddress,
  pickSupportReplyAddress,
} from "../lib/support-address.js";
import { verifySvixWebhook } from "../lib/webhook-verify.js";
import { sendNewTicketAdminNotify, sendTicketConfirmation } from "../lib/support-email.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function extractEmailAddress(from) {
  const match = /<([^>]+)>/.exec(from);
  return (match?.[1] || from).trim().toLowerCase();
}

function extractName(from) {
  const match = /^([^<]+)</.exec(from);
  return (match?.[1] || from.split("@")[0] || "Guest").trim();
}

async function createInboundTicket(supabase, { fromEmail, guestName, subject, body }) {
  const { data: ticket, error } = await supabase
    .from("gg_tickets")
    .insert({
      guest_email: fromEmail,
      guest_name: guestName,
      subject,
    })
    .select("*")
    .single();
  if (error) throw error;

  const { error: msgError } = await supabase.from("gg_ticket_messages").insert({
    ticket_id: ticket.id,
    sender_type: "guest",
    body,
  });
  if (msgError) throw msgError;

  await sendTicketConfirmation({
    to: fromEmail,
    guestName,
    ticketId: ticket.id,
    subject,
    bodyPreview: body.slice(0, 500),
  });

  await sendNewTicketAdminNotify({
    guestName,
    guestEmail: fromEmail,
    subject,
    body,
    ticketId: ticket.id,
  });

  return ticket;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isDbConfigured()) {
    return res.status(503).json({ error: "Not configured" });
  }

  const rawBody = await readRawBody(req);
  const webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim();

  if (webhookSecret) {
    const valid = verifySvixWebhook(
      rawBody,
      {
        id: req.headers["svix-id"],
        timestamp: req.headers["svix-timestamp"],
        signature: req.headers["svix-signature"],
      },
      webhookSecret,
    );
    if (!valid) {
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (payload.type !== "email.received" || !payload.data?.email_id) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const received = await fetchReceivedEmail(payload.data.email_id);
  if (!received) {
    return res.status(502).json({ error: "Could not fetch email" });
  }

  const toList = received.to;
  const fromEmail = extractEmailAddress(received.from);
  const body = parseInboundBody({ text: received.text, html: received.html });
  if (!body) {
    return res.status(200).json({ ok: true, ignored: true, reason: "empty body" });
  }

  const supabase = getSupabase();
  const replyAddress = pickSupportReplyAddress(toList);

  if (replyAddress) {
    const parsed = parseSupportReplyAddress(replyAddress);
    if (!parsed) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const { data: ticket } = await supabase
      .from("gg_tickets")
      .select("*")
      .eq("id", parsed.ticketId)
      .maybeSingle();

    if (!ticket || ticket.guest_email.toLowerCase() !== fromEmail) {
      return res.status(200).json({ ok: true, ignored: true, reason: "sender mismatch" });
    }

    if (ticket.deleted_at) {
      const guestName = ticket.guest_name || extractName(received.from);
      const subject = received.subject?.trim() || `Follow-up: ${ticket.subject}`;
      await createInboundTicket(supabase, { fromEmail, guestName, subject, body });
      return res.status(200).json({ ok: true, channel: "ticket-reply-new" });
    }

    await supabase.from("gg_ticket_messages").insert({
      ticket_id: ticket.id,
      sender_type: "guest",
      body,
    });

    await sendNewTicketAdminNotify({
      guestName: ticket.guest_name,
      guestEmail: ticket.guest_email,
      subject: `Reply: ${ticket.subject}`,
      body,
      ticketId: ticket.id,
    });

    return res.status(200).json({ ok: true, channel: "ticket-reply" });
  }

  if (pickPublicSupportAddress(toList)) {
    const guestName = extractName(received.from);
    const subject = received.subject || "Email to Glory Goat Milk Soap";

    await createInboundTicket(supabase, { fromEmail, guestName, subject, body });

    return res.status(200).json({ ok: true, channel: "cold-email" });
  }

  return res.status(200).json({ ok: true, ignored: true });
}
