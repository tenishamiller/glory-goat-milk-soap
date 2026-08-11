/**
 * Move Glory Goat email from braidappt.com to glorygoatmilksoap.com.
 *
 * Usage:
 *   node --env-file=.env.admin-setup --env-file=../Projects/braidbook/.env.local scripts/migrate-glory-domain-email.mjs
 */
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESEND_KEY = process.env.RESEND_API_KEY?.trim();
const WEBHOOK_URL = "https://glorygoatmilksoap.com/api/inbound-email";

const SEND_DOMAIN = "glorygoatmilksoap.com";
const RECEIVE_DOMAIN = "replies.glorygoatmilksoap.com";
const GLORY_SUPPORT_EMAIL = "hello@glorygoatmilksoap.com";
const GLORY_ADMIN_EMAIL = "admin@glorygoatmilksoap.com";
const REPLACE_BRAIDAPPT = process.argv.includes("--replace-braidappt-domain");

async function resend(route, options = {}) {
  const res = await fetch(`https://api.resend.com${route}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

function setEnv(name, value) {
  execSync(`npx vercel env add ${name} production --force`, {
    cwd: root,
    input: value,
    stdio: ["pipe", "pipe", "pipe"],
  });
  console.log("OK Vercel env", name);
}

async function ensureDomain(name) {
  const listed = await resend("/domains");
  if (!listed.ok) {
    throw new Error(`List domains failed: ${JSON.stringify(listed.data)}`);
  }

  let domain = listed.data?.data?.find((d) => d.name === name);
  if (domain) {
    console.log("Domain exists:", name, domain.status || domain.id);
    return domain;
  }

  const braidappt = listed.data?.data?.find((d) => d.name === "braidappt.com");
  if (braidappt && REPLACE_BRAIDAPPT) {
    console.log("Removing braidappt.com from Resend to free the 1-domain plan slot…");
    const removed = await resend(`/domains/${braidappt.id}`, { method: "DELETE" });
    if (!removed.ok) {
      throw new Error(`Remove braidappt.com failed: ${JSON.stringify(removed.data)}`);
    }
    console.log("Removed braidappt.com from Resend");
  } else if (braidappt && !REPLACE_BRAIDAPPT) {
    throw new Error(
      "Resend plan allows 1 domain (braidappt.com is using it). Re-run with --replace-braidappt-domain or upgrade Resend.",
    );
  }

  const created = await resend("/domains", {
    method: "POST",
    body: JSON.stringify({ name, region: "us-east-1" }),
  });

  if (created.ok) {
    console.log("Created domain:", name);
    return created.data;
  }

  throw new Error(`Create domain ${name} failed: ${JSON.stringify(created.data)}`);
}

async function domainRecords(domainId) {
  if (!domainId) return [];
  const detail = await resend(`/domains/${domainId}`);
  return detail.data?.records || [];
}

async function ensureWebhook() {
  const listed = await resend("/webhooks");
  const existing = listed.data?.data?.find((w) => w.endpoint === WEBHOOK_URL);
  if (existing) {
    console.log("Webhook exists:", existing.id);
    return existing.signing_secret || process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim();
  }

  const created = await resend("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      endpoint: WEBHOOK_URL,
      events: ["email.received"],
    }),
  });

  if (!created.ok) {
    console.warn("Webhook create failed:", created.data);
    return process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() || null;
  }

  console.log("Created webhook");
  return created.data?.signing_secret || created.data?.secret || null;
}

async function main() {
  if (!RESEND_KEY) throw new Error("RESEND_API_KEY required");

  console.log("=== Glory Goat email migration ===\n");

  const sendDomain = await ensureDomain(SEND_DOMAIN);
  const webhookSecret = await ensureWebhook();

  setEnv("GLORY_SUPPORT_EMAIL", GLORY_SUPPORT_EMAIL);
  setEnv("GLORY_ADMIN_EMAIL", GLORY_ADMIN_EMAIL);
  setEnv("SUPPORT_EMAIL_DOMAIN", RECEIVE_DOMAIN);
  setEnv("GLORY_EMAIL_FROM", `Glory Goat Milk Soap <${GLORY_SUPPORT_EMAIL}>`);
  if (webhookSecret) setEnv("RESEND_INBOUND_WEBHOOK_SECRET", webhookSecret);

  console.log("\n--- Add these DNS records in Namecheap (Advanced DNS) ---\n");

  for (const [label, domain] of [["Glory Goat", sendDomain]]) {
    const records = await domainRecords(domain.id);
    console.log(`${label} — ${domain.name}:`);
    if (!records.length) {
      console.log("  (fetch records in Resend dashboard after domain verifies)");
    }
    for (const r of records) {
      const host = r.name === "@" || !r.name ? "@" : r.name;
      console.log(`  ${r.type} ${host} → ${r.value}${r.priority != null ? ` (priority ${r.priority})` : ""} [${r.status || "pending"}]`);
    }
    console.log("");
  }

  console.log("Removed braidappt.com addresses from Vercel config.");
  console.log(`Public support/from: ${GLORY_SUPPORT_EMAIL}`);
  console.log(`Admin notifications: ${GLORY_ADMIN_EMAIL}`);
  console.log(`Reply routing domain: ${RECEIVE_DOMAIN}`);
  console.log("\nRedeploy production for changes to take effect.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
