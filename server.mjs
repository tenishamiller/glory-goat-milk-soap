import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const apiRoot = path.resolve(root, "api");

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

const handlerCache = new Map();

const BLOCKED_NAMES = new Set([
  ".env",
  ".gitignore",
  "dockerfile",
  "package.json",
  "package-lock.json",
  "server.mjs",
]);

function wrapResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = (body) => {
    if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
      return res.json(body);
    }
    res.end(body ?? "");
    return res;
  };
  return res;
}

function resolveApiModule(pathname) {
  const cleaned = pathname.replace(/\/+$/, "") || "/";
  if (!cleaned.startsWith("/api/")) return null;
  const rel = `${cleaned.slice(1)}.js`;
  const resolved = path.resolve(root, rel);
  if (resolved !== apiRoot && !resolved.startsWith(`${apiRoot}${path.sep}`)) {
    return null;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

function isBlocked(filePath) {
  const rel = path.relative(root, filePath).replaceAll("\\", "/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) return true;
  const base = path.basename(filePath).toLowerCase();
  if (BLOCKED_NAMES.has(base) || base.startsWith(".env")) return true;
  if (rel.startsWith(".git/") || rel.startsWith("node_modules/")) return true;
  return false;
}

function resolveStatic(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0] || "/");
  const candidates = [];
  if (decoded.endsWith("/")) {
    candidates.push(path.join(root, decoded, "index.html"));
  } else {
    candidates.push(path.join(root, decoded));
    candidates.push(path.join(root, `${decoded}.html`));
    candidates.push(path.join(root, decoded, "index.html"));
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) continue;
    if (isBlocked(resolved)) continue;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }
  return null;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  if (ext === ".html") res.setHeader("Cache-Control", "no-cache");
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  wrapResponse(res);
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  req.query = Object.fromEntries(url.searchParams.entries());

  try {
    const apiFile = resolveApiModule(url.pathname);
    if (apiFile) {
      let handler = handlerCache.get(apiFile);
      if (!handler) {
        const mod = await import(pathToFileURL(apiFile).href);
        handler = mod.default;
        if (typeof handler === "function") handlerCache.set(apiFile, handler);
      }
      if (typeof handler !== "function") {
        res.status(500).json({ error: "Invalid API handler" });
        return;
      }
      await handler(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const filePath = resolveStatic(url.pathname === "/" ? "/index.html" : url.pathname);
    if (!filePath) {
      res.status(404).end("Not found");
      return;
    }
    if (req.method === "HEAD") {
      res.statusCode = 200;
      res.end();
      return;
    }
    sendFile(res, filePath);
  } catch (err) {
    console.error("[glory-goat] request failed", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Server error" });
    } else {
      res.end();
    }
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Glory Goat Milk Soap listening on ${port}`);
});
