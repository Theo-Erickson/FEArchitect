# FEArchitect MCP Server, CLI, and Local Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A validated operations layer over FEArchitect's data and its two evaluation tiers, exposed three ways over one shared `handlers.ts`: an MCP server (for Claude clients), a CLI (deterministic, no LLM), and a local bridge that drives Ollama + Qwen for natural-language edits.

**Architecture:** `mcp/handlers.ts` holds the operations as pure async functions `(projectRoot, args) => result`, importing the existing pure engine from `src/` so there is one source of combat truth. `mcp/toolspecs.ts` is a shared JSON-Schema tool manifest mapping each tool to its handler. `mcp/server.ts`, `mcp/cli.ts`, and `mcp/bridge.ts` are thin frontends over the manifest and handlers. Writes validate in memory (via the existing validators and resolvers) before touching disk.

**Tech Stack:** TypeScript run by Node 24 (no build). The `mcp/` folder declares the project's only dependency, `@modelcontextprotocol/sdk`, quarantined there. The bridge calls Ollama with `fetch` (no dependency). Node built-in test runner.

**Prose and code conventions:** No em dashes or en dashes anywhere. Use colons or commas. Comment new code well. Do NOT add Co-Authored-By or any attribution trailer to commits (project owner preference).

---

## File structure

| Path | Responsibility |
|------|----------------|
| `src/validate.ts` | Pure unit/weapon/encounter validators, extracted from datagen so MCP, CLI, bridge, and datagen share one definition. |
| `src/datagen.ts` | MODIFY: import the validators from `src/validate.ts` instead of defining them inline. |
| `mcp/handlers.ts` | The seven operations as pure async functions `(projectRoot, args) => result`. No SDK. |
| `mcp/toolspecs.ts` | Shared manifest: for each tool a name, description, JSON-Schema params, and the handler to call. No SDK. |
| `mcp/cli.ts` | Command-line frontend: parse argv, dispatch to a handler, print the result. |
| `mcp/bridge.ts` | Local bridge: an injectable Ollama chat function plus a tool-call loop over the handlers. |
| `mcp/server.ts` | MCP stdio server built on the low-level `Server` API, registering tools from the manifest. |
| `mcp/package.json` | ESM, declares `@modelcontextprotocol/sdk`. |
| `mcp/handlers.test.ts` | Direct tests for the handlers (real data for reads, a temp dir for writes). |
| `mcp/bridge.test.ts` | Bridge loop tested with a mock chat function and an unreachable-host case. |
| `.mcp.json` | Project MCP registration for Claude Code. |
| `Preview (CLI).cmd`, `Simulate.cmd`, `Bridge.cmd` | Double-click wrappers. |
| `README.md` | MODIFY: an MCP, CLI, and local-bridge section. |

Handlers import, with `.ts` extensions: `../src/validate.ts`, `../src/datagen.ts` (`loadBundle`), `../src/grid/datagen.ts` (`loadGridEncounter`), `../src/grid/resolve.ts` (`resolveGridEncounter`), `../src/grid/game.ts`, `../src/combat.ts`. Type-only imports use `import type`.

---

## Task 1: Extract shared validators into `src/validate.ts`

**Files:**
- Create: `src/validate.ts`
- Modify: `src/datagen.ts`

- [ ] **Step 1: Create `src/validate.ts` with the validators moved out of datagen**

```ts
// Pure validators for config records, shared by datagen, the MCP handlers, the
// CLI, and the bridge. No node imports. Each throws on invalid input with a
// clear message, or returns the typed value.
import type { EncounterSpec, UnitDef, WeaponDef, WeaponType } from "./types.ts";

const WEAPON_TYPES: WeaponType[] =
  ["sword", "lance", "axe", "bow", "anima", "light", "dark", "staff"];

const UNIT_NUMERIC_FIELDS: (keyof UnitDef)[] =
  ["hp", "str", "mag", "skl", "spd", "lck", "def", "res", "con"];

export function validateWeapon(id: string, w: any): WeaponDef {
  if (!w || typeof w !== "object") throw new Error(`Weapon ${id} is not an object`);
  if (typeof w.name !== "string") throw new Error(`Weapon ${id} missing name`);
  if (!WEAPON_TYPES.includes(w.type)) throw new Error(`Weapon ${id} has invalid type: ${w.type}`);
  for (const f of ["might", "hit", "crit", "weight"]) {
    if (typeof w[f] !== "number") throw new Error(`Weapon ${id} missing numeric ${f}`);
  }
  if (typeof w.rank !== "string") throw new Error(`Weapon ${id} missing rank`);
  return w as WeaponDef;
}

export function validateUnit(id: string, u: any): UnitDef {
  if (!u || typeof u !== "object") throw new Error(`Unit ${id} is not an object`);
  if (typeof u.name !== "string") throw new Error(`Unit ${id} missing name`);
  for (const f of UNIT_NUMERIC_FIELDS) {
    if (typeof u[f] !== "number") throw new Error(`Unit ${id} missing numeric ${String(f)}`);
  }
  return u as UnitDef;
}

export function validateEncounter(path: string, e: any): EncounterSpec {
  if (!e || typeof e !== "object") throw new Error(`Encounter ${path} is not an object`);
  if (typeof e.id !== "string") throw new Error(`Encounter ${path} missing id`);
  for (const side of ["player", "enemy"] as const) {
    if (!e[side] || typeof e[side].unit !== "string" || typeof e[side].weapon !== "string") {
      throw new Error(`Encounter ${path} ${side} must have string unit and weapon`);
    }
  }
  return e as EncounterSpec;
}
```

