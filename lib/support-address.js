import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_LENGTH = 16;

function supportSecret() {
  const secret =
    process.env.EMAIL_REPLY_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.GLORY_ADMIN_SECRET?.trim();
  if (!secret) throw new Error("EMAIL_REPLY_SECRET is not configured");
  return secret;
}

export function getSupportDomain() {
  return process.env.SUPPORT_EMAIL_DOMAIN?.trim() || "replies.glorygoatmilksoap.com";
}

export function getAdminEmail() {
  return process.env.GLORY_ADMIN_EMAIL?.trim() || "admin@glorygoatmilksoap.com";
}

export function getSupportPublicEmail() {
  return process.env.GLORY_SUPPORT_EMAIL?.trim() || "hello@glorygoatmilksoap.com";
}

function signTicket(ticketId) {
  return createHmac("sha256", supportSecret())
    .update(`glory-support:${ticketId}`)
    .digest("hex")
    .slice(0, TOKEN_LENGTH);
}

export function buildSupportReplyToAddress(ticketId) {
  const token = signTicket(ticketId);
  return `support+${ticketId}+${token}@${getSupportDomain()}`;
}

const SUPPORT_LOCAL =
  /^support\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\+([a-f0-9]+)$/i;

export function parseSupportReplyAddress(address) {
  const email = address.trim().toLowerCase();
  const local = email.split("@")[0] ?? "";
  const match = SUPPORT_LOCAL.exec(local);
  if (!match) return null;

  const ticketId = match[1];
  const token = match[2];
  const expected = signTicket(ticketId);

  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  return { ticketId };
}

export function pickSupportReplyAddress(to) {
  if (!to) return null;
  const list = Array.isArray(to) ? to : [to];
  for (const entry of list) {
    if (parseSupportReplyAddress(entry)) return entry;
  }
  return null;
}

export function pickPublicSupportAddress(to) {
  if (!to) return null;
  const publicEmail = getSupportPublicEmail().toLowerCase();
  const adminEmail = getAdminEmail().toLowerCase();
  const list = Array.isArray(to) ? to : [to];

  for (const entry of list) {
    const email = entry.trim().toLowerCase();
    if (parseSupportReplyAddress(entry)) continue;
    const local = email.split("@")[0] ?? "";
    if (local === "support" || local === "hello" || email === publicEmail || email === adminEmail) {
      return entry;
    }
  }
  return null;
}
