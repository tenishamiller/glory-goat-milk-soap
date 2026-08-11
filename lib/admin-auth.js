import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const COOKIE_NAME = "glory_admin_access";
const COOKIE_MAX_AGE_SEC = 12 * 60 * 60;
const SCRYPT_KEYLEN = 64;

export function normalizeAccessCode(input) {
  return input.trim().toUpperCase();
}

export function validateAccessCodeFormat(code) {
  const normalized = normalizeAccessCode(code);
  if (normalized.length < 6 || normalized.length > 32) {
    return "Access code must be 6–32 characters.";
  }
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return "Access code can only contain letters and numbers.";
  }
  return null;
}

export function hashAccessCode(code) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalizeAccessCode(code), salt, SCRYPT_KEYLEN).toString("hex");
  return { hash, salt };
}

export function verifyAccessCode(code, hash, salt) {
  try {
    const derived = scryptSync(normalizeAccessCode(code), salt, SCRYPT_KEYLEN).toString("hex");
    return timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

function adminSecret() {
  return (
    process.env.GLORY_ADMIN_SECRET?.trim() ||
    process.env.ADMIN_ACCESS_SECRET?.trim() ||
    process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
    ""
  );
}

export function signAdminCookie() {
  const secret = adminSecret();
  if (!secret) throw new Error("GLORY_ADMIN_SECRET is not configured");
  const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SEC;
  const payload = `admin.${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return { value: `${payload}.${sig}`, exp };
}

export function verifyAdminCookie(cookieHeader) {
  const secret = adminSecret();
  if (!secret || !cookieHeader) return false;

  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  const raw = match?.[1];
  if (!raw) return false;

  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== "admin") return false;

  const payload = `${parts[0]}.${parts[1]}`;
  const sig = parts[2];
  const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false;
  } catch {
    return false;
  }

  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return true;
}

export function setAdminCookie(res) {
  const { value } = signAdminCookie();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SEC}${secure}`,
  );
}

export function requireAdmin(req, res) {
  if (!verifyAdminCookie(req.headers.cookie || "")) {
    res.status(401).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

export function isAdminConfigured() {
  const hash = process.env.GLORY_ADMIN_ACCESS_HASH?.trim();
  const salt = process.env.GLORY_ADMIN_ACCESS_SALT?.trim();
  return Boolean(hash && salt && adminSecret());
}

export function verifyStoredAccessCode(code) {
  const hash = process.env.GLORY_ADMIN_ACCESS_HASH?.trim();
  const salt = process.env.GLORY_ADMIN_ACCESS_SALT?.trim();
  if (!hash || !salt) return false;
  return verifyAccessCode(code, hash, salt);
}

export { COOKIE_NAME };
