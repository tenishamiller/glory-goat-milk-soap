import { isDbConfigured } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-auth.js";
import { getCuringSettings, updateCuringSettings } from "../../lib/curing.js";

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!isDbConfigured()) {
    return res.status(503).json({ error: "Not configured" });
  }

  if (req.method === "GET") {
    try {
      const curing = await getCuringSettings();
      return res.status(200).json({ curing });
    } catch (err) {
      console.error("[admin curing GET]", err.message);
      return res.status(500).json({ error: err.message || "Could not load curing settings" });
    }
  }

  if (req.method === "PATCH") {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    try {
      const curing = await updateCuringSettings({
        is_curing: body.is_curing,
        ready_date: body.ready_date,
      });
      return res.status(200).json({ curing });
    } catch (err) {
      console.error("[admin curing PATCH]", err.message);
      return res.status(500).json({ error: err.message || "Could not save curing settings" });
    }
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
