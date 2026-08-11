/**
 * @deprecated Use scripts/migrate-glory-domain-email.mjs for glorygoatmilksoap.com email.
 * Fix Glory Goat email env for shared Resend account (1 domain: braidappt.com). * Also sets correct inbound webhook secret.
 *
 * Usage:
 *   node --env-file=.env.admin-setup --env-file=../Projects/braidbook/.env.local scripts/fix-glory-email-env.mjs
 */
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESEND_KEY = process.env.RESEND_API_KEY?.trim();
const WEBHOOK_ID = "d8ab6b3d-4e0e-4586-af45-f18fbf6a7c95";

async function resend(route) {
  const res = await fetch(`https://api.resend.com${route}`, {
    headers: { Authorization: `Bearer ${RESEND_KEY}` },
  });
  return res.json();
}

function setEnv(name, value) {
  execSync(`npx vercel env add ${name} production --force`, {
    cwd: root,
    input: value,
    stdio: ["pipe", "pipe", "pipe"],
  });
  console.log("OK", name);
}

const webhook = await resend(`/webhooks/${WEBHOOK_ID}`);
const webhookSecret = webhook.signing_secret || process.env.RESEND_INBOUND_WEBHOOK_SECRET;

setEnv("GLORY_ADMIN_EMAIL", "glory-admin@braidappt.com");
setEnv("GLORY_SUPPORT_EMAIL", "glory@braidappt.com");
setEnv("SUPPORT_EMAIL_DOMAIN", "replies.braidappt.com");
if (webhookSecret) setEnv("RESEND_INBOUND_WEBHOOK_SECRET", webhookSecret);

console.log("Email env updated for shared Resend domain (braidappt.com)");
