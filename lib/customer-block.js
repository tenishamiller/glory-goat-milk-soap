export function normalizeCustomerEmail(email) {
  return email?.trim().toLowerCase() || "";
}

export async function isEmailBlocked(supabase, email) {
  const normalized = normalizeCustomerEmail(email);
  if (!normalized) return false;

  const { data, error } = await supabase
    .from("gg_blocked_customers")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function getBlockedEmailSet(supabase, emails) {
  const normalized = [...new Set(emails.map(normalizeCustomerEmail).filter(Boolean))];
  if (!normalized.length) return new Set();

  const { data, error } = await supabase.from("gg_blocked_customers").select("email").in("email", normalized);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.email));
}

export async function listBlockedCustomers(supabase) {
  const { data, error } = await supabase
    .from("gg_blocked_customers")
    .select("*")
    .order("blocked_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function blockCustomer(supabase, { email, reason = "", source = "manual" }) {
  const normalized = normalizeCustomerEmail(email);
  if (!normalized) {
    throw new Error("Email is required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Enter a valid email address");
  }

  const { data, error } = await supabase
    .from("gg_blocked_customers")
    .upsert(
      {
        email: normalized,
        reason: reason.trim(),
        source: source.trim() || "manual",
        blocked_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function unblockCustomer(supabase, email) {
  const normalized = normalizeCustomerEmail(email);
  if (!normalized) {
    throw new Error("Email is required");
  }

  const { error } = await supabase.from("gg_blocked_customers").delete().eq("email", normalized);
  if (error) throw error;
  return { email: normalized };
}
