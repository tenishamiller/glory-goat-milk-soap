import { getSupabase, isDbConfigured } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-auth.js";
import { sendGuestReplyEmail } from "../../lib/support-email.js";
import { getBlockedEmailSet, isEmailBlocked, blockCustomer, listBlockedCustomers, unblockCustomer } from "../../lib/customer-block.js";

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

function summarizeTickets(tickets, messages, blockedEmails) {
  const latestByTicket = new Map();
  const counts = new Map();

  for (const msg of messages ?? []) {
    counts.set(msg.ticket_id, (counts.get(msg.ticket_id) ?? 0) + 1);
    if (!latestByTicket.has(msg.ticket_id)) {
      latestByTicket.set(msg.ticket_id, msg);
    }
  }

  return (tickets ?? []).map((ticket) => {
    const latest = latestByTicket.get(ticket.id);
    const normalizedEmail = ticket.guest_email?.trim().toLowerCase() ?? "";
    return {
      ...ticket,
      message_count: counts.get(ticket.id) ?? 0,
      preview: latest?.body?.slice(0, 160) ?? "",
      last_sender: latest?.sender_type ?? null,
      is_blocked: blockedEmails?.has(normalizedEmail) ?? false,
    };
  });
}

async function fetchTicketList(supabase, view) {
  let query = supabase.from("gg_tickets").select("*").order("last_message_at", { ascending: false }).limit(100);

  if (view === "trash") {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
  }

  const { data: tickets, error } = await query;
  if (error) throw error;
  if (!tickets?.length) return [];

  const ids = tickets.map((ticket) => ticket.id);
  const { data: messages, error: msgError } = await supabase
    .from("gg_ticket_messages")
    .select("ticket_id, body, sender_type, created_at")
    .in("ticket_id", ids)
    .order("created_at", { ascending: false });

  if (msgError) throw msgError;

  const blockedEmails = await getBlockedEmailSet(
    supabase,
    tickets.map((ticket) => ticket.guest_email),
  );
  return summarizeTickets(tickets, messages, blockedEmails);
}

async function getTicket(supabase, ticketId) {
  const { data: ticket, error } = await supabase.from("gg_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (error) throw error;
  return ticket;
}

async function handleBlockedCustomers(req, res, supabase) {
  if (req.method === "GET") {
    try {
      const blocked = await listBlockedCustomers(supabase);
      return res.status(200).json({ blocked });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Could not load blocked customers" });
    }
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    try {
      const blocked = await blockCustomer(supabase, {
        email: body.email,
        reason: body.reason,
        source: body.source,
      });
      return res.status(200).json({ ok: true, blocked });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Could not block customer" });
    }
  }

  if (req.method === "DELETE") {
    const email = req.query?.email || (await parseJsonBody(req).catch(() => ({}))).email;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      const result = await unblockCustomer(supabase, email);
      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Could not unblock customer" });
    }
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!isDbConfigured()) {
    return res.status(503).json({ error: "Not configured" });
  }

  const supabase = getSupabase();
  const blockedResource = req.query?.resource === "blocked";

  if (blockedResource) {
    return handleBlockedCustomers(req, res, supabase);
  }

  if (req.method === "GET") {
    try {
      const ticketId = req.query?.ticketId;
      if (ticketId) {
        const ticket = await getTicket(supabase, ticketId);
        if (!ticket) return res.status(404).json({ error: "Message not found" });

        const { data: messages, error } = await supabase
          .from("gg_ticket_messages")
          .select("*")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        ticket.is_blocked = await isEmailBlocked(supabase, ticket.guest_email);
        return res.status(200).json({ ticket, messages: messages ?? [] });
      }

      const view = req.query?.view === "trash" ? "trash" : "inbox";
      const tickets = await fetchTicketList(supabase, view);
      return res.status(200).json({ tickets, view });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Could not load messages" });
    }
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const ticketId = body.ticketId?.trim();
    const message = body.message?.trim();
    if (!ticketId || !message) {
      return res.status(400).json({ error: "Message and reply text are required" });
    }

    const ticket = await getTicket(supabase, ticketId);
    if (!ticket) return res.status(404).json({ error: "Message not found" });
    if (ticket.deleted_at) {
      return res.status(409).json({ error: "Restore this message from trash before replying" });
    }

    const { error: insertError } = await supabase.from("gg_ticket_messages").insert({
      ticket_id: ticketId,
      sender_type: "admin",
      body: message,
    });
    if (insertError) return res.status(500).json({ error: insertError.message });

    await sendGuestReplyEmail({
      to: ticket.guest_email,
      guestName: ticket.guest_name,
      body: message,
      ticketId,
      subject: `Re: ${ticket.subject}`,
    });

    return res.status(200).json({ ok: true });
  }

  if (req.method === "PATCH") {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const action = body.action?.trim();
    const ticketIds = Array.isArray(body.ticketIds)
      ? [...new Set(body.ticketIds.map((id) => id?.trim()).filter(Boolean))]
      : body.ticketId?.trim()
        ? [body.ticketId.trim()]
        : [];

    if (!ticketIds.length || !action) {
      return res.status(400).json({ error: "Select at least one message and an action" });
    }

    if (action === "archive") {
      const { error } = await supabase
        .from("gg_tickets")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ticketIds)
        .is("deleted_at", null);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, action, count: ticketIds.length, ticketIds });
    }

    if (action === "restore") {
      const { error } = await supabase.from("gg_tickets").update({ deleted_at: null }).in("id", ticketIds);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, action, count: ticketIds.length, ticketIds });
    }

    if (action === "delete_permanent") {
      const { error } = await supabase.from("gg_tickets").delete().in("id", ticketIds);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, action, count: ticketIds.length, ticketIds });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
