import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS, GROUPS, findTool, groupTools, prereqStatus, spawnSpec, toolUrl, sameServer, commandLine } from "./catalog.ts";

test("every tool has a unique id, a known group and copy for the guide", () => {
  const ids = new Set<string>();
  for (const t of TOOLS) {
    assert.ok(!ids.has(t.id), `duplicate id ${t.id}`);
    ids.add(t.id);
    assert.ok((GROUPS as readonly string[]).includes(t.group), `${t.id} has unknown group`);
    assert.ok(t.name && t.summary && t.when, `${t.id} is missing guide copy`);
  }
});

test("catalog launchers and launchers/ folder match one to one", () => {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const onDisk = readdirSync(join(root, "launchers")).filter((f) => f.endsWith(".cmd")).map((f) => `launchers/${f}`).sort();
  assert.deepEqual(TOOLS.map((t) => t.launcher).sort(), onDisk);
});

test("findTool returns the tool or undefined", () => {
  assert.equal(findTool("gallery")?.name, "Asset Gallery");
  assert.equal(findTool("nope"), undefined);
});

test("groupTools keeps group order and drops empty groups", () => {
  const groups = groupTools(TOOLS);
  assert.deepEqual(groups.map((g) => g.group), GROUPS.filter((g) => TOOLS.some((t) => t.group === g)));
  assert.equal(groups.reduce((n, g) => n + g.tools.length, 0), TOOLS.length);
});

test("prereqStatus reports each prerequisite against the exists check", () => {
  const imp = findTool("import")!;
  const none = prereqStatus(imp, () => false);
  assert.equal(none.length, imp.prereqs.length);
  assert.ok(none.every((p) => !p.ok));
  assert.ok(prereqStatus(imp, () => true).every((p) => p.ok));
  // Note-only prereqs (no path) are always reported as ok: they cannot be checked.
  const bridge = findTool("bridge")!;
  assert.ok(prereqStatus(bridge, () => false).some((p) => p.ok && !p.path));
});

test("spawnSpec runs node with the tool script from the repo root", () => {
  const s = spawnSpec(findTool("preview")!, "C:/repo", "C:/node.exe");
  assert.equal(s.command, "C:/node.exe");
  assert.deepEqual(s.args, ["--no-warnings", "src/preview.ts", "encounters/duel-01.json"]);
  assert.equal(s.cwd, "C:/repo");
  assert.equal(s.console, false);
});

test("spawnSpec opens interactive tools in their own console window", () => {
  const s = spawnSpec(findTool("bridge")!, "C:/repo", "C:/node.exe");
  assert.equal(s.console, true);
  assert.equal(s.command, "cmd");
  assert.deepEqual(s.args.slice(0, 3), ["/c", "start", "FEArchitect Bridge"]);
  assert.ok(s.args.includes("mcp/bridge.ts"));
});

test("commandLine shows what to type by hand", () => {
  assert.equal(commandLine(findTool("simulate")!), "node mcp/cli.ts simulate skirmish-01");
  assert.equal(commandLine(findTool("test")!), "node --test");
});

test("toolUrl gives server tools their page and CLI tools none", () => {
  assert.equal(toolUrl(findTool("editor")!), "http://localhost:5173/");
  assert.equal(toolUrl(findTool("play-map")!), "http://localhost:5173/src/game/index.html");
  assert.equal(toolUrl(findTool("gallery")!), "http://localhost:5174/");
  assert.equal(toolUrl(findTool("test")!), undefined);
});

test("sameServer groups tools that share a port", () => {
  assert.equal(sameServer(findTool("editor")!, findTool("scenario")!), true);
  assert.equal(sameServer(findTool("editor")!, findTool("gallery")!), false);
  assert.equal(sameServer(findTool("test")!, findTool("preview")!), false);
});
