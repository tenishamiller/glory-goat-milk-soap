export function normalizePersonName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function namesMatch(submitted, onRecord) {
  const a = normalizePersonName(submitted);
  const b = normalizePersonName(onRecord);
  return Boolean(a && b && a === b);
}
