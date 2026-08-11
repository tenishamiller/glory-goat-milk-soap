/**
 * Create gg_curing_settings and seed defaults.
 * Run with Supabase service role in env:
 *   npx vercel env pull .env.local --environment production
 *   node --env-file=.env.local scripts/setup-curing-settings.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../supabase/migrations/001-gg-curing-settings.sql");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const projectRef = url.replace("https://", "").split(".")[0];
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const query = readFileSync(sqlPath, "utf8");

if (token) {
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
    console.error("Management API failed:", text);
    process.exit(1);
  }
  console.log("Applied curing settings migration via Management API");
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supabase.from("gg_curing_settings").select("id").eq("id", 1).maybeSingle();

if (!error && data) {
  console.log("gg_curing_settings already exists");
  process.exit(0);
}

console.error("Table missing and SUPABASE_ACCESS_TOKEN not set — run the SQL in supabase/migrations/001-gg-curing-settings.sql manually.");
process.exit(1);
