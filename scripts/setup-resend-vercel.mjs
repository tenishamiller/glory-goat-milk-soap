/**
 * Resend + Vercel setup for Glory Goat (no Supabase token required).
 *
 * Usage:
 *   node --env-file=.env.admin-setup --env-file=../Projects/braidbook/.env.local scripts/setup-resend-vercel.mjs
 */
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const WEBHOOK_URL = "https://glorygoatmilksoap.com/api/inbound-email";
const RESEND_KEY = process.env.RESEND_API_KEY?.trim();

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

function vercelEnv(name, value) {
  if (!value) {
    console.log(`SKIP ${name}`);
    return;
  }
  execSync(`npx vercel env add ${name} production --force`, {
    cwd: root,
    input: value,
    stdio: ["pipe", "pipe", "pipe"],
  });
  console.log(`OK ${name}`);
}

async function ensureDomain(name) {
  const list = await resend("/domains");
  const existing = list.data?.data?.find((d) => d.name === name);
  if (existing) {
    const detail = await resend(`/domains/${existing.id}`);
    console.log(`Domain exists: ${name} (${detail.data?.status})`);
    return detail.data || existing;
  }

  const created = await resend("/domains", {
    method: "POST",
    body: JSON.stringify({ name, region: "us-east-1" }),
  });

  if (!created.ok) {
    console.error(`Failed to create ${name}:`, created.data);
    return null;
  }

  const detail = await resend(`/domains/${created.data.id}`);
  console.log(`Created domain: ${name}`);
  return detail.data || created.data;
}

async function ensureWebhook() {
  const list = await resend("/webhooks");
  const existing = list.data?.data?.find((w) => w.endpoint === WEBHOOK_URL);
  if (existing) {
    console.log(`Webhook exists: ${WEBHOOK_URL}`);
    return process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() || null;
  }

  const created = await resend("/webhooks", {
    method: "POST",
    body: JSON.stringify({ endpoint: WEBHOOK_URL, events: ["email.received"] }),
  });

  if (!created.ok) {
    console.error("Webhook create failed:", created.data);
    return process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() || null;
  }

  console.log("Created webhook:", WEBHOOK_URL);
  return created.data?.signing_secret || created.data?.secret || null;
}

function printDns(domain) {
  if (!domain?.records?.length) return;
  console.log(`\nDNS for ${domain.name}:`);
  for (const r of domain.records) {
    const host = r.name === "" ? "@" : r.name;
    console.log(`  ${r.type} ${host} → ${r.value}${r.priority != null ? ` (priority ${r.priority})` : ""} [${r.status}]`);
  }
}

async function main() {
  if (!RESEND_KEY) throw new Error("RESEND_API_KEY required");

  const sendDomain = await ensureDomain("glorygoatmilksoap.com");
  const receiveDomain = await ensureDomain("replies.glorygoatmilksoap.com");
  const webhookSecret =
    (await ensureWebhook()) || process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim();

  printDns(sendDomain);
  printDns(receiveDomain);

  console.log("\nPushing Vercel env...");
  const envFile = path.join(root, ".env");
  const dotenv = await import("dotenv");
  dotenv.config({ path: envFile });
  dotenv.config({ path: path.join(root, ".env.admin-setup") });
  dotenv.config({ path: path.join(process.env.USERPROFILE || "", "Projects/braidbook/.env.local") });

  const vars = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GLORY_ADMIN_ACCESS_HASH: process.env.GLORY_ADMIN_ACCESS_HASH,
    GLORY_ADMIN_ACCESS_SALT: process.env.GLORY_ADMIN_ACCESS_SALT,
    GLORY_ADMIN_SECRET: process.env.GLORY_ADMIN_SECRET,
    EMAIL_REPLY_SECRET: process.env.EMAIL_REPLY_SECRET,
    GLORY_ADMIN_EMAIL: process.env.GLORY_ADMIN_EMAIL,
    GLORY_SUPPORT_EMAIL: process.env.GLORY_SUPPORT_EMAIL,
    SUPPORT_EMAIL_DOMAIN: process.env.SUPPORT_EMAIL_DOMAIN,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    RESEND_INBOUND_WEBHOOK_SECRET: webhookSecret,
  };

  for (const [k, v] of Object.entries(vars)) vercelEnv(k, v);

  console.log("\nDeploying...");
  execSync("npx vercel --prod --yes", { cwd: root, stdio: "inherit" });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
