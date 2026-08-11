/**
 * One-shot production setup for Glory Goat admin.
 *
 * Usage:
 *   node --env-file=.env --env-file=.env.admin-setup --env-file=../Projects/braidbook/.env.local scripts/setup-production.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const RESEND_KEY = process.env.RESEND_API_KEY?.trim();
const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const PROJECT_REF = SUPABASE_URL?.replace("https://", "").split(".")[0];
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const WEBHOOK_URL = "https://glorygoatmilksoap.com/api/inbound-email";

const ENV_VARS = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  GLORY_ADMIN_ACCESS_HASH: process.env.GLORY_ADMIN_ACCESS_HASH,
  GLORY_ADMIN_ACCESS_SALT: process.env.GLORY_ADMIN_ACCESS_SALT,
  GLORY_ADMIN_SECRET: process.env.GLORY_ADMIN_SECRET,
  EMAIL_REPLY_SECRET: process.env.EMAIL_REPLY_SECRET,
  GLORY_ADMIN_EMAIL: process.env.GLORY_ADMIN_EMAIL || "admin@glorygoatmilksoap.com",
  GLORY_SUPPORT_EMAIL: process.env.GLORY_SUPPORT_EMAIL || "hello@glorygoatmilksoap.com",
  SUPPORT_EMAIL_DOMAIN: process.env.SUPPORT_EMAIL_DOMAIN || "replies.glorygoatmilksoap.com",
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
};

async function resend(path, options = {}) {
  const res = await fetch(`https://api.resend.com${path}`, {
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

async function applySchema() {
  if (!ACCESS_TOKEN || !PROJECT_REF) {
    console.log("SKIP schema: set SUPABASE_ACCESS_TOKEN to apply via API");
    return false;
  }

  const query = readFileSync(path.join(root, "supabase/schema-glory-admin.sql"), "utf8");
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Schema apply failed:", text);
    return false;
  }
  console.log("OK Applied Supabase schema");
  return true;
}

async function setupResendDomains() {
  if (!RESEND_KEY) {
    console.error("Missing RESEND_API_KEY");
    return null;
  }

  const sendDomain = "glorygoatmilksoap.com";
  const receiveDomain = "replies.glorygoatmilksoap.com";

  let send = null;
  const listed = await resend("/domains");
  if (listed.ok) {
    send = listed.data?.data?.find((d) => d.name === sendDomain);
  }

  if (!send) {
    const created = await resend("/domains", {
      method: "POST",
      body: JSON.stringify({ name: sendDomain, region: "us-east-1" }),
    });
    if (created.ok) {
      send = created.data;
      console.log("OK Created sending domain:", sendDomain);
    } else if (created.status === 409 || created.data?.message?.includes("already")) {
      console.log("Sending domain already exists:", sendDomain);
    } else {
      console.error("Create send domain failed:", created.data);
    }
  } else {
    console.log("Sending domain exists:", sendDomain);
  }

  let receive = listed.data?.data?.find((d) => d.name === receiveDomain);
  if (!receive) {
    const created = await resend("/domains", {
      method: "POST",
      body: JSON.stringify({ name: receiveDomain, region: "us-east-1" }),
    });
    if (created.ok) {
      receive = created.data;
      console.log("OK Created receiving domain:", receiveDomain);
    } else {
      console.error("Create receive domain failed:", created.data);
    }
  } else {
    console.log("Receiving domain exists:", receiveDomain);
  }

  const sendDetail = send?.id ? await resend(`/domains/${send.id}`) : await resend(`/domains`);
  const receiveDetail = receive?.id ? await resend(`/domains/${receive.id}`) : null;

  return {
    sendDomain,
    receiveDomain,
    sendRecords: sendDetail?.data?.records || send?.records || [],
    receiveRecords: receiveDetail?.data?.records || receive?.records || [],
  };
}

async function setupResendWebhook() {
  const listed = await resend("/webhooks");
  const existing = listed.data?.data?.find((w) => w.endpoint === WEBHOOK_URL);

  if (existing) {
    console.log("Webhook exists:", existing.id);
    return existing.signing_secret || process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  }

  const created = await resend("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      endpoint: WEBHOOK_URL,
      events: ["email.received"],
    }),
  });

  if (!created.ok) {
    console.error("Webhook create failed:", created.data);
    return null;
  }

  console.log("OK Created Resend webhook");
  return created.data?.signing_secret || created.data?.secret;
}

function pushVercelEnv(webhookSecret) {
  const vars = { ...ENV_VARS };
  if (webhookSecret) vars.RESEND_INBOUND_WEBHOOK_SECRET = webhookSecret;

  for (const [name, value] of Object.entries(vars)) {
    if (!value) {
      console.log(`SKIP Vercel env ${name} (empty)`);
      continue;
    }
    try {
      execSync(`npx vercel env add ${name} production --force`, {
        cwd: root,
        input: value,
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf8",
      });
      console.log(`OK Vercel env ${name}`);
    } catch (err) {
      console.error(`Vercel env ${name} failed:`, err.stderr || err.message);
    }
  }
}

function deploy() {
  execSync("npx vercel --prod --yes", { cwd: root, stdio: "inherit" });
}

async function main() {
  console.log("=== Glory Goat production setup ===\n");

  await applySchema();

  const dns = await setupResendDomains();
  const webhookSecret = await setupResendWebhook();

  if (dns) {
    console.log("\n--- DNS records (Namecheap Advanced DNS) ---");
    for (const domain of [dns.sendDomain, dns.receiveDomain]) {
      const records = domain === dns.sendDomain ? dns.sendRecords : dns.receiveRecords;
      console.log(`\n${domain}:`);
      for (const r of records || []) {
        console.log(`  ${r.type} ${r.name || "@"} → ${r.value} (priority: ${r.priority ?? "n/a"}) status: ${r.status || "pending"}`);
      }
    }
  }

  console.log("\n--- Vercel env ---");
  pushVercelEnv(webhookSecret);

  console.log("\n--- Deploy ---");
  deploy();

  console.log("\nDone. Admin: https://glorygoatmilksoap.com/ops.html");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
