import { getSupabase } from "./db.js";
import { PRODUCT_LABELS } from "./glory-products.js";

export function isInStock(product) {
  if (!product?.active) return false;
  if (product.inventory_count == null) return true;
  if (!product.auto_stop) return true;
  return product.inventory_count > 0;
}

export async function getProduct(productKey) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("gg_products")
    .select("*")
    .eq("product_key", productKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listProducts() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("gg_products").select("*").order("product_key");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    label: PRODUCT_LABELS[row.product_key] || row.name,
    in_stock: isInStock(row),
  }));
}

export async function decrementInventory(productKey) {
  const product = await getProduct(productKey);
  if (!product || product.inventory_count == null) return product;

  const next = Math.max(0, product.inventory_count - 1);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("gg_products")
    .update({ inventory_count: next, updated_at: new Date().toISOString() })
    .eq("product_key", productKey)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function incrementInventory(productKey) {
  const product = await getProduct(productKey);
  if (!product || product.inventory_count == null) return product;

  const next = product.inventory_count + 1;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("gg_products")
    .update({ inventory_count: next, updated_at: new Date().toISOString() })
    .eq("product_key", productKey)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateProductInventory(productKey, inventoryCount, autoStop) {
  const supabase = getSupabase();
  const patch = { updated_at: new Date().toISOString() };
  if (inventoryCount !== undefined) {
    patch.inventory_count = inventoryCount === "" || inventoryCount === null ? null : Number(inventoryCount);
  }
  if (autoStop !== undefined) patch.auto_stop = Boolean(autoStop);

  const { data, error } = await supabase
    .from("gg_products")
    .update(patch)
    .eq("product_key", productKey)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function addStockWaitlist(productKey, email) {
  const supabase = getSupabase();
  const { error } = await supabase.from("gg_stock_waitlist").upsert(
    {
      product_key: productKey,
      email: email.trim().toLowerCase(),
      notified_at: null,
    },
    { onConflict: "product_key,email" },
  );
  if (error) throw error;
}

export async function notifyWaitlist(productKey, sendEmailFn) {
  const supabase = getSupabase();
  const product = await getProduct(productKey);
  if (!product || !isInStock(product)) {
    throw new Error("Product is not in stock");
  }

  const { data: waiters, error } = await supabase
    .from("gg_stock_waitlist")
    .select("id, email")
    .eq("product_key", productKey)
    .is("notified_at", null);
  if (error) throw error;

  const label = PRODUCT_LABELS[productKey] || product.name;
  let sent = 0;

  for (const waiter of waiters ?? []) {
    await sendEmailFn({ to: waiter.email, productName: label, productKey });
    await supabase
      .from("gg_stock_waitlist")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", waiter.id);
    sent += 1;
  }

  return sent;
}
