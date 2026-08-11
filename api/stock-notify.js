import { isDbConfigured } from "../lib/db.js";
import { addStockWaitlist, getProduct } from "../lib/inventory.js";

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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isDbConfigured()) {
    return res.status(503).json({ error: "Not configured" });
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const productKey = body.product?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!productKey || !email) {
    return res.status(400).json({ error: "Product and email are required" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }

  try {
    const product = await getProduct(productKey);
    if (!product) {
      return res.status(404).json({ error: "Unknown product" });
    }

    await addStockWaitlist(productKey, email);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[stock-notify]", err.message);
    return res.status(500).json({ error: "Could not save notification request" });
  }
}