- [ ] **Step 2: Update `src/datagen.ts` to import the validators**

Remove the three functions `validateWeapon`, `validateUnit`, and `validateEncounter`
from `src/datagen.ts`, along with the now-unused `WEAPON_TYPES` and
`UNIT_NUMERIC_FIELDS` constants at the top. Add this import near the other imports:

```ts
import { validateUnit, validateWeapon, validateEncounter } from "./validate.ts";
```

Leave `readJson`, `resolveSide`, `resolveBundle` (if present), `loadBundle`, and the
`LoadPaths` interface as they are: they call the validators, which now come from the
import.

- [ ] **Step 3: Run the whole suite to prove no behavior change**

Run: `node --test`
Expected: PASS, the same count as before this task (Slice A + Slice B). If datagen
tests fail with "validateUnit is not defined", the removal in Step 2 left a caller
without the import: recheck the import line.

- [ ] **Step 4: Commit**

```bash
git add src/validate.ts src/datagen.ts
git commit -m "refactor: extract shared validators into src/validate.ts"
```

---

## Task 2: The handlers

**Files:**
- Create: `mcp/handlers.ts`
- Test: `mcp/handlers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mcp/handlers.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  list, get, previewEncounter, simulateSkirmish, setUnit, setWeapon, setEncounter,
} from "./handlers.ts";

// The repo root is the parent of this file's directory (mcp/..).
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// A throwaway copy of the project data so write tests never touch real files.
async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fea-mcp-"));
  for (const sub of ["data", "maps", "encounters"]) {
    await cp(join(ROOT, sub), join(dir, sub), { recursive: true });
  }
  return dir;
}

test("list returns ids for each kind", async () => {
  const units = await list(ROOT, "units");
  assert.ok(units.includes("eirika-t"));
  const encounters = await list(ROOT, "encounters");
  assert.ok(encounters.includes("skirmish-01"));
});

test("get returns a record", async () => {
  const u = await get(ROOT, "unit", "eirika-t");
  assert.equal(u.name, "Eirika");
});

test("previewEncounter returns deterministic and monteCarlo, stable by seed", async () => {
  const a = await previewEncounter(ROOT, "duel-01", 42, 300);
  const b = await previewEncounter(ROOT, "duel-01", 42, 300);
  assert.deepEqual(a, b);
  assert.ok("deterministic" in a && "monteCarlo" in a);
});

test("simulateSkirmish runs to a result, stable by seed", async () => {
  const a = await simulateSkirmish(ROOT, "skirmish-01", 5);
  const b = await simulateSkirmish(ROOT, "skirmish-01", 5);
  assert.deepEqual(a, b);
  assert.notEqual(a.status, "ongoing");
  assert.ok(Array.isArray(a.log));
});

test("setUnit writes a valid edit to the temp project", async () => {
  const dir = await tempProject();
  try {
    const res = await setUnit(dir, "eirika-t", { spd: 20 });
    assert.equal(res.spd, 20);
    const onDisk = JSON.parse(await readFile(join(dir, "data/units.json"), "utf8"));
    assert.equal(onDisk["eirika-t"].spd, 20);
    assert.equal(onDisk["eirika-t"].name, "Eirika"); // merge kept other fields
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setUnit rejects an invalid edit and leaves the file unchanged", async () => {
  const dir = await tempProject();
  try {
    const before = await readFile(join(dir, "data/units.json"), "utf8");
    await assert.rejects(() => setUnit(dir, "eirika-t", { spd: "fast" as any }), /numeric/i);
    const after = await readFile(join(dir, "data/units.json"), "utf8");
    assert.equal(before, after);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setEncounter validates a skirmish by resolving it", async () => {
  const dir = await tempProject();
  try {
    await assert.rejects(
      () => setEncounter(dir, "bad", {
        id: "bad", map: "showcase-terrain",
        player: { unit: "nope", weapon: "iron-sword", at: [1, 3] },
        enemy: { unit: "wyvern-1", weapon: "iron-lance", at: [9, 3] },
      }),
      /unit/i,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setWeapon writes a valid edit", async () => {
  const dir = await tempProject();
  try {
    const res = await setWeapon(dir, "iron-sword", { might: 6 });
    assert.equal(res.might, 6);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test mcp/handlers.test.ts`
