import {
  isAdminConfigured,
  setAdminCookie,
  validateAccessCodeFormat,
  verifyAdminCookie,
  verifyStoredAccessCode,
} from "../../lib/admin-auth.js";

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
  if (req.method === "GET") {
    if (!isAdminConfigured()) {
      return res.status(200).json({ configured: false, authenticated: false });
    }
    return res.status(200).json({
      configured: true,
      authenticated: verifyAdminCookie(req.headers.cookie || ""),
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAdminConfigured()) {
    return res.status(503).json({ error: "Admin is not configured yet" });
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const code = body.code?.trim() ?? "";
  const formatError = validateAccessCodeFormat(code);
  if (formatError) {
    return res.status(400).json({ error: formatError });
  }

  if (!verifyStoredAccessCode(code)) {
    return res.status(401).json({ error: "Incorrect access code" });
  }

  setAdminCookie(res);
  return res.status(200).json({ ok: true });
}
