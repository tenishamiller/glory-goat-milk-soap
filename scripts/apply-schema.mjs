/**
 * Apply schema via Supabase Management API.
 * Requires SUPABASE_ACCESS_TOKEN in env or braidbook .env.local
 *
 * Usage:
 *   node --env-file=../Projects/braidbook/.env.local scripts/apply-schema.mjs
 *   npx vercel env run --environment production node scripts/apply-schema.mjs  (from braidbook, with env copied)
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRef =
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .replace("https://", "")
    .split(".")[0] || "rnjkssiuzqkpawakxwry";
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const query = readFileSync(path.join(__dirname, "../supabase/schema-glory-admin.sql"), "utf8");

if (!token || !projectRef) {
  console.error("Need SUPABASE_URL and SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
});

const text = await res.text();
if (!res.ok) {
  console.error("Schema apply failed:", text);
  process.exit(1);
}

console.log("Applied supabase/schema-glory-admin.sql");