Expected: FAIL, `./handlers.ts` not found.

- [ ] **Step 3: Implement `mcp/handlers.ts`**

```ts
// The FEArchitect operations, as pure async functions over a project root. Each
// frontend (MCP server, CLI, bridge) calls these. Reads and evaluation reuse the
// existing loaders and engine; writes validate in memory before touching disk.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { validateUnit, validateWeapon, validateEncounter } from "../src/validate.ts";
import { loadBundle } from "../src/datagen.ts";
import { loadGridEncounter } from "../src/grid/datagen.ts";
import { resolveGridEncounter } from "../src/grid/resolve.ts";
import { buildDeterministic, runMonteCarlo } from "../src/combat.ts";
import { createGame, takeAiTurn, endPhase, status } from "../src/grid/game.ts";
import type { Combatant } from "../src/types.ts";

const TABLE_FILES: Record<string, string> = {
  units: "data/units.json",
  weapons: "data/weapons.json",
  classes: "data/classes.json",
  terrain: "data/terrain.json",
};

async function readJson(root: string, rel: string): Promise<any> {
  return JSON.parse(await readFile(join(root, rel), "utf8"));
}
async function writeJson(root: string, rel: string, value: unknown): Promise<void> {
  await writeFile(join(root, rel), JSON.stringify(value, null, 2) + "\n", "utf8");
}
function gridPaths(root: string) {
  return {
    unitsPath: join(root, "data/units.json"),
    weaponsPath: join(root, "data/weapons.json"),
    terrainPath: join(root, "data/terrain.json"),
    classesPath: join(root, "data/classes.json"),
    mapsDir: join(root, "maps"),
  };
}

export async function list(root: string, kind: string): Promise<string[]> {
  if (kind in TABLE_FILES) return Object.keys(await readJson(root, TABLE_FILES[kind]));
  if (kind === "encounters" || kind === "maps") {
    const files = await readdir(join(root, kind));
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  }
  throw new Error(`unknown kind: ${kind}`);
}

export async function get(root: string, kind: string, id: string): Promise<any> {
  if (kind in TABLE_FILES) {
    const rec = (await readJson(root, TABLE_FILES[kind]))[id];
    if (!rec) throw new Error(`${kind} ${id} not found`);
    return rec;
  }
  const singular: Record<string, string> = { unit: "units", weapon: "weapons", class: "classes" };
  if (kind in singular) return get(root, singular[kind], id);
  if (kind === "encounter") return readJson(root, `encounters/${id}.json`);
  if (kind === "map") return readJson(root, `maps/${id}.json`);
  throw new Error(`unknown kind: ${kind}`);
}

// Resolve the two fighters of an encounter, whether it is a gridless duel or a
// grid skirmish. Returns objects usable as Combatant by the combat engine.
async function encounterSides(root: string, id: string): Promise<{ player: Combatant; enemy: Combatant }> {
  const raw = await readJson(root, `encounters/${id}.json`);
  const encPath = join(root, `encounters/${id}.json`);
  if (raw.map) {
    const enc = await loadGridEncounter(encPath, gridPaths(root));
    return { player: enc.player, enemy: enc.enemy };
  }
  const bundle = await loadBundle(encPath, {
    unitsPath: join(root, "data/units.json"),
    weaponsPath: join(root, "data/weapons.json"),
  });
  return { player: bundle.player, enemy: bundle.enemy };
}

export async function previewEncounter(root: string, id: string, seed = 42, runs = 1000) {
  const { player, enemy } = await encounterSides(root, id);
  return {
    encounterId: id,
    deterministic: buildDeterministic(player, enemy),
    monteCarlo: runMonteCarlo(player, enemy, { seed, runs }),
  };
}

export async function simulateSkirmish(root: string, id: string, seed = 1, turnCap = 50) {
  const raw = await readJson(root, `encounters/${id}.json`);
  if (!raw.map) throw new Error(`encounter ${id} is not a grid skirmish (no map)`);
  const enc = await loadGridEncounter(join(root, `encounters/${id}.json`), gridPaths(root));
  const g = createGame(enc, seed);
  while (status(g) === "ongoing" && g.turn <= turnCap) {
    takeAiTurn(g, g.phase === "player" ? g.player.id : g.enemy.id);
    endPhase(g);
  }
  return { status: status(g), turns: g.turn, log: g.log };
}

export async function setUnit(root: string, id: string, fields: Record<string, unknown>) {
  const units = await readJson(root, "data/units.json");
  const merged = { ...(units[id] ?? {}), ...fields };
  validateUnit(id, merged); // throws if invalid, leaving the file untouched
  units[id] = merged;
  await writeJson(root, "data/units.json", units);
  return merged;
}

export async function setWeapon(root: string, id: string, fields: Record<string, unknown>) {
  const weapons = await readJson(root, "data/weapons.json");
  const merged = { ...(weapons[id] ?? {}), ...fields };
  validateWeapon(id, merged);
  weapons[id] = merged;
  await writeJson(root, "data/weapons.json", weapons);
  return merged;
}

export async function setEncounter(root: string, id: string, spec: any) {
  const withId = { ...spec, id };
  if (withId.map) {
    // Validate by resolving against current data; throws on any bad reference.
    const [units, weapons, terrain, classes, map] = await Promise.all([
      readJson(root, "data/units.json"),
      readJson(root, "data/weapons.json"),
      readJson(root, "data/terrain.json"),
      readJson(root, "data/classes.json"),
      readJson(root, `maps/${withId.map}.json`),
    ]);
    resolveGridEncounter(withId, units, weapons, terrain, classes, map);
  } else {
    validateEncounter(id, withId);
    const units = await readJson(root, "data/units.json");
    const weapons = await readJson(root, "data/weapons.json");
    for (const side of ["player", "enemy"] as const) {
      if (!units[withId[side].unit]) throw new Error(`${side} references unknown unit: ${withId[side].unit}`);
      if (!weapons[withId[side].weapon]) throw new Error(`${side} references unknown weapon: ${withId[side].weapon}`);
    }
  }
  await writeJson(root, `encounters/${id}.json`, withId);
  return withId;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test mcp/handlers.test.ts`
