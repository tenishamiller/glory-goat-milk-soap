import { getSupabase, isDbConfigured } from "../lib/db.js";
import { isEmailBlocked } from "../lib/customer-block.js";
import {
  sendNewTicketAdminNotify,
  sendTicketConfirmation,
} from "../lib/support-email.js";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isDbConfigured()) {
    return res.status(503).json({ error: "Contact is not configured yet" });
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const guestName = body.name?.trim();
  const guestEmail = body.email?.trim().toLowerCase();
  const subject = body.subject?.trim() || "Contact form";
  const message = body.message?.trim();

  if (!guestName || !guestEmail || !message) {
    return res.status(400).json({ error: "Name, email, and message are required" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }

  try {
    const supabase = getSupabase();

    if (await isEmailBlocked(supabase, guestEmail)) {
      return res.status(403).json({ error: "Unable to send your message right now." });
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("gg_tickets")
      .insert({ guest_email: guestEmail, guest_name: guestName, subject })
      .select("*")
      .single();
    if (ticketError) throw ticketError;

    const { error: msgError } = await supabase.from("gg_ticket_messages").insert({
      ticket_id: ticket.id,
      sender_type: "guest",
      body: message,
    });
    if (msgError) throw msgError;

    await sendTicketConfirmation({
      to: guestEmail,
      guestName,
      ticketId: ticket.id,
      subject,
      bodyPreview: message.slice(0, 500),
    });

    await sendNewTicketAdminNotify({
      guestName,
      guestEmail,
      subject,
      body: message,
      ticketId: ticket.id,
    });

    return res.status(200).json({ ok: true, ticketId: ticket.id });
  } catch (err) {
    console.error("[contact]", err.message);
    return res.status(500).json({ error: "Could not send message" });
  }
}
