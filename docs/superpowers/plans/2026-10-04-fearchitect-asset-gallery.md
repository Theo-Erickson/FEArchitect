# FEArchitect FE8 Asset Reference Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local, read-only gallery of GBA Fire Emblem canon (FE6/FE7/FE8 units, classes, items, portraits, and battle-animation GIFs), imported from clean ROMs via `FEBuilderGBA.CLI`, kept separate from the sim's data.

**Architecture:** An import runner (`tools/assetgen/`) shells out to the CLI to export data and portraits per present game and normalizes the raw hex-string JSON into clean records under `assets/reference/<game>/`. A small separate Node standard-library server (`gallery/`) serves those statically and lazily generates+caches animation GIFs on demand. No npm dependencies; Node 24 runs the TypeScript directly.

**Tech Stack:** TypeScript on Node 24 (no build, no deps), Node stdlib `child_process`/`http`/`fs`, Node built-in test runner. External tool: `FEBuilderGBA.CLI` already at `tools/febuilder-cli/`.

**Prose and code conventions:** No em dashes or en dashes anywhere. Use colons or commas. Comment new code well. Do NOT add Co-Authored-By or any attribution trailer to commits (project owner preference).

**Verified facts (from brainstorming, against the real FE8 ROM):**
- CLI at `tools/febuilder-cli/FEBuilderGBA.CLI.exe`, ROM at `base/FE8_Clean.gba`.
- `--export-data --table=units|classes|items --format=json --out=<file>` writes one JSON file. Rows have hex-string fields, e.g. `"BaseHP":"0x00"`; the `Index` field is `"0x00 Eirika"` (hex id + name). Units 255, classes 128, items 206.
- `--export-portrait-all --out=<dir>` writes `portrait_NNN.png` (1-based, zero-padded 3); a unit's `PortraitID` is that index. Some entries fail to render (tool prints "render returned null") and are simply absent; exit code stays 0.
- `--export-battle-anime --animation-id=<id> --gif --section=<0-11> --out=<file.gif>` writes an animated GIF.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `tools/assetgen/paths.ts` | GAMES list, resolve CLI path, per-game ROM paths, reference dirs, and which games have a ROM. Pure given an `exists` predicate. |
| `tools/assetgen/paths.test.ts` | Tests for path resolution and game detection. |
| `tools/assetgen/normalize.ts` | Pure normalization: parse hex strings to ints, split `Index` into id+name, keep `*Pointer` fields raw. |
| `tools/assetgen/normalize.test.ts` | Tests for the normalizer. |
| `tools/assetgen/import.ts` | Runner: for each present game, export data+portraits via the CLI, normalize, write `assets/reference/<game>/`. |
| `gallery/galleryutil.ts` | Pure helpers: static path allow-list, anim cache path, anim CLI arg list, input validation. |
| `gallery/galleryutil.test.ts` | Tests for the helpers. |
| `gallery/server.ts` | Node stdlib server: serve the page and `assets/reference/`, plus the lazy `/anim` and `/games` endpoints. |
| `gallery/index.html` | Gallery page: game selector + four tabs. |
| `gallery/client.ts` | Browser side: fetch reference JSON, render tabs, request anim GIFs. |
| `Import Assets.cmd`, `Gallery.cmd` | Double-click launchers. |
| `.gitignore` | MODIFY: add `assets/reference/`. |
| `README.md` | MODIFY: asset gallery section. |

---

## Task 1: Paths and game detection

**Files:**
- Create: `tools/assetgen/paths.ts`
- Test: `tools/assetgen/paths.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tools/assetgen/paths.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { GAMES, cliPath, romPath, gameDir, presentGames } from "./paths.ts";

const ROOT = "/project";

test("GAMES lists the three GBA titles", () => {
  assert.deepEqual([...GAMES], ["fe6", "fe7", "fe8"]);
});

test("romPath uses the expected filenames", () => {
  assert.equal(romPath(ROOT, "fe8").replace(/\\/g, "/"), "/project/base/FE8_Clean.gba");
  assert.equal(romPath(ROOT, "fe6").replace(/\\/g, "/"), "/project/base/FE6_clean.gba");
});

test("gameDir and cliPath resolve under the project", () => {
  assert.equal(gameDir(ROOT, "fe7").replace(/\\/g, "/"), "/project/assets/reference/fe7");
  assert.ok(cliPath(ROOT).replace(/\\/g, "/").endsWith("tools/febuilder-cli/FEBuilderGBA.CLI.exe"));
});

test("presentGames returns only games whose ROM exists", () => {
  const onlyFe8 = (p: string) => p.replace(/\\/g, "/") === "/project/base/FE8_Clean.gba";
  assert.deepEqual(presentGames(ROOT, onlyFe8), ["fe8"]);
  assert.deepEqual(presentGames(ROOT, () => true), ["fe6", "fe7", "fe8"]);
  assert.deepEqual(presentGames(ROOT, () => false), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/assetgen/paths.test.ts`