Expected: PASS, 8 tests passed. Run from the repo root.

- [ ] **Step 5: Commit**

```bash
git add mcp/handlers.ts mcp/handlers.test.ts
git commit -m "feat: MCP handlers for read, evaluate, and validated write"
```

---

## Task 3: The shared tool manifest

**Files:**
- Create: `mcp/toolspecs.ts`
- Test: `mcp/toolspecs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mcp/toolspecs.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLSPECS, toolByName } from "./toolspecs.ts";

test("every tool has a name, description, object params, and a handler", () => {
  for (const t of TOOLSPECS) {
    assert.equal(typeof t.name, "string");
    assert.ok(t.description.length > 0, `${t.name} needs a description`);
    assert.equal(t.params.type, "object");
    assert.equal(typeof t.handler, "function");
  }
});

test("the expected tools are present", () => {
  const names = TOOLSPECS.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "get", "list", "preview_encounter", "set_encounter", "set_unit", "set_weapon", "simulate_skirmish",
  ]);
});

test("toolByName finds a tool and returns undefined for a miss", () => {
  assert.equal(toolByName("list")!.name, "list");
  assert.equal(toolByName("nope"), undefined);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test mcp/toolspecs.test.ts`
Expected: FAIL, `./toolspecs.ts` not found.

- [ ] **Step 3: Implement `mcp/toolspecs.ts`**

