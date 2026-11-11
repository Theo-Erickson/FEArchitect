// FEArchitect hub: the front door. Serves a control panel that indexes every
// tool, launches them as child processes, and streams their output live to the
// page over Server-Sent Events. Node standard library only.
// Run directly: node hub/server.ts   (or double-click FEArchitect.cmd)
import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS, findTool, groupTools, prereqStatus, spawnSpec, toolUrl, sameServer, commandLine, type Tool } from "./catalog.ts";
import { RunLog, type LogLine } from "./runlog.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PORT = 5180;
const HOST = "127.0.0.1";

type State = "idle" | "running" | "exited" | "failed" | "stopped" | "console";
interface Run { state: State; code?: number | null; child?: ChildProcess; log: RunLog; startedAt?: number; stopping?: boolean }

const runs = new Map<string, Run>(TOOLS.map((t) => [t.id, { state: "idle", log: new RunLog() }]));
const clients = new Set<ServerResponse>();

function send(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function broadcast(event: string, data: unknown): void {
  for (const c of clients) send(c, event, data);
}
function emitLines(id: string, lines: LogLine[]): void {
  if (lines.length) broadcast("log", { id, lines });
}
function setState(id: string, state: State, code?: number | null): void {
  const run = runs.get(id)!;
  run.state = state;
  run.code = code;
  broadcast("state", { id, state, code });
}

function snapshot() {
  return groupTools(TOOLS).map((g) => ({
    group: g.group,
    tools: g.tools.map((t) => {
      const run = runs.get(t.id)!;
      return {
        id: t.id, name: t.name, summary: t.summary, when: t.when, launcher: t.launcher,
        interactive: !!t.interactive, url: toolUrl(t), port: t.serve?.port,
        command: commandLine(t),
        prereqs: prereqStatus(t, (rel) => existsSync(join(ROOT, rel))),
        state: run.state, code: run.code,
      };
    }),
  }));
}

/** A running tool already serving the same port as `tool`, if any. */
function servingPeer(tool: Tool): Tool | undefined {
  return TOOLS.find((t) => sameServer(t, tool) && runs.get(t.id)!.state === "running");
}

function launch(tool: Tool): { ok: boolean; open?: string; error?: string } {
  const run = runs.get(tool.id)!;
  const peer = servingPeer(tool);
  if (peer) {
    // One server covers several pages (editor, map, scenario): just open this page.
    emitLines(tool.id, [run.log.sys(`Server already running (${peer.name}); opening ${toolUrl(tool)}`)]);
    return { ok: true, open: toolUrl(tool) };
  }
  if (run.state === "running") return { ok: false, error: "already running" };

  const spec = spawnSpec(tool, ROOT, process.execPath);
  run.log = new RunLog();
  run.startedAt = Date.now();
  broadcast("reset", { id: tool.id });
  emitLines(tool.id, [run.log.sys(`> ${commandLine(tool)}`)]);

  if (spec.console) {
    const child = spawn(spec.command, spec.args, { cwd: spec.cwd, detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
    emitLines(tool.id, [run.log.sys("Opened in its own console window (it needs your keyboard). Close that window to stop it.")]);
    setState(tool.id, "console");
    return { ok: true };
  }

  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  run.child = child;
  child.stdout!.setEncoding("utf8").on("data", (d: string) => emitLines(tool.id, run.log.push("out", d)));
  child.stderr!.setEncoding("utf8").on("data", (d: string) => emitLines(tool.id, run.log.push("err", d)));
  child.on("error", (e) => {
    emitLines(tool.id, [run.log.sys(`Could not start: ${e.message}`)]);
    run.child = undefined;
    setState(tool.id, "failed", null);
  });
  child.on("close", (code) => {
    if (run.child !== child) return;
    emitLines(tool.id, run.log.flush());
    const secs = ((Date.now() - (run.startedAt ?? Date.now())) / 1000).toFixed(1);
    const state: State = run.stopping ? "stopped" : code === 0 ? "exited" : "failed";
    const msg = { stopped: `Stopped after ${secs}s`, exited: `Finished in ${secs}s`, failed: `Exited with code ${code} after ${secs}s` }[state as "stopped" | "exited" | "failed"];
    emitLines(tool.id, [run.log.sys(msg)]);
    run.child = undefined;
    run.stopping = false;
    setState(tool.id, state, code);
  });
  setState(tool.id, "running");
  return { ok: true };
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  // Kill the whole tree: `node --test` and friends spawn their own children.
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill();
}

function stop(tool: Tool): { ok: boolean; error?: string } {
  const run = runs.get(tool.id)!;
  if (!run.child) return { ok: false, error: "not running" };
  run.stopping = true;
  emitLines(tool.id, [run.log.sys("Stopping...")]);
  killTree(run.child);
  return { ok: true };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function serveFile(res: ServerResponse, rel: string, type: string): Promise<void> {
  let body = await readFile(join(ROOT, rel), "utf8");
  if (rel.endsWith(".ts")) body = stripTypeScriptTypes(body, { mode: "strip" });
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const p = url.pathname;
    if (req.method === "GET" && p === "/") return void await serveFile(res, "hub/index.html", "text/html; charset=utf-8");
    if (req.method === "GET" && p === "/hub/client.ts") return void await serveFile(res, "hub/client.ts", "text/javascript; charset=utf-8");
    if (req.method === "GET" && p === "/api/tools") return json(res, 200, snapshot());
    if (req.method === "GET" && p === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(": connected\n\n"); // flush headers now so the page knows it is live
      clients.add(res);
      // Replay every tool's history so a refreshed page loses nothing.
      for (const [id, run] of runs) if (run.log.lines.length) send(res, "log", { id, lines: run.log.lines });
      req.on("close", () => clients.delete(res));
      return;
    }
    const m = /^\/api\/(run|stop)\/([\w-]+)$/.exec(p);
    if (req.method === "POST" && m) {
      // A custom header forces a CORS preflight, so other sites cannot trigger launches.
      if (req.headers["x-fea-hub"] !== "1") return json(res, 403, { ok: false, error: "forbidden" });
      const tool = findTool(m[2]);
      if (!tool) return json(res, 404, { ok: false, error: "unknown tool" });
      const r = m[1] === "run" ? launch(tool) : stop(tool);
      return json(res, r.ok ? 200 : 409, r);
    }
    res.writeHead(404); res.end("not found");
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`hub error: ${(e as Error).message}`);
  }
});

function openBrowser(target: string): void {
  if (process.env.FEA_NO_BROWSER) return;
  try { spawn("cmd", ["/c", "start", "", target], { detached: true, stdio: "ignore" }).unref(); } catch {}
}

function shutdown(): void {
  for (const run of runs.values()) if (run.child) killTree(run.child);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown); // console window closed

// Keep SSE connections alive through idle stretches.
setInterval(() => { for (const c of clients) c.write(": ping\n\n"); }, 20000).unref();

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.log("The hub is already running; opening it.");
    openBrowser(`http://localhost:${PORT}/`);
    process.exit(0);
  }
  throw err;
});
server.listen(PORT, HOST, () => {
  console.log(`FEArchitect hub at http://localhost:${PORT}/`);
  console.log("Leave this window open while you work. Closing it stops every tool started from the hub.");
  openBrowser(`http://localhost:${PORT}/`);
});