Expected: FAIL, `./paths.ts` not found.

- [ ] **Step 3: Implement `tools/assetgen/paths.ts`**

```ts
// Resolve the external tool and per-game ROM/reference paths from the project
// root, with environment overrides. Game detection takes an injectable `exists`
// predicate so it can be tested without touching the filesystem.
import { join } from "node:path";
import { existsSync } from "node:fs";

export const GAMES = ["fe6", "fe7", "fe8"] as const;
export type Game = (typeof GAMES)[number];

const ROM_FILE: Record<Game, string> = {
  fe6: "FE6_clean.gba",
  fe7: "FE7_clean.gba",
  fe8: "FE8_Clean.gba",
};
const ROM_ENV: Record<Game, string> = {
  fe6: "FEA_FE6_ROM",
  fe7: "FEA_FE7_ROM",
  fe8: "FEA_FE8_ROM",
};

export function cliPath(root: string): string {
  return process.env.FEA_FEBUILDER_CLI ?? join(root, "tools/febuilder-cli/FEBuilderGBA.CLI.exe");
}

export function romPath(root: string, game: Game): string {
  return process.env[ROM_ENV[game]] ?? join(root, "base", ROM_FILE[game]);
}

export function referenceDir(root: string): string {
  return join(root, "assets/reference");
}

export function gameDir(root: string, game: Game): string {
  return join(referenceDir(root), game);
}

// Which games have a ROM available. `exists` defaults to a real filesystem check.
export function presentGames(root: string, exists: (p: string) => boolean = existsSync): Game[] {
  return GAMES.filter((g) => exists(romPath(root, g)));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/assetgen/paths.test.ts`
Expected: PASS, 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add tools/assetgen/paths.ts tools/assetgen/paths.test.ts
git commit -m "feat: asset import path resolution and game detection"
```

---

## Task 2: The normalizer

**Files:**
- Create: `tools/assetgen/normalize.ts`
- Test: `tools/assetgen/normalize.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tools/assetgen/normalize.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHex, normalizeRow, normalizeTable } from "./normalize.ts";

test("parseHex parses hex strings", () => {
  assert.equal(parseHex("0x46"), 70);
  assert.equal(parseHex("0x00"), 0);
});

test("normalizeRow splits Index into id and name and parses hex fields", () => {
  const row = normalizeRow({ Index: "0x00 Eirika", BaseLck: "0x05", BaseHP: "0x00" });
  assert.equal(row.id, 0);
  assert.equal(row.name, "Eirika");
  assert.equal(row.BaseLck, 5);
  assert.equal(row.BaseHP, 0);
});

test("normalizeRow keeps pointer fields as raw hex strings", () => {
  const row = normalizeRow({ Index: "0x02 Lord", BattleAnimePointer: "0x00abcdef", BaseMov: "0x05" });
  assert.equal(row.id, 2);
  assert.equal(row.name, "Lord");
  assert.equal(row.BattleAnimePointer, "0x00abcdef"); // kept as string
  assert.equal(row.BaseMov, 5);
});

test("normalizeRow handles an Index with no name and leaves non-hex strings", () => {
  const row = normalizeRow({ Index: "0x10", Note: "hello" });
  assert.equal(row.id, 16);
  assert.equal(row.name, "");
  assert.equal(row.Note, "hello");
});