```ts
// One manifest of tools, shared by the MCP server and the bridge so their tool
// definitions cannot drift. Each entry carries a JSON-Schema parameter object and
// the handler to run. Handlers receive (projectRoot, args); the `call` wrapper
// pulls the handler's arguments out of the args object in the right order.
import * as h from "./handlers.ts";

export interface ToolSpec {
  name: string;
  description: string;
  params: { type: "object"; properties: Record<string, any>; required?: string[] };
  handler: (root: string, args: any) => Promise<unknown>;
}

export const TOOLSPECS: ToolSpec[] = [
  {
    name: "list",
    description: "List the ids of records of a kind: units, weapons, classes, terrain, encounters, or maps.",
    params: { type: "object", properties: { kind: { type: "string", description: "units|weapons|classes|terrain|encounters|maps" } }, required: ["kind"] },
    handler: (root, a) => h.list(root, a.kind),
  },
  {
    name: "get",
    description: "Get one record by kind and id. kind is unit, weapon, class, terrain, encounter, or map.",
    params: { type: "object", properties: { kind: { type: "string" }, id: { type: "string" } }, required: ["kind", "id"] },
    handler: (root, a) => h.get(root, a.kind, a.id),
  },
  {
    name: "preview_encounter",
    description: "Tier 1 math preview of an encounter: deterministic breakdown plus a seeded Monte Carlo. Positions are ignored.",
    params: { type: "object", properties: { id: { type: "string" }, seed: { type: "number" }, runs: { type: "number" } }, required: ["id"] },
    handler: (root, a) => h.previewEncounter(root, a.id, a.seed, a.runs),
  },
  {
    name: "simulate_skirmish",
    description: "Run a grid skirmish to a result headlessly. Returns status, turns, and the combat log. Requires an encounter with a map.",
    params: { type: "object", properties: { id: { type: "string" }, seed: { type: "number" } }, required: ["id"] },
    handler: (root, a) => h.simulateSkirmish(root, a.id, a.seed),
  },
  {
    name: "set_unit",
    description: "Create or update a unit. fields is an object of unit stats to merge (hp, str, mag, skl, spd, lck, def, res, con, name, class). Validated before writing.",
    params: { type: "object", properties: { id: { type: "string" }, fields: { type: "object" } }, required: ["id", "fields"] },
    handler: (root, a) => h.setUnit(root, a.id, a.fields),
  },
  {
    name: "set_weapon",
    description: "Create or update a weapon. fields merges weapon stats (name, type, rank, might, hit, crit, weight, range). Validated before writing.",
    params: { type: "object", properties: { id: { type: "string" }, fields: { type: "object" } }, required: ["id", "fields"] },
    handler: (root, a) => h.setWeapon(root, a.id, a.fields),
  },
  {
    name: "set_encounter",
    description: "Create or update an encounter. spec is the full encounter object (a duel, or a skirmish with a map and positions). Validated by resolving it before writing.",
    params: { type: "object", properties: { id: { type: "string" }, spec: { type: "object" } }, required: ["id", "spec"] },
    handler: (root, a) => h.setEncounter(root, a.id, a.spec),
  },
];

export function toolByName(name: string): ToolSpec | undefined {
  return TOOLSPECS.find((t) => t.name === name);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test mcp/toolspecs.test.ts`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add mcp/toolspecs.ts mcp/toolspecs.test.ts
git commit -m "feat: shared MCP tool manifest"
```

---

## Task 4: The CLI

**Files:**
- Create: `mcp/cli.ts`
- Test: `mcp/cli.test.ts`

- [ ] **Step 1: Write the failing test (for the pure arg parser)**

Create `mcp/cli.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFields } from "./cli.ts";

test("parseFields coerces numbers and keeps strings", () => {
  assert.deepEqual(parseFields(["str=12", "spd=16", "name=Eirika"]), { str: 12, spd: 16, name: "Eirika" });
});

test("parseFields handles negative numbers and leaves non-numbers as strings", () => {
  assert.deepEqual(parseFields(["def=-2", "class=cavalier"]), { def: -2, class: "cavalier" });
});

test("parseFields ignores tokens without an equals sign", () => {
  assert.deepEqual(parseFields(["str=1", "garbage"]), { str: 1 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test mcp/cli.test.ts`
Expected: FAIL, `./cli.ts` not found.

- [ ] **Step 3: Implement `mcp/cli.ts`**

```ts
// Deterministic command-line frontend over the handlers. No LLM. Run as:
//   node mcp/cli.ts <command> ...args
// Commands: list, get, preview, simulate, set-unit, set-weapon, set-encounter.
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as h from "./handlers.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// Turn key=value tokens into an object, coercing integer-looking values.
export function parseFields(tokens: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const tok of tokens) {
    const eq = tok.indexOf("=");
    if (eq < 0) continue;
    const key = tok.slice(0, eq);
    const raw = tok.slice(eq + 1);
    out[key] = /^-?\d+$/.test(raw) ? Number(raw) : raw;
  }
  return out;
}

// Read an optional --flag value out of an argv list.
function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  let result: unknown;
  switch (cmd) {
    case "list":
      result = await h.list(ROOT, rest[0]); break;
    case "get":
      result = await h.get(ROOT, rest[0], rest[1]); break;
    case "preview": {
      const seed = flag(rest, "seed"); const runs = flag(rest, "runs");
      result = await h.previewEncounter(ROOT, rest[0], seed ? Number(seed) : undefined, runs ? Number(runs) : undefined);
      break;
    }
    case "simulate": {
      const seed = flag(rest, "seed");
      result = await h.simulateSkirmish(ROOT, rest[0], seed ? Number(seed) : undefined);
      break;
    }
    case "set-unit":
      result = await h.setUnit(ROOT, rest[0], parseFields(rest.slice(1))); break;
    case "set-weapon":
      result = await h.setWeapon(ROOT, rest[0], parseFields(rest.slice(1))); break;
    case "set-encounter": {
      const file = flag(rest, "file");
      if (!file) throw new Error("set-encounter needs --file <path-to-json>");
      const spec = JSON.parse(await readFile(file, "utf8"));
      result = await h.setEncounter(ROOT, rest[0], spec);
      break;
    }
    default:
      console.log("commands: list <kind> | get <kind> <id> | preview <id> [--seed N] [--runs N] | simulate <id> [--seed N] | set-unit <id> k=v... | set-weapon <id> k=v... | set-encounter <id> --file f.json");
      process.exit(cmd ? 1 : 0);
      return;
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => { console.error("error:", (e as Error).message); process.exit(1); });
```

- [ ] **Step 4: Run to verify the parser test passes**

Run: `node --test mcp/cli.test.ts`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Exercise the CLI end to end by hand**

Run: `node --no-warnings mcp/cli.ts preview duel-01 --seed 42`
Expected: prints a JSON object with `deterministic` and `monteCarlo`.

Run: `node --no-warnings mcp/cli.ts simulate skirmish-01 --seed 5`
Expected: prints `{ status, turns, log }` with a non-ongoing status.

Run: `node --no-warnings mcp/cli.ts list units`
Expected: prints `["eirika-t","wyvern-1"]`.

- [ ] **Step 6: Commit**

```bash
git add mcp/cli.ts mcp/cli.test.ts
git commit -m "feat: deterministic CLI frontend over the handlers"
```

---

## Task 5: The local bridge (Ollama + Qwen)

**Files:**
- Create: `mcp/bridge.ts`
- Test: `mcp/bridge.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mcp/bridge.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runConversation, ollamaChat, type ChatFn } from "./bridge.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fea-bridge-"));
  for (const sub of ["data", "maps", "encounters"]) {
    await cp(join(REPO, sub), join(dir, sub), { recursive: true });
  }
  return dir;
}

