import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname } from "node:path";

export const productionHeaders = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(self), microphone=(self), geolocation=()",
  "content-security-policy":
    "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; connect-src 'self' https://tessdata.projectnaptha.com https://cdn.jsdelivr.net; media-src 'self' blob:; worker-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'",
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const inside = (root, file) => {
  const r = relative(root, file);
  return (
    r !== ".." &&
    !r.startsWith("..\\") &&
    !r.startsWith("../") &&
    !isAbsolute(r)
  );
};
export async function serveStatic(req, res, webRoot, path) {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.split("/").some((s) => s.startsWith("."))
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  const root = await realpath(resolve(webRoot));
  let file = resolve(root, "." + decoded);
  if (decoded === "/" || !extname(decoded)) file = resolve(root, "index.html");
  try {
    file = await realpath(file);
    if (!inside(root, file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      ...productionHeaders,
      "content-type": types[extname(file)] || "application/octet-stream",
      "content-length": body.length,
      "cache-control": decoded.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (e) {
    if (!["ENOENT", "EISDIR", "ENOTDIR"].includes(e.code)) throw e;
    res.writeHead(404, { ...productionHeaders, "cache-control": "no-store" });
    res.end();
  }
}