test("normalizeTable maps rows and accepts object-or-array raw export", () => {
  assert.deepEqual(
    normalizeTable([{ Index: "0x01 Iron Sword", Might: "0x05" }]),
    [{ id: 1, name: "Iron Sword", Might: 5 }],
  );
  // object keyed export (values are the rows)
  assert.equal(normalizeTable({ a: { Index: "0x01 X", Hit: "0x5A" } } as any)[0].Hit, 90);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/assetgen/normalize.test.ts`
Expected: FAIL, `./normalize.ts` not found.

- [ ] **Step 3: Implement `tools/assetgen/normalize.ts`**

```ts
// Normalize the CLI's raw export rows into clean records: parse hex-string
// numbers to integers, split the `Index` field ("0x00 Eirika") into id and name,
// and keep `*Pointer` fields as their raw hex string (the gallery does not follow
// them). One generic pass handles units, classes, and items.

const HEX = /^0x[0-9a-fA-F]+$/;

export function parseHex(v: string): number {
  return parseInt(v, 16);
}

export function normalizeRow(raw: Record<string, string>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "Index") {
      const sp = value.indexOf(" ");
      const hex = sp < 0 ? value : value.slice(0, sp);
      out.id = parseInt(hex, 16);
      out.name = sp < 0 ? "" : value.slice(sp + 1).trim();
      continue;
    }
    if (typeof value === "string" && HEX.test(value)) {
      out[key] = key.endsWith("Pointer") ? value : parseHex(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Accepts the raw export as an array of rows or an object whose values are rows.
export function normalizeTable(raw: Record<string, string>[] | Record<string, Record<string, string>>): Record<string, any>[] {
  const rows = Array.isArray(raw) ? raw : Object.values(raw);
  return rows.map(normalizeRow);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/assetgen/normalize.test.ts`
Expected: PASS, 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add tools/assetgen/normalize.ts tools/assetgen/normalize.test.ts
git commit -m "feat: generic hex-to-int export normalizer"
```

---

## Task 3: The import runner

**Files:**
- Create: `tools/assetgen/import.ts`

No unit test: this file orchestrates the external CLI and the filesystem. It is
verified by running it against the real FE8 ROM in Step 3.

- [ ] **Step 1: Implement `tools/assetgen/import.ts`**

```ts
// Import runner: for each game whose clean ROM is present, export the data tables
// and all portraits via FEBuilderGBA.CLI, normalize the data, and write everything
// under assets/reference/<game>/. Run directly: node tools/assetgen/import.ts
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, type Game, cliPath, romPath, gameDir, presentGames } from "./paths.ts";
import { normalizeTable } from "./normalize.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const TABLES = ["units", "classes", "items"] as const;

// Run the CLI. Data exports must exit 0. The portrait export can exit nonzero
// when some individual portraits fail to render ("render returned null") while
// still producing most PNGs, so the portrait caller passes tolerateNonzero and
// separately confirms that output was produced.
function runCli(args: string[], tolerateNonzero = false): void {
  const cli = cliPath(ROOT);
  const res = spawnSync(cli, args, { encoding: "utf8" });
  if (res.error) throw new Error(`Failed to run ${cli}: ${res.error.message}`);
  if (!tolerateNonzero && res.status !== 0) {
    throw new Error(`CLI exited ${res.status}: ${(res.stderr || res.stdout || "").trim()}`);
  }
}

async function importGame(game: Game): Promise<void> {
  const gdir = gameDir(ROOT, game);
  const rom = romPath(ROOT, game);
  const portraitsDir = join(gdir, "portraits");
  await mkdir(portraitsDir, { recursive: true });

  for (const table of TABLES) {
    const rawPath = join(gdir, `.raw-${table}.json`);
    runCli([`--rom=${rom}`, "--export-data", `--table=${table}`, "--format=json", `--out=${rawPath}`]);
    const raw = JSON.parse(await readFile(rawPath, "utf8"));
    await writeFile(join(gdir, `${table}.json`), JSON.stringify(normalizeTable(raw), null, 2) + "\n", "utf8");
    await rm(rawPath, { force: true });
    console.log(`  ${game}: ${table} imported`);
  }

  // Portraits: tolerate a nonzero exit from partial render failures, then
  // confirm at least one PNG was produced.
  runCli([`--rom=${rom}`, "--export-portrait-all", `--out=${portraitsDir}`], true);
  const pngs = (await readdir(portraitsDir)).filter((f) => f.endsWith(".png"));
  if (pngs.length === 0) throw new Error(`${game}: no portraits were exported`);
  console.log(`  ${game}: portraits imported (${pngs.length})`);
}

async function main(): Promise<void> {
  const cli = cliPath(ROOT);
  if (!existsSync(cli)) {
    throw new Error(`FEBuilderGBA.CLI not found at ${cli}. See the README "asset gallery" section to install it.`);
  }
  const games = presentGames(ROOT);
  if (games.length === 0) {
    throw new Error(`No clean ROM found in base/ (expected one of: ${GAMES.map((g) => romPath(ROOT, g)).join(", ")}).`);
  }
  console.log(`Importing: ${games.join(", ")}`);
  for (const game of games) await importGame(game);
  console.log("Done. Open the gallery with Gallery.cmd.");
}

main().catch((e) => { console.error("import error:", (e as Error).message); process.exit(1); });
```

- [ ] **Step 2: Add `assets/reference/` to `.gitignore`**

Append to `.gitignore`:

```
# Imported FE asset reference (derived from copyrighted ROMs, not committed)
assets/reference/
```

- [ ] **Step 3: Run the import against the real FE8 ROM**

Run: `node --no-warnings tools/assetgen/import.ts`
Expected: prints `Importing: fe8`, then `fe8: units imported` ... `fe8: portraits imported`, then `Done.`. Confirm the outputs:

Run: `node -e "const u=require('./assets/reference/fe8/units.json'); console.log('units', u.length, u[0].name, 'lck', u[0].BaseLck)"`
Expected: `units 255 Eirika lck 5`.

Run: `ls assets/reference/fe8/portraits | head -3`
Expected: `portrait_001.png` and friends.

- [ ] **Step 4: Commit**

```bash
git add tools/assetgen/import.ts .gitignore
git commit -m "feat: FE asset import runner (data + portraits per game)"
```

---

## Task 4: Gallery pure helpers

**Files:**
- Create: `gallery/galleryutil.ts`
- Test: `gallery/galleryutil.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `gallery/galleryutil.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { staticAllowed, animCacheRel, animArgs, validAnimRequest } from "./galleryutil.ts";

test("staticAllowed permits gallery and reference, rejects traversal", () => {
  assert.equal(staticAllowed("gallery/index.html"), true);
  assert.equal(staticAllowed("assets/reference/fe8/units.json"), true);
  assert.equal(staticAllowed("assets/reference/fe8/portraits/portrait_002.png"), true);
  assert.equal(staticAllowed("../secret"), false);
  assert.equal(staticAllowed("src/combat.ts"), false);
});

test("animCacheRel is stable and game/id/section scoped", () => {
  assert.equal(animCacheRel("fe8", 12, 0), "assets/reference/fe8/anims/12_0.gif");
  assert.equal(animCacheRel("fe7", 3, 2), "assets/reference/fe7/anims/3_2.gif");
});

test("animArgs builds the CLI argument list", () => {
  assert.deepEqual(
    animArgs("/base/FE8.gba", 5, 1, "/out/5_1.gif"),
    ["--rom=/base/FE8.gba", "--export-battle-anime", "--animation-id=5", "--gif", "--section=1", "--out=/out/5_1.gif"],
  );
});

test("validAnimRequest checks game, id, section ranges", () => {
  assert.equal(validAnimRequest("fe8", 0, 0), true);
  assert.equal(validAnimRequest("fe8", 400, 11), true);
  assert.equal(validAnimRequest("xx", 1, 0), false);
  assert.equal(validAnimRequest("fe8", -1, 0), false);
  assert.equal(validAnimRequest("fe8", 1, 12), false);
  assert.equal(validAnimRequest("fe8", 1.5, 0), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test gallery/galleryutil.test.ts`
Expected: FAIL, `./galleryutil.ts` not found.

- [ ] **Step 3: Implement `gallery/galleryutil.ts`**

```ts
// Pure helpers for the gallery server: static path allow-listing, the animation
// cache path, the CLI argument list for an animation export, and request validation.
import { normalize } from "node:path";

export const GAMES = ["fe6", "fe7", "fe8"] as const;

export function staticAllowed(p: string): boolean {
  if (p.includes("..")) return false;
  const n = normalize(p).replace(/\\/g, "/");
  return n.startsWith("gallery/") || n.startsWith("assets/reference/");
}

export function animCacheRel(game: string, id: number, section: number): string {
  return `assets/reference/${game}/anims/${id}_${section}.gif`;
}

export function animArgs(rom: string, id: number, section: number, out: string): string[] {
  return [`--rom=${rom}`, "--export-battle-anime", `--animation-id=${id}`, "--gif", `--section=${section}`, `--out=${out}`];
}

export function validAnimRequest(game: string, id: number, section: number): boolean {
  if (!(GAMES as readonly string[]).includes(game)) return false;
  if (!Number.isInteger(id) || id < 0) return false;
  if (!Number.isInteger(section) || section < 0 || section > 11) return false;
  return true;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test gallery/galleryutil.test.ts`
Expected: PASS, 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add gallery/galleryutil.ts gallery/galleryutil.test.ts
git commit -m "feat: gallery pure helpers (paths, anim args, validation)"
```

---

## Task 5: The gallery server

**Files:**
- Create: `gallery/server.ts`

No unit test beyond the Task 4 helpers (the server is thin I/O glue); it is
verified live in Step 2.

- [ ] **Step 1: Implement `gallery/server.ts`**

```ts
// Gallery server: serve the page and the imported reference assets, list which
// games were imported, and lazily export+cache battle-animation GIFs on demand.
// Node standard library only. Run directly: node gallery/server.ts [/path]
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
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
  const ext = extname(abs);
  try {
    // Browsers cannot run TypeScript, so strip the types when serving a .ts
    // module to the browser (same approach as the sim server).
    if (ext === ".ts") {
      const src = await readFile(abs, "utf8");
      res.writeHead(200, { "content-type": CONTENT_TYPES[".ts"], "cache-control": "no-store" });
      res.end(stripTypeScriptTypes(src, { mode: "strip" }));
      return;
    }
    const body = await readFile(abs);
    res.writeHead(200, { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream", "cache-control": "no-store" });
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
```

- [ ] **Step 2: Verify the server serves data and lists games**

Start it in the background and probe (requires Task 3 import to have run):

```bash
node --no-warnings gallery/server.ts & sleep 1.5
curl -s http://localhost:5174/games
curl -s -o /dev/null -w "units.json: %{http_code}\n" http://localhost:5174/assets/reference/fe8/units.json
curl -s -o /dev/null -w "anim: %{http_code}\n" "http://localhost:5174/anim?game=fe8&id=0&section=0"
```

Expected: `/games` prints `["fe8"]`, units.json returns 200, anim returns 200 (first call runs the CLI, ~1s). Stop the server afterward (find the listener on port 5174 and kill it).

- [ ] **Step 3: Commit**

```bash
git add gallery/server.ts
git commit -m "feat: gallery server with static serving and lazy anim export"
```

---

## Task 6: The gallery page and client

**Files:**
- Create: `gallery/index.html`
- Create: `gallery/client.ts`

- [ ] **Step 1: Create `gallery/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FEArchitect: Asset Gallery</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; padding: 1rem; }
    h1 { font-size: 1.1rem; margin: 0 0 0.5rem; }
    .bar { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.75rem; }
    .tabs button { padding: 0.3rem 0.7rem; margin-right: 0.25rem; }
    .tabs button.active { font-weight: 700; }
    #search { padding: 0.3rem; width: 14rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.5rem; }
    .card { border: 1px solid #8888; border-radius: 6px; padding: 0.4rem; font-size: 0.8rem; }
    .card img { width: 96px; height: 80px; image-rendering: pixelated; display: block; background: #0001; }
    table { border-collapse: collapse; font-size: 0.8rem; }
    th, td { border: 1px solid #8884; padding: 2px 6px; text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    .anim { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
    .anim img { image-rendering: pixelated; border: 1px solid #8888; min-width: 64px; min-height: 64px; }
    .note { font-size: 0.85rem; opacity: 0.85; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <h1>FEArchitect asset gallery</h1>
  <div class="bar">
    <label>Game <select id="game"></select></label>
    <span class="tabs" id="tabs">
      <button data-tab="units" class="active">Units</button>
      <button data-tab="classes">Classes</button>
      <button data-tab="items">Items</button>
      <button data-tab="anims">Animations</button>
    </span>
    <input id="search" placeholder="search by name" />
  </div>
  <div id="empty" class="note" hidden>No imported data. Run <strong>Import Assets.cmd</strong> first.</div>
  <div id="view"></div>
  <script type="module" src="/gallery/client.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Implement `gallery/client.ts`**

```ts
// Gallery browser client: pick a game, browse Units/Classes/Items as tables or
// cards, and play battle animations (fetched lazily from the server).
type Row = Record<string, any>;

let game = "";
let tab: "units" | "classes" | "items" | "anims" = "units";
const cache: Record<string, Row[]> = {}; // key `${game}/${table}`

const $ = (id: string) => document.getElementById(id)!;
const view = $("view");
const search = $("search") as HTMLInputElement;

async function boot(): Promise<void> {
  const games: string[] = await fetch("/games").then((r) => r.json());
  const sel = $("game") as HTMLSelectElement;
  if (games.length === 0) { $("empty").hidden = false; return; }
  for (const g of games) { const o = document.createElement("option"); o.value = g; o.textContent = g.toUpperCase(); sel.appendChild(o); }
  game = games[0];
  sel.addEventListener("change", () => { game = sel.value; render(); });
  for (const b of document.querySelectorAll<HTMLButtonElement>("#tabs button")) {
    b.addEventListener("click", () => {
      tab = b.dataset.tab as typeof tab;
      for (const x of document.querySelectorAll("#tabs button")) x.classList.toggle("active", x === b);
      render();
    });
  }
  search.addEventListener("input", render);
  render();
}

async function table(name: string): Promise<Row[]> {
  const key = `${game}/${name}`;
  if (!cache[key]) cache[key] = await fetch(`/assets/reference/${game}/${name}.json`).then((r) => r.json());
  return cache[key];
}

function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

async function render(): Promise<void> {
  if (!game) return;
  if (tab === "anims") return renderAnims();
  const rows = await table(tab);
  const q = search.value.trim().toLowerCase();
  const shown = q ? rows.filter((r) => String(r.name ?? "").toLowerCase().includes(q)) : rows;
  view.innerHTML = tab === "units" ? unitCards(shown) : recordTable(shown);
}

function portraitSrc(id: number): string {
  return `/assets/reference/${game}/portraits/portrait_${String(id).padStart(3, "0")}.png`;
}

function unitCards(rows: Row[]): string {
  return `<div class="grid">` + rows.map((u) =>
    `<div class="card">
      <img src="${portraitSrc(u.PortraitID ?? 0)}" alt="" onerror="this.style.visibility='hidden'">
      <div><strong>${esc(u.name)}</strong> <span class="note">#${u.id}</span></div>
      <div>class ${u.ClassID ?? "?"} lvl ${u.Level ?? "?"}</div>
      <div>HP ${u.BaseHP} Pow ${u.BasePow} Skl ${u.BaseSkl} Spd ${u.BaseSpd}</div>
      <div>Def ${u.BaseDef} Res ${u.BaseRes} Lck ${u.BaseLck} Con ${u.BaseCon}</div>
    </div>`).join("") + `</div>`;
}

// A generic table of the most useful columns for classes/items, name first.
function recordTable(rows: Row[]): string {
  if (rows.length === 0) return `<p class="note">nothing to show</p>`;
  const skip = new Set(["name"]);
  const cols = Object.keys(rows[0]).filter((k) => k !== "id" && !skip.has(k) && !k.endsWith("Pointer") && !k.endsWith("TextID")).slice(0, 12);
  const head = `<tr><th>name</th><th>id</th>` + cols.map((c) => `<th>${esc(c)}</th>`).join("") + `</tr>`;
  const body = rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.id}</td>` + cols.map((c) => `<td>${esc(r[c])}</td>`).join("") + `</tr>`).join("");
  return `<table>${head}${body}</table>`;
}

function renderAnims(): void {
  view.innerHTML = `
    <div class="anim">
      <label>Animation id <input id="aid" type="number" value="0" min="0" style="width:6rem"></label>
      <label>Section <select id="asec">${Array.from({ length: 12 }, (_, i) => `<option value="${i}">${i}</option>`).join("")}</select></label>
      <button id="aplay">Play</button>
      <span id="astatus" class="note"></span>
    </div>
    <div style="margin-top:0.75rem"><img id="agif" alt=""></div>`;
  const play = () => {
    const id = Number(($("aid") as HTMLInputElement).value);
    const sec = Number(($("asec") as HTMLSelectElement).value);
    const img = $("agif") as HTMLImageElement;
    $("astatus").textContent = "exporting...";
    img.onload = () => { $("astatus").textContent = `id ${id} section ${sec}`; };
    img.onerror = () => { $("astatus").textContent = "export failed for that id/section"; img.removeAttribute("src"); };
    img.src = `/anim?game=${game}&id=${id}&section=${sec}&_=${Date.now()}`;
  };
  $("aplay").addEventListener("click", play);
}

boot();
```

- [ ] **Step 3: Manual verification in the browser**

Run: `node --no-warnings gallery/server.ts`
In the browser that opens, confirm:
- The game selector shows FE8 (and FE6/FE7 only if their ROMs were imported).
- Units tab shows a grid of portraits with names and stats; typing in search filters by name.
- Classes and Items tabs show tables.
- Animations tab: enter id 0, click Play, the GIF appears after ~1s; try a few ids and sections.
Stop the server by closing its window.

- [ ] **Step 4: Commit**

```bash
git add gallery/index.html gallery/client.ts
git commit -m "feat: gallery page and client (units/classes/items/animations)"
```

---

## Task 7: Launchers, README, final verification

**Files:**
- Create: `Import Assets.cmd`, `Gallery.cmd`
- Modify: `README.md`

- [ ] **Step 1: Create `Import Assets.cmd`**

```bat
@echo off
rem Double-click to import FE asset data and portraits from your clean ROM(s).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings tools\assetgen\import.ts
echo.
pause
```

- [ ] **Step 2: Create `Gallery.cmd`**

```bat
@echo off
rem Double-click to open the FE asset gallery in your browser.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings gallery\server.ts
pause
```

- [ ] **Step 3: Add the README section**

Add after the existing sections in `README.md`:

```markdown
## FE asset gallery

Browse the GBA Fire Emblem canon (units, classes, items, portraits, battle
animations) imported from your clean ROMs.

One-time setup:
- Install the `FEBuilderGBA.CLI` (laqieer fork release, the `cli-win-x64` asset)
  into `tools/febuilder-cli/`.
- Place clean ROMs in `base/`: `FE8_Clean.gba`, and optionally `FE6_clean.gba`
  and `FE7_clean.gba`. These and the imported assets are gitignored.

Then:
- Double-click **Import Assets.cmd** to import every game whose ROM is present.
- Double-click **Gallery.cmd** to open the gallery. Pick a game, browse the tabs,
  and on the Animations tab enter an animation id and press Play (the GIF is
  generated on first view and cached).
```

- [ ] **Step 4: Final verification**

Run: `node --test`
Expected: PASS, the full suite including the new `paths`, `normalize`, and
`galleryutil` tests, and all prior sim/editor/MCP tests unchanged.

Then double-click `Import Assets.cmd` and `Gallery.cmd` from Explorer to confirm
the double-click path works outside a terminal.

- [ ] **Step 5: Commit**

```bash
git add "Import Assets.cmd" Gallery.cmd README.md
git commit -m "feat: asset gallery launchers and readme"
```

---

## Self-review notes (for the implementer)

- `tools/assetgen/` and `gallery/` are standalone: they import nothing from `src/`
  and add no npm dependency. Node 24 runs their `.ts` directly.
- The only external dependency is `FEBuilderGBA.CLI`; every file degrades with a
  clear message when it or a ROM is absent, so the suite's pure tests pass with no
  tool present. The import and live-serve checks (Tasks 3, 5, 6) need the CLI + the
  FE8 ROM, both present in this environment.
- FE6/FE7 use identical commands; they are exercised only when their ROMs are
  placed. If a game needs an explicit `--force-version`, add it in `import.ts`'s
  `runCli` data calls and the server's `animArgs` call; auto-detection is the
  default.
- Use `import type` for type-only imports in browser-loaded modules (the client
  here has none, but keep the rule if you add shared types).
```
