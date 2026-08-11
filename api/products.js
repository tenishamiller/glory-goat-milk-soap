import { getSupabase, isDbConfigured } from "../lib/db.js";
import { buildCuringMessage, DEFAULT_CURING, isSoapCuring, normalizeCuringRow } from "../lib/curing.js";
import { listProducts } from "../lib/inventory.js";

async function loadCuringForPublic() {
  if (!isDbConfigured()) {
    return normalizeCuringRow(DEFAULT_CURING);
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("gg_curing_settings")
      .select("is_curing, ready_date")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return normalizeCuringRow(DEFAULT_CURING);
      }
      throw error;
    }

    return normalizeCuringRow(data ?? DEFAULT_CURING);
  } catch (err) {
    console.error("[products curing]", err.message);
    return normalizeCuringRow(DEFAULT_CURING);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const curing = await loadCuringForPublic();

  if (!isDbConfigured()) {
    return res.status(200).json({
      products: [],
      configured: false,
      curing,
    });
  }

  try {
    const products = await listProducts();
    return res.status(200).json({
      configured: true,
      curing,
      products: products.map((p) => ({
        product_key: p.product_key,
        name: p.name,
        label: p.label,
        inventory_count: p.inventory_count,
        auto_stop: p.auto_stop,
        in_stock: p.in_stock,
        active: p.active,
        curing: p.product_key === "classic_bar" && isSoapCuring(curing),
        curing_message: p.product_key === "classic_bar" ? buildCuringMessage(curing) : "",
      })),
    });
  } catch (err) {
    console.error("[products]", err.message);
    return res.status(500).json({ error: "Could not load products" });
  }
}
