// Gallery server: serve the page and the imported reference assets, list which
// games were imported, and lazily export+cache battle-animation GIFs on demand.
// Node standard library only. Run directly: node gallery/server.ts [/path]
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { staticAllowed, animCacheRel, animArgs, validAnimRequest, GAMES } from "./galleryutil.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PORT = 5174;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
};

function cliPath(): string {
  return process.env.FEA_FEBUILDER_CLI ?? join(ROOT, "tools/febuilder-cli/FEBuilderGBA.CLI.exe");
}
function romPath(game: string): string {
  const env: Record<string, string> = { fe6: "FEA_FE6_ROM", fe7: "FEA_FE7_ROM", fe8: "FEA_FE8_ROM" };
  const file: Record<string, string> = { fe6: "FE6_clean.gba", fe7: "FE7_clean.gba", fe8: "FE8_Clean.gba" };
  return process.env[env[game]] ?? join(ROOT, "base", file[game]);
}
// Games that actually have imported data on disk.
function importedGames(): string[] {
  return GAMES.filter((g) => existsSync(join(ROOT, "assets/reference", g, "units.json")));
}

async function serveStatic(res: any, rel: string): Promise<void> {
  if (!staticAllowed(rel)) { res.writeHead(404); res.end("not found"); return; }
  const abs = join(ROOT, rel);
  try {
    const body = await readFile(abs);
    res.writeHead(200, { "content-type": CONTENT_TYPES[extname(abs)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}

async function serveAnim(res: any, params: URLSearchParams): Promise<void> {
  const game = params.get("game") ?? "";
  const id = Number(params.get("id"));
  const section = Number(params.get("section") ?? "0");
  if (!validAnimRequest(game, id, section)) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bad game/id/section" }));
    return;
  }
  const rel = animCacheRel(game, id, section);
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    await mkdir(dirname(abs), { recursive: true });
    const r = spawnSync(cliPath(), animArgs(romPath(game), id, section, abs), { encoding: "utf8" });
    if (r.status !== 0 || !existsSync(abs)) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: (r.stderr || r.stdout || "export failed").trim().slice(0, 300) }));
      return;
    }
  }
  const body = await readFile(abs);
  res.writeHead(200, { "content-type": "image/gif", "cache-control": "no-store" });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (url.pathname === "/") return void await serveStatic(res, "gallery/index.html");
    if (url.pathname === "/games") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return void res.end(JSON.stringify(importedGames()));
    }
    if (url.pathname === "/anim") return void await serveAnim(res, url.searchParams);
    await serveStatic(res, url.pathname.slice(1));
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`server error: ${(e as Error).message}`);
  }
});

function openBrowser(target: string): void {
  try { spawnSync("cmd", ["/c", "start", "", target], { stdio: "ignore" }); } catch {}
}

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") { openBrowser(`http://localhost:${PORT}/`); process.exit(0); }
  throw err;
});
server.listen(PORT, () => {
  console.log(`FEArchitect gallery at http://localhost:${PORT}/`);
  console.log("Close this window to stop the gallery.");
  openBrowser(`http://localhost:${PORT}/`);
});
