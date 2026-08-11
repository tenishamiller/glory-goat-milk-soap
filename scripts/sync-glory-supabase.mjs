/**
 * Apply Glory Goat schema + sync Supabase env to Glory Goat Vercel project.
 *
 * Run from braidbook (loads production Supabase creds via Vercel):
 *   npx vercel env run --environment production node ../goat-milk-website/scripts/sync-glory-supabase.mjs
 */
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goatRoot = path.join(__dirname, "..");
const schemaSql = readFileSync(path.join(goatRoot, "supabase/schema-glory-admin.sql"), "utf8");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!url || !key) {
  console.error("Missing Supabase credentials in environment");
  process.exit(1);
}

const projectRef = url.replace("https://", "").split(".")[0];

async function applySchema() {
  const { error: probe } = await createClient(url, key, { auth: { persistSession: false } })
    .from("gg_products")
    .select("product_key")
    .limit(1);

  if (!probe) {
    console.log("Schema already applied");
    return;
  }

  if (!accessToken) {
    console.error("gg_products missing and SUPABASE_ACCESS_TOKEN not set — cannot apply DDL");
    process.exit(1);
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: schemaSql }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("Schema apply failed:", text.slice(0, 500));
    process.exit(1);
  }

  console.log("Applied schema to", projectRef);
}

function vercelEnv(name, value, cwd) {
  const result = spawnSync("npx", ["vercel", "env", "add", name, "production", "--force"], {
    cwd,
    input: value,
    encoding: "utf8",
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`Failed to set ${name}: ${result.stderr || result.stdout}`);
  }
  console.log("OK", name);
}

await applySchema();

console.log("Updating Glory Goat Vercel Supabase env...");
vercelEnv("SUPABASE_URL", url, goatRoot);
vercelEnv("SUPABASE_SERVICE_ROLE_KEY", key, goatRoot);

console.log("Redeploying Glory Goat...");
const deploy = spawnSync("npx", ["vercel", "--prod", "--yes"], {
  cwd: goatRoot,
  shell: true,
  stdio: "inherit",
});
process.exit(deploy.status ?? 0);