test("the loop runs a requested tool call then finishes on a plain reply", async () => {
  const dir = await tempProject();
  try {
    // A scripted model: first turn asks to set a unit, second turn just replies.
    let turn = 0;
    const chat: ChatFn = async (messages) => {
      turn++;
      if (turn === 1) {
        return { role: "assistant", content: "", tool_calls: [
          { function: { name: "set_unit", arguments: { id: "eirika-t", fields: { spd: 19 } } } },
        ] };
      }
      // The tool result must have been fed back before this turn.
      const toolMsg = messages.find((m) => m.role === "tool");
      assert.ok(toolMsg, "tool result should have been appended");
      return { role: "assistant", content: "Done: Eirika speed is now 19." };
    };
    const reply = await runConversation(chat, dir, "make Eirika faster");
    assert.match(reply, /19/);
    const units = JSON.parse(await readFile(join(dir, "data/units.json"), "utf8"));
    assert.equal(units["eirika-t"].spd, 19);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a tool error is fed back to the model rather than thrown", async () => {
  const dir = await tempProject();
  try {
    let turn = 0;
    let sawError = false;
    const chat: ChatFn = async (messages) => {
      turn++;
      if (turn === 1) {
        return { role: "assistant", content: "", tool_calls: [
          { function: { name: "set_unit", arguments: { id: "eirika-t", fields: { spd: "fast" } } } },
        ] };
      }
      const toolMsg = messages.find((m) => m.role === "tool");
      if (toolMsg && /error/i.test(String(toolMsg.content))) sawError = true;
      return { role: "assistant", content: "I could not do that." };
    };
    await runConversation(chat, dir, "break it");
    assert.ok(sawError, "the tool error should be returned to the model");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ollamaChat reports a clear error when the host is unreachable", async () => {
  const prev = process.env.FEA_OLLAMA_HOST;
  process.env.FEA_OLLAMA_HOST = "http://127.0.0.1:1"; // nothing listens here
  try {
    await assert.rejects(() => ollamaChat([{ role: "user", content: "hi" }], []), /Cannot reach Ollama/);
  } finally {
    if (prev === undefined) delete process.env.FEA_OLLAMA_HOST;
    else process.env.FEA_OLLAMA_HOST = prev;
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test mcp/bridge.test.ts`
Expected: FAIL, `./bridge.ts` not found.

- [ ] **Step 3: Implement `mcp/bridge.ts`**

```ts
// Local bridge: let a local model (Ollama running Qwen) drive the FEArchitect
// tools in natural language. The chat function is injectable so the loop is
// testable without a live Ollama.
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { TOOLSPECS, toolByName } from "./toolspecs.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// Read at call time so the env can be changed per run (and per test).
function model(): string { return process.env.FEA_OLLAMA_MODEL ?? "qwen2.5"; }
function host(): string { return process.env.FEA_OLLAMA_HOST ?? "http://localhost:11434"; }

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { function: { name: string; arguments: any } }[];
}

// A chat turn: given the running transcript and the tool definitions, return the
// model's next message. The real one posts to Ollama; tests inject a fake.
export type ChatFn = (messages: ChatMessage[], tools: any[]) => Promise<ChatMessage>;

// Ollama tool format: { type: "function", function: { name, description, parameters } }.
function ollamaTools(): any[] {
  return TOOLSPECS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.params } }));
}

