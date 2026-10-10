// Tiny Node standard library server for the editor. It serves the editor page
// and the browser modules (stripping TypeScript types so the browser gets plain
// JavaScript), and exposes a narrow save endpoint that only writes to the known
// config files. No third party dependencies.

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, normalize } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { spawn } from "node:child_process";

const PORT = 5173;

// The only non-encounter files the save endpoint is allowed to write.
const WRITABLE = new Set(["data/units.json", "data/weapons.json"]);
// Encounter files are also writable; matched by prefix and extension below.

export function safeConfigPath(p: string): boolean {
  // Refuse any raw traversal segment before normalizing, so a path cannot sneak
  // onto an allowed file by going up and back down.
  if (p.includes("..")) return false;
  const norm = normalize(p).replace(/\\/g, "/");
  if (WRITABLE.has(norm)) return true;
  if (norm.startsWith("encounters/") && norm.endsWith(".json")) return true;
  return false;
}

// Roots the server may read static files from.
export function staticAllowed(p: string): boolean {
  if (p.includes("..")) return false;
  const norm = normalize(p).replace(/\\/g, "/");
  return ["src/", "data/", "encounters/", "maps/", "assets/reference/"].some((root) => norm.startsWith(root));
}

// Convert a TypeScript module to browser ready JavaScript by stripping types.
// Import specifiers keep their .ts suffix; the server serves those paths too.
export function toBrowserJs(tsSource: string): string {
  return stripTypeScriptTypes(tsSource, { mode: "strip" });
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
};
const BINARY = new Set([".png", ".gif"]);

async function serveFile(path: string): Promise<{ body: string | Buffer; type: string }> {
  const ext = extname(path);
  // Chapter map images are binary; read them as a Buffer, not utf8.
  if (BINARY.has(ext)) return { body: await readFile(path), type: CONTENT_TYPES[ext] };
  const raw = await readFile(path, "utf8");
  if (ext === ".ts") return { body: toBrowserJs(raw), type: CONTENT_TYPES[".ts"] };
  return { body: raw, type: CONTENT_TYPES[ext] ?? "text/plain; charset=utf-8" };
}

function startServer(): void {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

      if (req.method === "POST" && url.pathname === "/save") {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          path: string; content: unknown;
        };
        if (!safeConfigPath(payload.path)) {
          res.writeHead(403, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "path not allowed" }));
          return;
        }
        await writeFile(payload.path, JSON.stringify(payload.content, null, 2) + "\n", "utf8");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // Static routes.
      let filePath: string;
      if (url.pathname === "/") filePath = "src/editor/index.html";
      else filePath = url.pathname.slice(1); // strip leading slash

      // Only allow reading from the known roots.
      const norm = normalize(filePath).replace(/\\/g, "/");
      if (!staticAllowed(norm)) {
        res.writeHead(404); res.end("not found"); return;
      }

      const { body, type } = await serveFile(norm);
      // No caching: this is a live dev tool, so edits to source, data, and maps
      // must take effect on the next reload rather than serving a stale module.
      res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      res.end(body);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`server error: ${(e as Error).message}`);
    }
  });

  const openPath = process.argv[2] && process.argv[2].startsWith("/") ? process.argv[2] : "/";

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      // A server is already running (for example the editor). Just open the page.
      console.log(`Server already running, opening ${openPath}`);
      openBrowser(`http://localhost:${PORT}${openPath}`);
      process.exit(0);
    }
    throw err;
  });

  server.listen(PORT, () => {
    const target = `http://localhost:${PORT}${openPath}`;
    console.log(`FEArchitect running at http://localhost:${PORT}/`);
    console.log("Close this window to stop the server.");
    openBrowser(target);
  });
}

function openBrowser(target: string): void {
  // Windows: use the start command via cmd. Harmless if it fails.
  try {
    spawn("cmd", ["/c", "start", "", target], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // ignore, the user can open the URL by hand
  }
}

// Only start listening when run directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("server.ts")) {
  startServer();
}
