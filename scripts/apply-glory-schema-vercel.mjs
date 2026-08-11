/**
 * Apply Glory Goat schema using BraidAppt Supabase credentials from Vercel.
 * Run from braidbook folder:
 *   npx vercel env run --environment production node ../goat-milk-website/scripts/apply-glory-schema-vercel.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "../supabase/schema-glory-admin.sql");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase URL or service role key in environment");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { error: probeError } = await supabase.from("gg_products").select("product_key").limit(1);
if (!probeError) {
  console.log("Schema already applied (gg_products exists)");
  process.exit(0);
}

if (probeError.code !== "42P01" && !probeError.message.includes("does not exist")) {
  console.error("Unexpected error probing gg_products:", probeError.message);
  process.exit(1);
}

const statements = readFileSync(schemaPath, "utf8")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith("--"));

for (const statement of statements) {
  const { error } = await supabase.rpc("exec_sql", { query: statement });
  if (error) {
    console.error("Statement failed:", error.message);
    console.error("SQL preview:", statement.slice(0, 120));
    process.exit(1);
  }
}

console.log("Applied schema via exec_sql");