export const ollamaChat: ChatFn = async (messages, tools) => {
  const h = host(), m = model();
  let res: Response;
  try {
    res = await fetch(`${h}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: m, messages, tools, stream: false }),
    });
  } catch {
    throw new Error(`Cannot reach Ollama at ${h}. Is it running? Try: ollama serve`);
  }
  if (!res.ok) throw new Error(`Ollama returned ${res.status}. Is the model "${m}" pulled? Try: ollama pull ${m}`);
  const data = await res.json();
  return data.message as ChatMessage;
};

// Run one user request to completion: loop tool calls until the model replies
// with plain text, and return that text. Each tool runs against `root`.
export async function runConversation(chat: ChatFn, root: string, userText: string): Promise<string> {
  const tools = ollamaTools();
  const messages: ChatMessage[] = [
    { role: "system", content: "You edit a Fire Emblem sandbox by calling the provided tools. Prefer set_* to change data, preview_encounter and simulate_skirmish to evaluate. Report results plainly." },
    { role: "user", content: userText },
  ];
  for (let i = 0; i < 12; i++) {
    const msg = await chat(messages, tools);
    messages.push(msg);
    if (!msg.tool_calls || msg.tool_calls.length === 0) return msg.content ?? "";
    for (const call of msg.tool_calls) {
      const spec = toolByName(call.function.name);
      let content: string;
      try {
        if (!spec) throw new Error(`unknown tool: ${call.function.name}`);
        const args = typeof call.function.arguments === "string" ? JSON.parse(call.function.arguments) : call.function.arguments;
        content = JSON.stringify(await spec.handler(root, args));
      } catch (e) {
        content = `error: ${(e as Error).message}`;
      }
      messages.push({ role: "tool", content });
    }
  }
  return "Stopped after too many tool calls without a final answer.";
}

// Interactive entry point: read lines from the terminal and run each through the
// loop against the real Ollama. Only runs when executed directly.
async function main(): Promise<void> {
  console.log(`FEArchitect bridge. Model ${model()} at ${host()}. Type a request, or "exit".`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const line = (await rl.question("> ")).trim();
    if (!line || line === "exit") break;
    try {
      console.log(await runConversation(ollamaChat, ROOT, line));
    } catch (e) {
      console.error((e as Error).message);
    }
  }
  rl.close();
}

if (process.argv[1]?.endsWith("bridge.ts")) main();
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test mcp/bridge.test.ts`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add mcp/bridge.ts mcp/bridge.test.ts
git commit -m "feat: local Ollama bridge with a tested tool-call loop"
```

---

## Task 6: The MCP server, package, and registration

**Files:**
- Create: `mcp/package.json`
- Create: `mcp/server.ts`
- Create: `.mcp.json`

- [ ] **Step 1: Create `mcp/package.json`**

```json
{
  "name": "fearchitect-mcp",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "description": "MCP server exposing FEArchitect data and evaluation tiers.",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

- [ ] **Step 2: Install the dependency**

Run: `cd mcp && npm install && cd ..`
Expected: creates `mcp/node_modules` and `mcp/package-lock.json`. If this machine
has no network access, this step (and Steps 4 to 6) are deferred: the owner runs
`npm install` in `mcp/` once on their machine. The handlers, CLI, and bridge do
not need this install; only the MCP server does.

- [ ] **Step 3: Implement `mcp/server.ts`**

Uses the low-level `Server` API so tools are declared with the shared JSON-Schema
manifest directly (no zod). Import specifiers below are the standard ones for
`@modelcontextprotocol/sdk`; if the installed version exposes them differently,
adjust the three import lines to match that version's `server/index.js`,
`server/stdio.js`, and `types.js` exports.

```ts
// MCP stdio server. Registers the shared tool manifest and dispatches calls to
// the handlers. Run by Claude Code via .mcp.json.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { TOOLSPECS, toolByName } from "./toolspecs.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const server = new Server(
  { name: "fearchitect", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLSPECS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.params })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const spec = toolByName(req.params.name);
  if (!spec) {
    return { content: [{ type: "text", text: `unknown tool: ${req.params.name}` }], isError: true };
  }
  try {
    const result = await spec.handler(ROOT, req.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `error: ${(e as Error).message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
```

- [ ] **Step 4: Create `.mcp.json` at the repo root**

```json
{
  "mcpServers": {
    "fearchitect": {
      "command": "node",
      "args": ["--no-warnings", "mcp/server.ts"]
    }
  }
}
```

- [ ] **Step 5: Verify the server speaks MCP over stdio**

This sends an initialize request then a tools/list request and checks our tools
come back. Run from the repo root:

```bash
printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node --no-warnings mcp/server.ts | tr ',' '\n' | grep -E '"name":"(list|get|preview_encounter|simulate_skirmish|set_unit|set_weapon|set_encounter)"'
```

Expected: lines showing the seven tool names. If `node` errors on the SDK import,
re-check the import specifiers against the installed SDK version (Step 3 note). If
`npm install` was deferred, skip this step and note it for the owner.

- [ ] **Step 6: Commit**

```bash
git add mcp/package.json mcp/server.ts .mcp.json mcp/package-lock.json
git commit -m "feat: MCP stdio server and project registration"
```

If `npm install` was deferred (no network), commit without the lock file:
`git add mcp/package.json mcp/server.ts .mcp.json && git commit -m "feat: MCP stdio server and project registration"`.

---

## Task 7: Launchers, gitignore, README, and final verification

**Files:**
- Create: `Preview (CLI).cmd`, `Simulate.cmd`, `Bridge.cmd`
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Create the three `.cmd` wrappers**

`Preview (CLI).cmd`:

```bat
@echo off
rem Double-click to print the Tier 1 math preview for the baseline duel.
cd /d "%~dp0"
node --no-warnings mcp\cli.ts preview duel-01
echo.
pause
```

`Simulate.cmd`:

```bat
@echo off
rem Double-click to run the baseline grid skirmish headlessly and print the log.
cd /d "%~dp0"
node --no-warnings mcp\cli.ts simulate skirmish-01
echo.
pause
```

`Bridge.cmd`:

```bat
@echo off
rem Double-click to chat with a local model (Ollama + Qwen) that edits FEArchitect.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings mcp\bridge.ts
pause
```

- [ ] **Step 2: Ignore the mcp dependency folder**

Add these lines to `.gitignore`:

```
# MCP server dependencies (installed with: cd mcp && npm install)
mcp/node_modules/
```

- [ ] **Step 3: Add the README section**

Add after the existing sections in `README.md`:

```markdown
## MCP server, CLI, and local bridge

FEArchitect has a shared operations layer (`mcp/handlers.ts`) exposed three ways.

### CLI (no AI, always available)

Run commands directly, for example:

    node mcp/cli.ts list units
    node mcp/cli.ts preview duel-01 --seed 42
    node mcp/cli.ts simulate skirmish-01 --seed 5
    node mcp/cli.ts set-unit eirika-t str=12 spd=16

Or double-click `Preview (CLI).cmd` and `Simulate.cmd`.

### MCP server (for Claude)

One-time: `cd mcp && npm install`. The repo's `.mcp.json` registers the server,
so running Claude Code in this folder makes the tools available after you approve
the server once. Then you can ask in natural language to read, edit, preview, and
simulate.

### Local bridge (natural language with a local model, no cloud)

One-time: install Ollama (ollama.com) and run `ollama pull qwen2.5`. Then
double-click `Bridge.cmd` (or `node mcp/bridge.ts`) and type requests like
"raise Eirika's speed to 17 and simulate the skirmish". Set `FEA_OLLAMA_MODEL` or
`FEA_OLLAMA_HOST` to use a different model or endpoint.
```

- [ ] **Step 4: Final verification**

Run: `node --test`
Expected: PASS, the full suite: Slice A, Slice B, and the new MCP handler,
toolspecs, CLI, and bridge tests.

Run: `node --no-warnings mcp/cli.ts simulate skirmish-01 --seed 5`
Expected: a JSON result with a non-ongoing status and a populated log.

- [ ] **Step 5: Commit**

```bash
git add "Preview (CLI).cmd" Simulate.cmd Bridge.cmd .gitignore README.md
git commit -m "feat: CLI and bridge launchers, readme, gitignore for mcp deps"
```

---

## Self-review notes (for the implementer)

- The handlers, toolspecs, CLI, and bridge have no third-party dependency and are
  fully testable with `node --test` before any `npm install`. Only `mcp/server.ts`
  needs the SDK. Build and verify in that order so a missing network only blocks the
  server verification, not the rest.
- Keep `import type` for type-only imports in every `mcp/` file so nothing tries to
  load a types-only module at runtime.
- The bridge's `runConversation` is the unit the tests target; the interactive
  `main` and `ollamaChat` are thin and exercised by the owner against real Ollama.
- If the installed `@modelcontextprotocol/sdk` version changes the import
  specifiers or the low-level `Server` API, fix `mcp/server.ts` only; the manifest
  and handlers are independent of the SDK.
