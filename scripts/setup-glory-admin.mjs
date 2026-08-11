/**
 * Generate Glory Goat admin access code + env vars.
 * Usage: node scripts/setup-glory-admin.mjs
 */
import { randomBytes } from "crypto";
import { hashAccessCode } from "../lib/admin-auth.js";

const code = randomBytes(4).toString("hex").toUpperCase();
const { hash, salt } = hashAccessCode(code);
const secret = randomBytes(32).toString("hex");
const replySecret = randomBytes(32).toString("hex");

console.log("=== Glory Goat Admin Setup ===\n");
console.log("Save this access code somewhere safe (shown once):");
console.log(`  ${code}\n`);
console.log("Add these to Vercel (glory-goat-milk-soap project):\n");
console.log(`GLORY_ADMIN_ACCESS_HASH=${hash}`);
console.log(`GLORY_ADMIN_ACCESS_SALT=${salt}`);
console.log(`GLORY_ADMIN_SECRET=${secret}`);
console.log(`EMAIL_REPLY_SECRET=${replySecret}`);
console.log("GLORY_ADMIN_EMAIL=admin@glorygoatmilksoap.com");
console.log("GLORY_SUPPORT_EMAIL=hello@glorygoatmilksoap.com");
console.log("SUPPORT_EMAIL_DOMAIN=replies.glorygoatmilksoap.com");
console.log("\nAdmin inbox: https://glorygoatmilksoap.com/ops.html");
console.log("\nThen run supabase/schema-glory-admin.sql in Supabase SQL Editor.");
console.log("Set up Resend inbound for replies.glorygoatmilksoap.com → /api/inbound-email");
