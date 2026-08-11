import { getSupabase } from "./db.js";

export const DEFAULT_CURING = {
  is_curing: true,
  ready_date: "2026-09-20",
};

function ordinal(day) {
  const n = Number(day);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

export function formatReadyDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = String(isoDate).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day);
  const monthName = date.toLocaleDateString("en-US", { month: "long" });
  return `${monthName} ${ordinal(day)}, ${year}`;
}

export function buildCuringMessage(settings) {
  if (!settings?.is_curing) return "";
  const ready = formatReadyDate(settings.ready_date);
  if (ready) {
    return `Currently curing — ready by ${ready}.`;
  }
  return "Currently curing.";
}

export function normalizeCuringRow(row) {
  return {
    is_curing: Boolean(row?.is_curing),
    ready_date: row?.ready_date ? String(row.ready_date).slice(0, 10) : DEFAULT_CURING.ready_date,
    message: buildCuringMessage(row),
  };
}

export async function getCuringSettings() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("gg_curing_settings").select("is_curing, ready_date").eq("id", 1).maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return normalizeCuringRow(DEFAULT_CURING);
    }
    throw error;
  }

  if (!data) {
    return normalizeCuringRow(DEFAULT_CURING);
  }

  return normalizeCuringRow(data);
}

export async function updateCuringSettings({ is_curing, ready_date }) {
  const supabase = getSupabase();
  const patch = {
    id: 1,
    updated_at: new Date().toISOString(),
  };

  if (is_curing !== undefined) patch.is_curing = Boolean(is_curing);
  if (ready_date !== undefined) patch.ready_date = String(ready_date).slice(0, 10);

  const { data, error } = await supabase
    .from("gg_curing_settings")
    .upsert(patch, { onConflict: "id" })
    .select("is_curing, ready_date")
    .single();

  if (error) throw error;
  return normalizeCuringRow(data);
}

export function isSoapCuring(settings) {
  return Boolean(settings?.is_curing);
}
