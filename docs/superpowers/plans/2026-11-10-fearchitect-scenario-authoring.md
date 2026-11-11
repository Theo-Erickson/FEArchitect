# FEArchitect MCP Scenario Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the MCP create and edit authored units and multi-unit scenarios on custom or FE8 chapter maps, see the map as text, simulate balance, and have the scenario viewer list and live-reload scenarios.

**Architecture:** Pure modules hold the logic (`src/grid/scenariosrc.ts` for file rules, normalizing, and the index; `src/grid/scenariocheck.ts` for placement validation; `mcp/describe.ts` for text views). A Node store (`mcp/store.ts`) reads and atomically writes project files. Thin MCP handlers (`mcp/handlers.ts`, new `mcp/scenariohandlers.ts`) and the browser viewer (`src/game/scenario.ts`) sit on top. Spec: `docs/superpowers/specs/2026-11-10-fearchitect-scenario-authoring-design.md`.

**Tech Stack:** Node 24 with native TypeScript type stripping (no build), `node:test` + `node:assert/strict`, the MCP SDK already in `mcp/node_modules`. No new dependency.

---

## Conventions (read first)

- No em dashes or en dashes anywhere: code, comments, docs, commit messages. Use colons or commas.
- Commit messages: no `Co-Authored-By` or any attribution trailer.
- Code is TypeScript run directly by Node's type stripping: no `enum`, no parameter properties, no namespaces. Imports use the `.ts` suffix.
- Run one test file: `node --no-warnings --test <path>`. Run everything: `node --no-warnings --test` from the repo root.
- `assets/reference/` is gitignored (derived from the ROM). Anything reading FE8 data must work when it is absent: FE8 classes fall back to `{}`, and FE8-only tests skip.
- Coordinates are `[x, y]`, x to the right, y down, zero based.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/grid/scenariosrc.ts` | Create | Pure: which files a scenario needs, normalize a scenario before writing (ids, `terrain`), scenario index for listings. |
| `src/grid/scenariosrc.test.ts` | Create | Tests for the above. |
| `src/grid/testkit.ts` | Create | Tiny in-memory fixtures (terrain, map, classes, units, weapons) and a `tiny()` resolver for pure tests. Not a test file itself. |
| `src/grid/resolve.ts` | Modify | `buildUnit` uses the placement `id` when present. |
| `src/grid/resolve.test.ts` | Modify | Test for placement ids. |
| `src/grid/scenariocheck.ts` | Create | Pure placement checker returning problems. |
| `src/grid/scenariocheck.test.ts` | Create | Tests for the checker. |
| `mcp/describe.ts` | Create | Pure ASCII map and scenario views. |
| `mcp/describe.test.ts` | Create | Tests for the views. |
| `mcp/store.ts` | Create | Node file IO: read JSON, atomic write, classes merge, resolve scenario and map from disk, read a scenario file. |
| `mcp/store.test.ts` | Create | Tests for the store. |
| `mcp/handlers.ts` | Modify | Use the store; authored `setUnit`; new `list` and `get` kinds. |
| `mcp/handlers.test.ts` | Modify | Updated and new tests; temp project copies FE8 reference data when present. |
| `mcp/scenariohandlers.ts` | Create | `setScenario`, `placeUnit`, `removeUnit`, `describeScenarioById`, `describeMapById`, `simulateScenario`. |
| `mcp/scenariohandlers.test.ts` | Create | Tests for the scenario handlers. |
| `mcp/testproject.ts` | Create | Shared `tempProject()` helper for MCP tests. Not a test file itself. |
| `mcp/toolspecs.ts` | Modify | Register the new tools, update descriptions. |
| `mcp/toolspecs.test.ts` | Modify | Expected tool list. |
| `src/server.ts` | Modify | `GET /api/scenarios`. |
| `src/game/scenario.ts` | Modify | Dropdown from the API, `?s=`, polling reload, problems banner, `scenarioSources`. |
| `src/game/scenario.html` | Modify | Empty select, banner and notice elements, styles. |

---

### Task 1: Scenario file rules (`src/grid/scenariosrc.ts`)

**Files:**
- Create: `src/grid/scenariosrc.ts`
- Test: `src/grid/scenariosrc.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/grid/scenariosrc.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { scenarioSources, normalizeScenario, scenarioIndex, isFe8Map, CLASS_PATHS } from "./scenariosrc.ts";

test("scenarioSources: a custom map reads data/terrain.json and maps/<id>.json", () => {
  assert.deepEqual(scenarioSources({ map: "showcase-terrain" }), {
    fe8: false, terrainPath: "data/terrain.json", mapPath: "maps/showcase-terrain.json",
  });
});

test("scenarioSources: an fe8- map reads the FE8 terrain and chapter grid", () => {
  const want = { fe8: true, terrainPath: "assets/reference/fe8/terrain.json", mapPath: "assets/reference/fe8/terrain/12.json" };
  assert.deepEqual(scenarioSources({ map: "fe8-12" }), want);
  assert.deepEqual(scenarioSources({ map: "fe8-12", terrain: "fe8" }), want);
});

test("scenarioSources: terrain fe8 with a bare chapter number still works", () => {
  assert.equal(scenarioSources({ map: "3", terrain: "fe8" }).mapPath, "assets/reference/fe8/terrain/3.json");
});

test("scenarioSources rejects a missing map", () => {
  assert.throws(() => scenarioSources({}), /map/);
});

test("isFe8Map and CLASS_PATHS", () => {
  assert.equal(isFe8Map("fe8-1"), true);
  assert.equal(isFe8Map("forest-hills"), false);
  assert.deepEqual(CLASS_PATHS, { fe8: "assets/reference/fe8/sim-classes.json", custom: "data/classes.json" });
});

test("normalizeScenario sets id, fe8 terrain, and assigns stable placement ids", () => {
  const out = normalizeScenario("ch", {
    id: "ignored", map: "fe8-2",
    units: [
      { unit: "soldier", weapon: "iron-lance", side: "enemy", at: [1, 1] },
      { id: "soldier", unit: "seth", weapon: "iron-lance", side: "player", at: [0, 0] },
      { unit: "soldier", weapon: "iron-lance", side: "enemy", at: [2, 1] },
    ],
  });
  assert.equal(out.id, "ch");
  assert.equal(out.terrain, "fe8");
  // The explicit id "soldier" is reserved first, so generated ids skip it.
  assert.deepEqual(out.units.map((u: any) => u.id), ["soldier-2", "soldier", "soldier-3"]);
});

test("normalizeScenario keeps custom maps without a terrain field and does not mutate input", () => {
  const spec = { map: "showcase-terrain", units: [{ unit: "seth", weapon: "iron-lance", side: "player", at: [0, 0] }] };
  const out = normalizeScenario("s", spec);
  assert.equal(out.terrain, undefined);
  assert.equal(out.units[0].id, "seth");
  assert.equal((spec.units[0] as any).id, undefined);
});

test("normalizeScenario rejects a spec without a units list", () => {
  assert.throws(() => normalizeScenario("s", { map: "x" }), /units list/);
});

test("scenarioIndex lists only multi-unit scenarios, sorted by id", () => {
  const idx = scenarioIndex([
    { file: "zeta.json", json: { map: "m", units: [], notes: "last" } },
    { file: "duel-01.json", json: { player: {}, enemy: {} } },
    { file: "alpha.json", json: { map: "fe8-1", units: [] } },
    { file: "alpha.json.tmp", json: { units: [] } },
  ]);
  assert.deepEqual(idx, [
    { id: "alpha", map: "fe8-1", notes: "" },
    { id: "zeta", map: "m", notes: "last" },
  ]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --no-warnings --test src/grid/scenariosrc.test.ts`
Expected: FAIL, cannot find module `./scenariosrc.ts`.

- [ ] **Step 3: Implement**

Create `src/grid/scenariosrc.ts`:

```ts
// Pure helpers for scenario files, shared by the MCP handlers, the dev server, and the
// browser viewer: which data files a scenario needs, normalizing a scenario before it
// is written, and the scenario index used for listings. No node imports.

export interface ScenarioSources {
  fe8: boolean;
  terrainPath: string; // relative to the project root
  mapPath: string;     // relative to the project root
}

export interface ScenarioListing {
  id: string;
  map: string;
  notes: string;
}

// Classes are always the FE8 sim classes (optional, ROM derived) with the custom
// classes layered on top.
export const CLASS_PATHS = {
  fe8: "assets/reference/fe8/sim-classes.json",
  custom: "data/classes.json",
};

const FE8_PREFIX = /^fe8-/;

export function isFe8Map(mapId: string): boolean {
  return FE8_PREFIX.test(mapId);
}

export function scenarioSources(enc: { map?: unknown; terrain?: unknown }): ScenarioSources {
  if (typeof enc?.map !== "string" || enc.map === "") throw new Error(`Scenario needs a string map`);
  const fe8 = enc.terrain === "fe8" || isFe8Map(enc.map);
  if (fe8) {
    const chapter = enc.map.replace(FE8_PREFIX, "");
    return { fe8, terrainPath: "assets/reference/fe8/terrain.json", mapPath: `assets/reference/fe8/terrain/${chapter}.json` };
  }
  return { fe8, terrainPath: "data/terrain.json", mapPath: `maps/${enc.map}.json` };
}

// Prepare a scenario for writing: force its id, mark FE8 chapter maps, and give every
// placement a stable id. Explicit ids are reserved first; a missing id becomes the
// unit key, or the key plus -2, -3, and so on when taken. Returns a new object.
export function normalizeScenario(id: string, spec: any): any {
  if (!spec || typeof spec !== "object") throw new Error(`Scenario ${id} must be an object`);
  if (!Array.isArray(spec.units)) throw new Error(`Scenario ${id} needs a units list`);
  const out: any = { ...spec, id };
  if (typeof out.map === "string" && isFe8Map(out.map)) out.terrain = "fe8";
  const taken = new Set<string>();
  for (const p of spec.units) if (typeof p?.id === "string") taken.add(p.id);
  out.units = spec.units.map((p: any) => {
    if (typeof p?.id === "string") return { ...p };
    const base = String(p?.unit);
    let candidate = base;
    let n = 2;
    while (taken.has(candidate)) candidate = `${base}-${n++}`;
    taken.add(candidate);
    return { id: candidate, ...p };
  });
  return out;
}

// Build the scenario listing from encounter files: only files whose JSON has a units
// list count as multi-unit scenarios.
export function scenarioIndex(files: { file: string; json: any }[]): ScenarioListing[] {
  return files
    .filter((f) => f.file.endsWith(".json") && Array.isArray(f.json?.units))
    .map((f) => ({ id: f.file.replace(/\.json$/, ""), map: String(f.json.map ?? ""), notes: String(f.json.notes ?? "") }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --no-warnings --test src/grid/scenariosrc.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/grid/scenariosrc.ts src/grid/scenariosrc.test.ts
git commit -m "feat: scenario file rules, normalizing, and index"
```

---

### Task 2: Placement ids in resolve, and a shared pure test kit

**Files:**
- Create: `src/grid/testkit.ts`
- Modify: `src/grid/resolve.ts` (the `return` line at the end of `buildUnit`)
- Test: `src/grid/resolve.test.ts` (append)

- [ ] **Step 1: Create the test kit**

Create `src/grid/testkit.ts` (not a test file, so the runner does not execute it directly):

```ts
// Tiny in-memory fixtures for pure grid tests: a 4x2 map with plains, a forest, and a
// wall, two classes, two flat units, and two weapons. tiny(units) resolves a scenario.
import { resolveScenario } from "./resolve.ts";
import type { ResolvedScenario } from "./types.ts";

export const TK_TERRAIN: any = {
  plains: { name: "Plains", avoid: 0, def: 0, res: 0, heal: 0, moveCost: { foot: 1, cav: 1, fly: 1 } },
  forest: { name: "Forest", avoid: 20, def: 1, res: 0, heal: 0, moveCost: { foot: 2, cav: 3, fly: 1 } },
  wall: { name: "Wall", avoid: 0, def: 0, res: 0, heal: 0, moveCost: { foot: null, cav: null, fly: null } },
};

// Row 0: plains, plains, forest, wall. Row 1: all plains.
export const TK_MAP: any = { id: "tiny", legend: { ".": "plains", f: "forest", "#": "wall" }, tiles: ["..f#", "...."] };

export const TK_CLASSES: any = {
  infantry: { name: "Infantry", movementType: "foot", move: 5 },
  knight: { name: "Knight", movementType: "foot", move: 4, weaponRanks: { lance: "C" } },
};

export const TK_UNITS: any = {
  hero: { name: "Hero", class: "infantry", hp: 20, str: 6, mag: 0, skl: 7, spd: 8, lck: 5, def: 4, res: 2, con: 7 },
  grunt: { name: "Grunt", class: "knight", hp: 18, str: 5, mag: 0, skl: 3, spd: 2, lck: 0, def: 7, res: 0, con: 12 },
};

export const TK_WEAPONS: any = {
  "iron-sword": { name: "Iron Sword", type: "sword", rank: "E", might: 5, hit: 90, crit: 0, weight: 5 },
  "iron-lance": { name: "Iron Lance", type: "lance", rank: "E", might: 7, hit: 80, crit: 0, weight: 8 },
};

export function tiny(units: any[]): ResolvedScenario {
  return resolveScenario({ id: "t", map: "tiny", units }, TK_UNITS, TK_WEAPONS, TK_TERRAIN, TK_CLASSES, TK_MAP);
}
```

- [ ] **Step 2: Write the failing test**

Append to `src/grid/resolve.test.ts`:

```ts
import { tiny } from "./testkit.ts";

test("resolveScenario uses the placement id, falling back to the unit key", () => {
  const sc = tiny([
    { id: "grunt-a", unit: "grunt", weapon: "iron-lance", side: "enemy", at: [0, 1] },
    { id: "grunt-b", unit: "grunt", weapon: "iron-lance", side: "enemy", at: [1, 1] },
    { unit: "hero", weapon: "iron-sword", side: "player", at: [0, 0] },
  ]);
  assert.deepEqual(sc.units.map((u) => u.id), ["grunt-a", "grunt-b", "hero"]);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --no-warnings --test src/grid/resolve.test.ts`
Expected: FAIL on the new test, ids are `["grunt", "grunt", "hero"]`.

- [ ] **Step 4: Implement**

In `src/grid/resolve.ts`, in `buildUnit`, change the final return from:

```ts
  return { id: ref.unit, side, unit, weapon: weapon as WeaponDef, cls, ai, pos: { x: ref.at[0], y: ref.at[1] }, hp: unit.hp, level: rawUnit.level, skills, portrait: rawUnit.portrait };
```

to:

```ts
  const id = typeof ref.id === "string" ? ref.id : ref.unit;
  return { id, side, unit, weapon: weapon as WeaponDef, cls, ai, pos: { x: ref.at[0], y: ref.at[1] }, hp: unit.hp, level: rawUnit.level, skills, portrait: rawUnit.portrait };
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --no-warnings --test src/grid/resolve.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/grid/testkit.ts src/grid/resolve.ts src/grid/resolve.test.ts
git commit -m "feat: placement ids in scenario resolve; tiny grid test kit"
```

---

### Task 3: Placement checker (`src/grid/scenariocheck.ts`)

**Files:**
- Create: `src/grid/scenariocheck.ts`
- Test: `src/grid/scenariocheck.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/grid/scenariocheck.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScenario, errorsOf } from "./scenariocheck.ts";
import { tiny } from "./testkit.ts";

const hero = (at: number[], extra: any = {}) => ({ unit: "hero", weapon: "iron-sword", side: "player", at, ...extra });
const grunt = (at: number[], extra: any = {}) => ({ unit: "grunt", weapon: "iron-lance", side: "enemy", at, ...extra });

test("a clean scenario has no problems", () => {
  assert.deepEqual(checkScenario(tiny([hero([0, 0]), grunt([1, 1])])), []);
});

test("off the map is an error", () => {
  const p = checkScenario(tiny([hero([4, 0]), grunt([1, 1])]));
  assert.deepEqual(p, [{ level: "error", unitId: "hero", message: "hero at [4,0] is off the 4x2 map" }]);
});

test("an impassable tile for the unit's movement type is an error", () => {
  const p = checkScenario(tiny([hero([3, 0]), grunt([1, 1])]));
  assert.deepEqual(p, [{ level: "error", unitId: "hero", message: "hero at [3,0] is on Wall, impassable for foot units" }]);
});

test("two units on one tile is an error naming both", () => {
  const p = checkScenario(tiny([hero([1, 1]), grunt([1, 1])]));
  assert.deepEqual(p, [{ level: "error", message: "2 units on [1,1]: hero, grunt" }]);
});

test("duplicate placement ids are an error", () => {
  const p = checkScenario(tiny([hero([0, 0]), grunt([1, 1], { id: "hero" })]));
  assert.deepEqual(errorsOf(p).map((x) => x.message), ["2 placements share the id hero"]);
});

test("a side with no units is an error", () => {
  const p = checkScenario(tiny([hero([0, 0])]));
  assert.deepEqual(p, [{ level: "error", message: "the enemy side has no units" }]);
});

test("a weapon outside the class's weapon ranks is a warning, not an error", () => {
  const p = checkScenario(tiny([hero([0, 0]), grunt([1, 1], { weapon: "iron-sword" })]));
  assert.deepEqual(p, [{
    level: "warning", unitId: "grunt",
    message: "grunt's Iron Sword (sword) is not in Knight's weapon ranks (lance)",
  }]);
  assert.deepEqual(errorsOf(p), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --no-warnings --test src/grid/scenariocheck.test.ts`
Expected: FAIL, cannot find module `./scenariocheck.ts`.

- [ ] **Step 3: Implement**

Create `src/grid/scenariocheck.ts`:

```ts
// Pure placement checks for a resolved scenario. Errors block an MCP write; warnings
// are shown but allowed. Unknown references are caught earlier by resolveScenario.
import type { ResolvedScenario } from "./types.ts";

export interface Problem {
  level: "error" | "warning";
  unitId?: string;
  message: string;
}

export function errorsOf(problems: Problem[]): Problem[] {
  return problems.filter((p) => p.level === "error");
}

export function checkScenario(sc: ResolvedScenario): Problem[] {
  const out: Problem[] = [];
  const { width, height } = sc.map;

  const idCounts = new Map<string, number>();
  for (const u of sc.units) idCounts.set(u.id, (idCounts.get(u.id) ?? 0) + 1);
  for (const [id, n] of idCounts) {
    if (n > 1) out.push({ level: "error", unitId: id, message: `${n} placements share the id ${id}` });
  }

  const onTile = new Map<string, string[]>();
  for (const u of sc.units) {
    const { x, y } = u.pos;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      out.push({ level: "error", unitId: u.id, message: `${u.id} at [${x},${y}] is off the ${width}x${height} map` });
      continue;
    }
    const terrainId = sc.map.terrain[y][x];
    const def = sc.terrainDefs[terrainId];
    const mt = u.cls.movementType;
    if (def?.moveCost?.[mt] == null) {
      out.push({ level: "error", unitId: u.id, message: `${u.id} at [${x},${y}] is on ${def?.name ?? terrainId}, impassable for ${mt} units` });
    }
    const key = `${x},${y}`;
    onTile.set(key, [...(onTile.get(key) ?? []), u.id]);
    const ranks = u.cls.weaponRanks;
    if (ranks && !(u.weapon.type in ranks)) {
      out.push({
        level: "warning", unitId: u.id,
        message: `${u.id}'s ${u.weapon.name} (${u.weapon.type}) is not in ${u.cls.name}'s weapon ranks (${Object.keys(ranks).join(", ")})`,
      });
    }
  }
  for (const [key, ids] of onTile) {
    if (ids.length > 1) out.push({ level: "error", message: `${ids.length} units on [${key}]: ${ids.join(", ")}` });
  }

  for (const side of ["player", "enemy"] as const) {
    if (!sc.units.some((u) => u.side === side)) out.push({ level: "error", message: `the ${side} side has no units` });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --no-warnings --test src/grid/scenariocheck.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/grid/scenariocheck.ts src/grid/scenariocheck.test.ts
git commit -m "feat: scenario placement checker"
```

---

### Task 4: Text views of maps and scenarios (`mcp/describe.ts`)

**Files:**
- Create: `mcp/describe.ts`
- Test: `mcp/describe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mcp/describe.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeMap, describeScenario } from "./describe.ts";
import { tiny, TK_TERRAIN } from "../src/grid/testkit.ts";
import { checkScenario } from "../src/grid/scenariocheck.ts";

test("describeMap draws the grid with rulers and a legend ordered by frequency", () => {
  const sc = tiny([{ unit: "hero", weapon: "iron-sword", side: "player", at: [0, 0] }]);
  const d = describeMap(sc.map, TK_TERRAIN);
  assert.equal(d.width, 4);
  assert.equal(d.height, 2);
  assert.equal(d.text, [
    "map tiny: 4x2 (x right, y down)",
    "   0123",
    " 0 ..,:",
    " 1 ....",
    "",
    "legend (move cost foot/cav/fly, - = impassable):",
    ". Plains [plains] def 0 avoid 0 move 1/1/1",
    ", Forest [forest] def 1 avoid 20 move 2/3/1",
    ": Wall [wall] def 0 avoid 0 move -/-/-",
  ].join("\n"));
});

test("describeMap adds a tens ruler for maps wider than 10", () => {
  const map = { id: "wide", width: 12, height: 1, terrain: [Array(12).fill("plains")] };
  const lines = describeMap(map, TK_TERRAIN).text.split("\n");
  assert.equal(lines[1], "             11");
  assert.equal(lines[2], "   012345678901");
});

test("describeScenario overlays units and lists them with problems", () => {
  const sc = tiny([
    { unit: "hero", weapon: "iron-sword", side: "player", at: [0, 0] },
    { unit: "grunt", weapon: "iron-sword", side: "enemy", at: [1, 1] },
  ]);
  const d = describeScenario(sc, checkScenario(sc));
  const lines = d.text.split("\n");
  assert.equal(lines[0], "scenario t on tiny: 4x2 (x right, y down)");
  assert.equal(lines[2], " 0 A.,:");
  assert.equal(lines[3], " 1 .a..");
  assert.ok(lines.includes("A hero (player) Hero, Infantry L-, at [0,0], HP 20 Str 6 Mag 0 Skl 7 Spd 8 Lck 5 Def 4 Res 2 Con 7, Iron Sword, ai aggressive"));
  assert.ok(lines.includes("warning: grunt's Iron Sword (sword) is not in Knight's weapon ranks (lance)"));
  assert.deepEqual(d.units.map((u) => [u.mark, u.id, u.side]), [["A", "hero", "player"], ["a", "grunt", "enemy"]]);
  assert.equal(d.problems.length, 1);
});

test("describeScenario says problems: none when clean, and @ marks a shared tile", () => {
  const clean = tiny([
    { unit: "hero", weapon: "iron-sword", side: "player", at: [0, 0] },
    { unit: "grunt", weapon: "iron-lance", side: "enemy", at: [1, 1] },
  ]);
  assert.ok(describeScenario(clean, []).text.endsWith("problems: none"));
  const shared = tiny([
    { unit: "hero", weapon: "iron-sword", side: "player", at: [1, 1] },
    { unit: "grunt", weapon: "iron-lance", side: "enemy", at: [1, 1] },
  ]);
  assert.equal(describeScenario(shared, checkScenario(shared)).text.split("\n")[3], " 1 .@..");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --no-warnings --test mcp/describe.test.ts`
Expected: FAIL, cannot find module `./describe.ts`.

- [ ] **Step 3: Implement**

Create `mcp/describe.ts`:

```ts
// Pure text views so the MCP can see a map and a scenario: an ASCII grid with
// coordinate rulers, a terrain legend, units overlaid with letter markers, a unit
// table, and the checker's problems. Deterministic for testing.
import type { ResolvedMap, ResolvedScenario, TerrainDef } from "../src/grid/types.ts";
import type { Problem } from "../src/grid/scenariocheck.ts";

const TERRAIN_SYMBOLS = ".,:;~^#%&*+=-_!?/|<>()[]{}$`'";
const PLAYER_MARKS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ENEMY_MARKS = "abcdefghijklmnopqrstuvwxyz0123456789";
const OVERFLOW = "@";

export interface MapDescription { id: string; width: number; height: number; text: string; }
export interface UnitRow {
  mark: string; id: string; side: string; name: string; className: string; level: number | null;
  at: [number, number]; stats: Record<string, number>; weapon: string; ai: string;
}
export interface ScenarioDescription { id: string; text: string; units: UnitRow[]; problems: Problem[]; }

// Most common terrain gets ".", ties broken by terrain id.
function terrainSymbols(map: ResolvedMap): Map<string, string> {
  const count = new Map<string, number>();
  for (const row of map.terrain) for (const t of row) count.set(t, (count.get(t) ?? 0) + 1);
  const order = [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)! || a.localeCompare(b));
  if (order.length > TERRAIN_SYMBOLS.length) {
    throw new Error(`map ${map.id} has ${order.length} terrain types, more than ${TERRAIN_SYMBOLS.length} can be drawn`);
  }
  return new Map(order.map((t, i) => [t, TERRAIN_SYMBOLS[i]]));
}

function gridLines(map: ResolvedMap, cell: (x: number, y: number) => string): string[] {
  const pad = "   ";
  const xs = Array.from({ length: map.width }, (_, x) => x);
  const lines: string[] = [];
  if (map.width > 10) lines.push(pad + xs.map((x) => (x >= 10 ? String(Math.floor(x / 10) % 10) : " ")).join(""));
  lines.push(pad + xs.map((x) => String(x % 10)).join(""));
  for (let y = 0; y < map.height; y++) lines.push(String(y).padStart(2, " ") + " " + xs.map((x) => cell(x, y)).join(""));
  return lines;
}

function cost(c: number | null | undefined): string {
  return c == null ? "-" : String(c);
}

function legendLines(sym: Map<string, string>, defs: Record<string, TerrainDef>): string[] {
  const lines = ["legend (move cost foot/cav/fly, - = impassable):"];
  for (const [tid, s] of sym) {
    const d: any = defs[tid] ?? {};
    const heal = d.heal ? ` heal ${d.heal}` : "";
    lines.push(`${s} ${d.name ?? tid} [${tid}] def ${d.def ?? 0} avoid ${d.avoid ?? 0}${heal} move ${cost(d.moveCost?.foot)}/${cost(d.moveCost?.cav)}/${cost(d.moveCost?.fly)}`);
  }
  return lines;
}

export function describeMap(map: ResolvedMap, defs: Record<string, TerrainDef>): MapDescription {
  const sym = terrainSymbols(map);
  const lines = [
    `map ${map.id}: ${map.width}x${map.height} (x right, y down)`,
    ...gridLines(map, (x, y) => sym.get(map.terrain[y][x])!),
    "",
    ...legendLines(sym, defs),
  ];
  return { id: map.id, width: map.width, height: map.height, text: lines.join("\n") };
}

export function describeScenario(sc: ResolvedScenario, problems: Problem[]): ScenarioDescription {
  const { map } = sc;
  const sym = terrainSymbols(map);
  let pi = 0;
  let ei = 0;
  const units: UnitRow[] = sc.units.map((u) => {
    const mark = u.side === "player" ? (PLAYER_MARKS[pi++] ?? OVERFLOW) : (ENEMY_MARKS[ei++] ?? OVERFLOW);
    const s: any = u.unit;
    return {
      mark, id: u.id, side: u.side, name: u.unit.name, className: u.cls.name, level: u.level ?? null,
      at: [u.pos.x, u.pos.y],
      stats: { hp: s.hp, str: s.str, mag: s.mag, skl: s.skl, spd: s.spd, lck: s.lck, def: s.def, res: s.res, con: s.con },
      weapon: u.weapon.name, ai: u.ai,
    };
  });
  const byTile = new Map<string, string>();
  for (const r of units) {
    const key = `${r.at[0]},${r.at[1]}`;
    byTile.set(key, byTile.has(key) ? OVERFLOW : r.mark);
  }
  const statText = (st: Record<string, number>) =>
    `HP ${st.hp} Str ${st.str} Mag ${st.mag} Skl ${st.skl} Spd ${st.spd} Lck ${st.lck} Def ${st.def} Res ${st.res} Con ${st.con}`;
  const lines = [
    `scenario ${sc.id} on ${map.id}: ${map.width}x${map.height} (x right, y down)`,
    ...gridLines(map, (x, y) => byTile.get(`${x},${y}`) ?? sym.get(map.terrain[y][x])!),
    "",
    ...legendLines(sym, sc.terrainDefs),
    "",
    "units:",
    ...units.map((r) =>
      `${r.mark} ${r.id} (${r.side}) ${r.name}, ${r.className} L${r.level ?? "-"}, at [${r.at[0]},${r.at[1]}], ${statText(r.stats)}, ${r.weapon}, ai ${r.ai}`),
    "",
    ...(problems.length ? ["problems:", ...problems.map((p) => `${p.level}: ${p.message}`)] : ["problems: none"]),
  ];
  return { id: sc.id, text: lines.join("\n"), units, problems };
}
```

Note: the `" 1 .a.."` assertion relies on `grunt` at `[1,1]`; `lines[1]` is the single ones ruler because the tiny map is 4 wide.

- [ ] **Step 4: Run to verify it passes**

Run: `node --no-warnings --test mcp/describe.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add mcp/describe.ts mcp/describe.test.ts
git commit -m "feat: ASCII map and scenario views for the MCP"
```

---

### Task 5: Node project store (`mcp/store.ts`) and shared temp project helper

**Files:**
- Create: `mcp/store.ts`
- Create: `mcp/testproject.ts`
- Test: `mcp/store.test.ts`

- [ ] **Step 1: Create the shared temp project helper**

Create `mcp/testproject.ts`:

```ts
// Shared helper for MCP tests: a throwaway copy of the project data so write tests
// never touch real files. FE8 reference data is copied when present (it is
// gitignored and derived from the ROM), so FE8 tests can skip cleanly without it.
import { mkdtemp, cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
export const HAS_FE8 = existsSync(join(ROOT, "assets/reference/fe8/terrain/1.json"));

const FE8_FILES = ["terrain.json", "terrain", "sim-classes.json", "maps.json"];

export async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fea-mcp-"));
  for (const sub of ["data", "maps", "encounters"]) {
    await cp(join(ROOT, sub), join(dir, sub), { recursive: true });
  }
  if (HAS_FE8) {
    await mkdir(join(dir, "assets/reference/fe8"), { recursive: true });
    for (const f of FE8_FILES) {
      const from = join(ROOT, "assets/reference/fe8", f);
      if (existsSync(from)) await cp(from, join(dir, "assets/reference/fe8", f), { recursive: true });
    }
  }
  return dir;
}
```

- [ ] **Step 2: Write the failing test**

Create `mcp/store.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  readJson, readJsonOpt, writeJsonAtomic, loadClassesAll, resolveScenarioOnDisk, resolveMapOnDisk, readScenario,
} from "./store.ts";
import { ROOT, HAS_FE8, tempProject } from "./testproject.ts";

test("readJsonOpt returns the fallback only for a missing file", async () => {
  assert.deepEqual(await readJsonOpt(ROOT, "data/nope.json", { a: 1 }), { a: 1 });
  assert.equal((await readJsonOpt(ROOT, "data/units.json", {}))["eirika-t"].name, "Eirika");
});

test("writeJsonAtomic writes formatted JSON and leaves no temp file", async () => {
  const dir = await tempProject();
  try {
    await writeJsonAtomic(dir, "encounters/new.json", { id: "new" });
    assert.equal(await readFile(join(dir, "encounters/new.json"), "utf8"), '{\n  "id": "new"\n}\n');
    assert.ok(!(await readdir(join(dir, "encounters"))).some((f) => f.endsWith(".tmp")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadClassesAll layers custom classes over FE8 sim classes", async () => {
  const classes = await loadClassesAll(ROOT);
  assert.equal(classes.paladin.move, 8); // custom data/classes.json wins
  if (HAS_FE8) assert.ok(classes["great-lord"]);
});

test("resolveScenarioOnDisk resolves scenario-01 from the repo", async () => {
  const sc = await resolveScenarioOnDisk(ROOT, await readJson(ROOT, "encounters/scenario-01.json"));
  assert.equal(sc.units.length, 4);
  assert.equal(sc.map.id, "showcase-terrain");
});

test("resolveMapOnDisk resolves a custom map and reports a missing one by name", async () => {
  const { map } = await resolveMapOnDisk(ROOT, "showcase-terrain");
  assert.equal(map.width, 11);
  await assert.rejects(() => resolveMapOnDisk(ROOT, "no-such-map"), /unknown map: maps\/no-such-map\.json/);
});

test("resolveMapOnDisk reads an FE8 chapter grid", { skip: !HAS_FE8 }, async () => {
  const { map } = await resolveMapOnDisk(ROOT, "fe8-1");
  assert.equal(map.width, 15);
  assert.equal(map.height, 10);
});

test("readScenario rejects missing files and 1v1 encounters", async () => {
  assert.equal((await readScenario(ROOT, "scenario-01")).map, "showcase-terrain");
  await assert.rejects(() => readScenario(ROOT, "nope"), /scenario nope not found/);
  await assert.rejects(() => readScenario(ROOT, "duel-01"), /not a multi-unit scenario/);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --no-warnings --test mcp/store.test.ts`
Expected: FAIL, cannot find module `./store.ts`.

- [ ] **Step 4: Implement**

Create `mcp/store.ts`:

```ts
// Node file IO for the MCP handlers: JSON reads, atomic writes (so the polling viewer
// never reads a half-written file), the merged class table, and resolving scenarios
// and maps from disk using the shared scenarioSources rules.
import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { scenarioSources, CLASS_PATHS, type ScenarioSources } from "../src/grid/scenariosrc.ts";
import { resolveScenario, resolveMap, validateTerrainDefs } from "../src/grid/resolve.ts";
import type { ResolvedScenario, ResolvedMap, TerrainDef } from "../src/grid/types.ts";

export async function readJson(root: string, rel: string): Promise<any> {
  return JSON.parse(await readFile(join(root, rel), "utf8"));
}

export async function readJsonOpt(root: string, rel: string, fallback: any): Promise<any> {
  try {
    return await readJson(root, rel);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

export async function writeJsonAtomic(root: string, rel: string, value: unknown): Promise<void> {
  const target = join(root, rel);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, target);
}

export async function loadClassesAll(root: string): Promise<Record<string, any>> {
  const fe8 = await readJsonOpt(root, CLASS_PATHS.fe8, {});
  const custom = await readJson(root, CLASS_PATHS.custom);
  return { ...fe8, ...custom };
}

// Read a terrain or map file named by scenarioSources, with a clear message when it
// is missing: FE8 data needs the Generate Maps import, custom maps need the file.
async function readSource(root: string, rel: string, src: ScenarioSources): Promise<any> {
  try {
    return await readJson(root, rel);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    if (src.fe8) throw new Error(`FE8 data ${rel} not found: run Generate Maps to import FE8 chapters`);
    throw new Error(`unknown map: ${rel}`);
  }
}

export async function resolveScenarioOnDisk(root: string, enc: any): Promise<ResolvedScenario> {
  const src = scenarioSources(enc);
  const [units, weapons, classes, skills, terrain, map] = await Promise.all([
    readJson(root, "data/units.json"),
    readJson(root, "data/weapons.json"),
    loadClassesAll(root),
    readJsonOpt(root, "data/skills.json", {}),
    readSource(root, src.terrainPath, src),
    readSource(root, src.mapPath, src),
  ]);
  return resolveScenario(enc, units, weapons, terrain, classes, map, skills);
}

export async function resolveMapOnDisk(root: string, mapId: string): Promise<{ map: ResolvedMap; terrainDefs: Record<string, TerrainDef> }> {
  const src = scenarioSources({ map: mapId });
  const terrainDefs = validateTerrainDefs(await readSource(root, src.terrainPath, src));
  const map = resolveMap(await readSource(root, src.mapPath, src), terrainDefs);
  return { map, terrainDefs };
}

// Read a multi-unit scenario file as stored (placements may lack ids in older files).
export async function readScenario(root: string, id: string): Promise<any> {
  const raw = await readJsonOpt(root, `encounters/${id}.json`, null);
  if (!raw) throw new Error(`scenario ${id} not found`);
  if (!Array.isArray(raw.units)) throw new Error(`encounter ${id} is not a multi-unit scenario (no units list)`);
  return raw;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --no-warnings --test mcp/store.test.ts`
Expected: PASS (the FE8 test is skipped when `assets/reference/fe8` is absent).

- [ ] **Step 6: Commit**

```bash
git add mcp/store.ts mcp/store.test.ts mcp/testproject.ts
git commit -m "feat: MCP project store with atomic writes and on-disk scenario resolve"
```

---

### Task 6: Authored units in `set_unit`

**Files:**
- Modify: `mcp/handlers.ts`
- Modify: `mcp/handlers.test.ts`

- [ ] **Step 1: Point the existing tests at the shared helper and the new return shape**

In `mcp/handlers.test.ts`:
1. Remove the local `ROOT` constant and the local `tempProject` function, and the now unused imports `mkdtemp`, `cp`, `tmpdir`, `fileURLToPath`. Keep `readFile`, `rm`, `join`. Add:

```ts
import { ROOT, tempProject } from "./testproject.ts";
```

2. In the test `setUnit writes a valid edit to the temp project`, change `assert.equal(res.spd, 20);` to:

```ts
    assert.equal(res.unit.spd, 20);
    assert.equal(res.stats.spd, 20);
```

- [ ] **Step 2: Write the failing tests**

Append to `mcp/handlers.test.ts`:

```ts
const AUTHORED = {
  name: "Garcia-like", class: "soldier", level: 6, baseLevel: 1,
  bases: { hp: 28, str: 8, mag: 0, skl: 7, spd: 7, lck: 3, def: 5, res: 0, con: 13 },
  growths: { hp: 80, str: 65 }, skills: ["luna"],
};

test("setUnit accepts an authored unit and returns its computed statblock", async () => {
  const dir = await tempProject();
  try {
    const res = await setUnit(dir, "garcia", AUTHORED);
    assert.equal(res.unit.class, "soldier");
    assert.ok(res.stats.hp >= 28 && Number.isInteger(res.stats.hp));
    const onDisk = JSON.parse(await readFile(join(dir, "data/units.json"), "utf8"));
    assert.deepEqual(onDisk.garcia.skills, ["luna"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setUnit rejects an unknown class and an unknown skill, leaving the file unchanged", async () => {
  const dir = await tempProject();
  try {
    const before = await readFile(join(dir, "data/units.json"), "utf8");
    await assert.rejects(() => setUnit(dir, "x", { ...AUTHORED, class: "nope" }), /unknown class: nope/);
    await assert.rejects(() => setUnit(dir, "x", { ...AUTHORED, skills: ["nope"] }), /unknown skill: nope/);
    assert.equal(await readFile(join(dir, "data/units.json"), "utf8"), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setUnit deletes a field set to null", async () => {
  const dir = await tempProject();
  try {
    await setUnit(dir, "seth", { portrait: null });
    const onDisk = JSON.parse(await readFile(join(dir, "data/units.json"), "utf8"));
    assert.equal("portrait" in onDisk.seth, false);
    assert.equal(onDisk.seth.name, "Seth");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `node --no-warnings --test mcp/handlers.test.ts`
Expected: FAIL: `res.unit` is undefined, the authored unit is rejected with `missing numeric hp`, and `null` is stored instead of deleting.

- [ ] **Step 4: Implement**

In `mcp/handlers.ts`:

1. Replace the imports block's file helpers. Remove `readFile, writeFile` from the `node:fs/promises` import (keep `readdir`), delete the local `readJson` and `writeJson` functions, and add:

```ts
import { readJson, readJsonOpt, writeJsonAtomic, loadClassesAll } from "./store.ts";
import { computeStatblock } from "../src/grid/statblock.ts";
import type { UnitDef } from "../src/types.ts";
```

2. Replace every remaining `writeJson(` call (in `setWeapon` and `setEncounter`) with `writeJsonAtomic(`.

3. Replace `setUnit` with:

```ts
// Validate a unit record. Flat units (no bases, and a class without bases) need every
// numeric stat. Authored units are checked field by field, then computed.
async function validateUnitRecord(root: string, id: string, u: any): Promise<UnitDef> {
  if (!u || typeof u.name !== "string") throw new Error(`Unit ${id} missing name`);
  const classes = await loadClassesAll(root);
  const cls = u.class === undefined ? undefined : classes[u.class];
  if (u.class !== undefined && !cls) throw new Error(`Unit ${id} references unknown class: ${u.class}`);
  if (!(u.bases || cls?.bases)) return validateUnit(id, u);

  const problems: string[] = [];
  for (const f of ["level", "baseLevel", "portrait"]) {
    if (u[f] !== undefined && typeof u[f] !== "number") problems.push(`${f} must be a number`);
  }
  for (const f of ["bases", "growths"]) {
    const v = u[f];
    if (v !== undefined && (typeof v !== "object" || Object.values(v).some((n) => typeof n !== "number"))) {
      problems.push(`${f} must map stat names to numbers`);
    }
  }
  if (u.skills !== undefined) {
    if (!Array.isArray(u.skills)) problems.push("skills must be a list");
    else {
      const defs = await readJsonOpt(root, "data/skills.json", {});
      for (const s of u.skills) if (!defs[s]) problems.push(`unknown skill: ${s}`);
    }
  }
  if (problems.length) throw new Error(`Unit ${id}: ${problems.join("; ")}`);
  const stats = computeStatblock(u, cls);
  for (const [k, v] of Object.entries(stats)) {
    if (k !== "name" && !Number.isFinite(v)) throw new Error(`Unit ${id}: computed ${k} is not a number`);
  }
  return stats;
}

// Merge fields into a unit (a null value deletes that field), validate, then write.
export async function setUnit(root: string, id: string, fields: Record<string, unknown>) {
  const units = await readJson(root, "data/units.json");
  const merged: any = { ...(units[id] ?? {}) };
  for (const [k, v] of Object.entries(fields)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  const stats = await validateUnitRecord(root, id, merged); // throws, leaving the file untouched
  units[id] = merged;
  await writeJsonAtomic(root, "data/units.json", units);
  return { unit: merged, stats };
}
```

Note: `list` and `get` keep calling the store's `readJson`, which has the same `(root, rel)` signature as the deleted local one.

- [ ] **Step 5: Run to verify they pass**

Run: `node --no-warnings --test mcp/handlers.test.ts mcp/cli.test.ts mcp/bridge.test.ts`
Expected: PASS, all tests. If `cli.test.ts` asserts on `set-unit` output fields, update it to read `unit.<field>`.

- [ ] **Step 6: Commit**

```bash
git add mcp/handlers.ts mcp/handlers.test.ts mcp/cli.test.ts
git commit -m "feat: set_unit accepts authored units, null deletes a field, atomic writes"
```

---

### Task 7: Scenario write and describe handlers (`mcp/scenariohandlers.ts`)

**Files:**
- Create: `mcp/scenariohandlers.ts`
- Test: `mcp/scenariohandlers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mcp/scenariohandlers.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import {
  setScenario, placeUnit, removeUnit, describeScenarioById, describeMapById, simulateScenario,
} from "./scenariohandlers.ts";
import { ROOT, HAS_FE8, tempProject } from "./testproject.ts";

// showcase-terrain is 11x7: column 5 is mountain (cav cannot enter), column 9 water.
const BASE = {
  map: "showcase-terrain",
  notes: "test",
  units: [
    { unit: "seth", weapon: "iron-lance", side: "player", at: [1, 5] },
    { unit: "gen-soldier", weapon: "iron-lance", side: "enemy", at: [8, 1] },
    { unit: "gen-soldier", weapon: "iron-lance", side: "enemy", at: [8, 4] },
  ],
};

async function onDisk(dir: string, id: string): Promise<any> {
  return JSON.parse(await readFile(join(dir, `encounters/${id}.json`), "utf8"));
}

test("setScenario writes, assigns ids, and returns a description and link", async () => {
  const dir = await tempProject();
  try {
    const res = await setScenario(dir, "t1", BASE);
    assert.deepEqual((await onDisk(dir, "t1")).units.map((u: any) => u.id), ["seth", "gen-soldier", "gen-soldier-2"]);
    assert.equal((await onDisk(dir, "t1")).terrain, undefined);
    assert.ok(res.text.startsWith("scenario t1 on showcase-terrain"));
    assert.equal(res.link, "http://localhost:5173/src/game/scenario.html?s=t1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setScenario rejects bad placements with every problem and writes nothing", async () => {
  const dir = await tempProject();
  try {
    const bad = { ...BASE, units: [
      { unit: "seth", weapon: "iron-lance", side: "player", at: [5, 3] },
      { unit: "lute", weapon: "fire", side: "player", at: [20, 0] },
      ...BASE.units.slice(1),
    ] };
    await assert.rejects(() => setScenario(dir, "t2", bad), (e: Error) => {
      assert.match(e.message, /seth at \[5,3\] is on Mountain, impassable for cav units/);
      assert.match(e.message, /lute at \[20,0\] is off the 11x7 map/);
      return true;
    });
    await assert.rejects(() => access(join(dir, "encounters/t2.json")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a rejected write leaves an existing scenario byte for byte unchanged", async () => {
  const dir = await tempProject();
  try {
    await setScenario(dir, "t3", BASE);
    const before = await readFile(join(dir, "encounters/t3.json"), "utf8");
    await assert.rejects(() => placeUnit(dir, "t3", { id: "seth", at: [8, 1] }), /2 units on \[8,1\]/);
    await assert.rejects(() => setScenario(dir, "t3", { ...BASE, units: [{ unit: "ghost", weapon: "iron-lance", side: "player", at: [0, 0] }] }), /unknown unit: ghost/);
    assert.equal(await readFile(join(dir, "encounters/t3.json"), "utf8"), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("placeUnit appends, then moves an existing placement by id", async () => {
  const dir = await tempProject();
  try {
    await setScenario(dir, "t4", BASE);
    await placeUnit(dir, "t4", { unit: "lute", weapon: "fire", side: "player", at: [2, 5] });
    assert.equal((await onDisk(dir, "t4")).units.length, 4);
    await placeUnit(dir, "t4", { id: "lute", at: [3, 5] });
    const units = (await onDisk(dir, "t4")).units;
    assert.equal(units.length, 4);
    assert.deepEqual(units.find((u: any) => u.id === "lute").at, [3, 5]);
    assert.equal(units.find((u: any) => u.id === "lute").weapon, "fire");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("placeUnit needs a unit when appending", async () => {
  const dir = await tempProject();
  try {
    await setScenario(dir, "t5", BASE);
    await assert.rejects(() => placeUnit(dir, "t5", { id: "newcomer", at: [0, 0] }), /needs a unit/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("removeUnit removes a placement and rejects an unknown id", async () => {
  const dir = await tempProject();
  try {
    await setScenario(dir, "t6", BASE);
    await removeUnit(dir, "t6", "gen-soldier-2");
    assert.deepEqual((await onDisk(dir, "t6")).units.map((u: any) => u.id), ["seth", "gen-soldier"]);
    await assert.rejects(() => removeUnit(dir, "t6", "nope"), /no placement nope in scenario t6/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("describeScenarioById works on the repo scenario without writing", async () => {
  const d = await describeScenarioById(ROOT, "scenario-01");
  assert.equal(d.units.length, 4);
  assert.match(d.text, /^scenario scenario-01 on showcase-terrain/);
});

test("describeMapById describes a custom map", async () => {
  const d = await describeMapById(ROOT, "showcase-terrain");
  assert.equal(d.width, 11);
  assert.match(d.text, /Mountain \[mountain\]/);
});

test("setScenario on an FE8 chapter marks terrain fe8", { skip: !HAS_FE8 }, async () => {
  const dir = await tempProject();
  try {
    // Chapter 1 row 5 has plains at x 2 and x 4.
    await setScenario(dir, "t7", { map: "fe8-1", units: [
      { unit: "seth", weapon: "iron-lance", side: "player", at: [2, 5] },
      { unit: "gen-soldier", weapon: "iron-lance", side: "enemy", at: [4, 5] },
    ] });
    assert.equal((await onDisk(dir, "t7")).terrain, "fe8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

(`simulateScenario` is imported now and tested in Task 8.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --no-warnings --test mcp/scenariohandlers.test.ts`
Expected: FAIL, cannot find module `./scenariohandlers.ts`.

- [ ] **Step 3: Implement**

Create `mcp/scenariohandlers.ts`:

```ts
// MCP handlers for multi-unit scenarios. Every write goes through writeScenario:
// normalize, resolve from disk, run the placement checker, and only then write
// atomically. Reads describe scenarios and maps as text for the MCP.
import { normalizeScenario } from "../src/grid/scenariosrc.ts";
import { checkScenario, errorsOf } from "../src/grid/scenariocheck.ts";
import { createMultiGame, act, endPhase, status, unitById } from "../src/grid/multigame.ts";
import { decideMultiAction } from "../src/grid/multiai.ts";
import { describeScenario, describeMap, type ScenarioDescription, type MapDescription } from "./describe.ts";
import { resolveScenarioOnDisk, resolveMapOnDisk, readScenario, writeJsonAtomic } from "./store.ts";

const VIEWER = "http://localhost:5173/src/game/scenario.html";

export function viewerLink(id: string): string {
  return `${VIEWER}?s=${encodeURIComponent(id)}`;
}

function placementId(p: any): string {
  return typeof p?.id === "string" ? p.id : p?.unit;
}

async function writeScenario(root: string, id: string, spec: any): Promise<ScenarioDescription & { link: string }> {
  const norm = normalizeScenario(id, spec);
  const sc = await resolveScenarioOnDisk(root, norm); // throws on unknown references
  const problems = checkScenario(sc);
  const errors = errorsOf(problems);
  if (errors.length) {
    throw new Error(`scenario ${id} has ${errors.length} problem(s), nothing written:\n- ${errors.map((e) => e.message).join("\n- ")}`);
  }
  await writeJsonAtomic(root, `encounters/${id}.json`, norm);
  return { ...describeScenario(sc, problems), link: viewerLink(id) };
}

export function setScenario(root: string, id: string, spec: any) {
  return writeScenario(root, id, spec);
}

// Add a placement, or merge into the placement with the same id (to move it, change
// its weapon, and so on). Appending needs a unit key.
export async function placeUnit(root: string, scenarioId: string, placement: any) {
  if (!placement || typeof placement !== "object") throw new Error("placement must be an object");
  const raw = await readScenario(root, scenarioId);
  const pid = typeof placement.id === "string" ? placement.id : undefined;
  const idx = pid === undefined ? -1 : raw.units.findIndex((p: any) => placementId(p) === pid);
  const units = raw.units.slice();
  if (idx >= 0) units[idx] = { ...units[idx], ...placement };
  else {
    if (typeof placement.unit !== "string") throw new Error(`placement ${pid ?? ""} needs a unit to be added`);
    units.push(placement);
  }
  return writeScenario(root, scenarioId, { ...raw, units });
}

export async function removeUnit(root: string, scenarioId: string, id: string) {
  const raw = await readScenario(root, scenarioId);
  const units = raw.units.filter((p: any) => placementId(p) !== id);
  if (units.length === raw.units.length) throw new Error(`no placement ${id} in scenario ${scenarioId}`);
  return writeScenario(root, scenarioId, { ...raw, units });
}

// Describe without writing; works on scenarios with placement problems so they can
// be repaired.
export async function describeScenarioById(root: string, id: string): Promise<ScenarioDescription> {
  const sc = await resolveScenarioOnDisk(root, normalizeScenario(id, await readScenario(root, id)));
  return describeScenario(sc, checkScenario(sc));
}

export async function describeMapById(root: string, mapId: string): Promise<MapDescription> {
  const { map, terrainDefs } = await resolveMapOnDisk(root, mapId);
  return describeMap(map, terrainDefs);
}

// Play the scenario headlessly with the AI driving both sides, phase by phase, until
// one side is routed or the turn cap passes. Deterministic for a seed.
export async function simulateScenario(root: string, id: string, seed = 1, turnCap = 50) {
  const sc = await resolveScenarioOnDisk(root, normalizeScenario(id, await readScenario(root, id)));
  const g = createMultiGame(sc, seed);
  while (status(g) === "ongoing" && g.turn <= turnCap) {
    const ids = g.units.filter((u) => u.side === g.phase).map((u) => u.id);
    for (const uid of ids) {
      if (status(g) !== "ongoing") break;
      if (!unitById(g, uid) || g.acted.has(uid)) continue;
      const a = decideMultiAction(g, uid);
      try {
        act(g, uid, a.to, a.attackTargetId);
      } catch {
        g.acted.add(uid); // an illegal decision just ends that unit's action
      }
    }
    if (status(g) === "ongoing") endPhase(g);
  }
  return {
    status: status(g),
    turns: g.turn,
    survivors: g.units.map((u) => ({ id: u.id, side: u.side, hp: u.hp })),
    log: g.log,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --no-warnings --test mcp/scenariohandlers.test.ts`
Expected: PASS (FE8 test skipped without reference data).

- [ ] **Step 5: Commit**

```bash
git add mcp/scenariohandlers.ts mcp/scenariohandlers.test.ts
git commit -m "feat: MCP scenario handlers: set, place, remove, describe"
```

---

### Task 8: Simulation test, and new `list` / `get` kinds

**Files:**
- Modify: `mcp/scenariohandlers.test.ts` (append)
- Modify: `mcp/handlers.ts` (`list`, `get`)
- Modify: `mcp/handlers.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `mcp/scenariohandlers.test.ts`:

```ts
test("simulateScenario reaches a result and repeats exactly for a seed", async () => {
  const a = await simulateScenario(ROOT, "scenario-01", 3);
  const b = await simulateScenario(ROOT, "scenario-01", 3);
  assert.deepEqual(a, b);
  assert.notEqual(a.status, "ongoing");
  assert.ok(a.turns >= 1);
  assert.ok(a.survivors.every((s) => typeof s.hp === "number"));
});
```

Append to `mcp/handlers.test.ts` (add `HAS_FE8` to the `./testproject.ts` import):

```ts
test("list covers scenarios, skills, and merged classes", async () => {
  const scenarios = await list(ROOT, "scenarios");
  assert.ok(scenarios.some((s: any) => s.id === "scenario-01" && s.map === "showcase-terrain"));
  assert.ok(!scenarios.some((s: any) => s.id === "duel-01"));
  assert.ok((await list(ROOT, "skills")).includes("luna"));
  assert.ok((await list(ROOT, "classes")).includes("paladin"));
});

test("get covers scenario, skill, and class", async () => {
  assert.equal((await get(ROOT, "scenario", "scenario-01")).map, "showcase-terrain");
  assert.equal((await get(ROOT, "skill", "luna")).kind, "combat");
  assert.equal((await get(ROOT, "class", "paladin")).movementType, "cav");
  await assert.rejects(() => get(ROOT, "skill", "nope"), /skill nope not found/);
});

test("list chapters and get an FE8 map", { skip: !HAS_FE8 }, async () => {
  const chapters = await list(ROOT, "chapters");
  const ch1 = chapters.find((c: any) => c.id === "fe8-1");
  assert.deepEqual(ch1, { id: "fe8-1", name: "01 Ch1 Escape!", width: 15, height: 10 });
  assert.equal((await get(ROOT, "map", "fe8-1")).width, 15);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --no-warnings --test mcp/handlers.test.ts mcp/scenariohandlers.test.ts`
Expected: the simulate test passes already (its handler exists), the list and get tests FAIL with `unknown kind`. If the simulate test reports `ongoing`, stop and investigate with superpowers:systematic-debugging (for example, log `a.log` and check that the AI's `to` is reachable); do not loosen the assertion.

- [ ] **Step 3: Implement**

In `mcp/handlers.ts`, add imports:

```ts
import { scenarioIndex, scenarioSources } from "../src/grid/scenariosrc.ts";
import { readScenario } from "./store.ts";
```

(merge `readScenario` into the existing `./store.ts` import line). Replace `list` and `get` with:

```ts
async function scenarioListing(root: string) {
  const files = (await readdir(join(root, "encounters"))).filter((f) => f.endsWith(".json"));
  const entries = [];
  for (const file of files) entries.push({ file, json: await readJson(root, `encounters/${file}`) });
  return scenarioIndex(entries);
}

export async function list(root: string, kind: string): Promise<any[]> {
  if (kind === "classes") return Object.keys(await loadClassesAll(root));
  if (kind === "skills") return Object.keys(await readJsonOpt(root, "data/skills.json", {}));
  if (kind === "scenarios") return scenarioListing(root);
  if (kind === "chapters") {
    const maps = await readJsonOpt(root, "assets/reference/fe8/maps.json", null);
    if (!maps) throw new Error("FE8 chapters not imported: run Generate Maps");
    // Chapter sizes in maps.json are in pixels; tiles are 16 by 16.
    return maps.map((c: any) => ({ id: `fe8-${c.index}`, name: c.name, width: c.width / 16, height: c.height / 16 }));
  }
  if (kind in TABLE_FILES) return Object.keys(await readJson(root, TABLE_FILES[kind]));
  if (kind === "encounters" || kind === "maps") {
    const files = await readdir(join(root, kind));
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  }
  throw new Error(`unknown kind: ${kind}`);
}

export async function get(root: string, kind: string, id: string): Promise<any> {
  const found = (rec: any, what: string) => {
    if (!rec) throw new Error(`${what} ${id} not found`);
    return rec;
  };
  if (kind === "class" || kind === "classes") return found((await loadClassesAll(root))[id], "class");
  if (kind === "skill" || kind === "skills") return found((await readJsonOpt(root, "data/skills.json", {}))[id], "skill");
  if (kind === "scenario") return readScenario(root, id);
  if (kind === "map") return readJson(root, scenarioSources({ map: id }).mapPath);
  if (kind in TABLE_FILES) return found((await readJson(root, TABLE_FILES[kind]))[id], kind);
  const singular: Record<string, string> = { unit: "units", weapon: "weapons" };
  if (kind in singular) return get(root, singular[kind], id);
  if (kind === "encounter") return readJson(root, `encounters/${id}.json`);
  throw new Error(`unknown kind: ${kind}`);
}
```

The `encounters/` folder may hold `.json.tmp` files only for an instant during a write; `endsWith(".json")` already excludes them.

- [ ] **Step 4: Run to verify they pass**

Run: `node --no-warnings --test mcp/`
Expected: PASS, all MCP tests.

- [ ] **Step 5: Commit**

```bash
git add mcp/handlers.ts mcp/handlers.test.ts mcp/scenariohandlers.test.ts
git commit -m "feat: list and get scenarios, chapters, skills, merged classes; simulate test"
```

---

### Task 9: Register the tools (`mcp/toolspecs.ts`)

**Files:**
- Modify: `mcp/toolspecs.ts`
- Modify: `mcp/toolspecs.test.ts`

- [ ] **Step 1: Update the failing test**

In `mcp/toolspecs.test.ts`, replace the expected list in `the expected tools are present` with:

```ts
  assert.deepEqual(names, [
    "describe_map", "describe_scenario", "get", "list", "place_unit", "preview_encounter",
    "remove_unit", "set_encounter", "set_scenario", "set_unit", "set_weapon",
    "simulate_scenario", "simulate_skirmish",
  ]);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --no-warnings --test mcp/toolspecs.test.ts`
Expected: FAIL, the six new names are missing.

- [ ] **Step 3: Implement**

In `mcp/toolspecs.ts`, add the import:

```ts
import * as sh from "./scenariohandlers.ts";
```

Replace the `list`, `get`, `set_unit`, and `set_encounter` entries' `description` strings, keeping their params and handlers:

- `list`: `"List records of a kind. kind is units, weapons, classes (custom plus FE8), terrain, encounters, maps, skills, scenarios (id, map, notes), or chapters (FE8 chapters: id fe8-<n>, name, width, height)."`
- `get`: `"Get one record by kind and id. kind is unit, weapon, class, skill, terrain, encounter, scenario, or map (a custom map id or fe8-<n>)."`
- `set_unit`: `"Create or update a unit. fields merges into the unit; a null value deletes a field. Either a flat unit (name, class, hp, str, mag, skl, spd, lck, def, res, con) or an authored unit (name, class, level, baseLevel, bases, growths, skills, portrait). Validated before writing. Returns { unit, stats } with the computed statblock."`
- `set_encounter`: `"Create or update a 1v1 encounter (a duel, or a skirmish with a map and player/enemy positions). For several units per side use set_scenario."`

Append these entries to `TOOLSPECS`:

```ts
  {
    name: "set_scenario",
    description: "Create or replace a multi-unit scenario. spec is { map, notes?, units: [{ id?, unit, weapon, side: player|enemy, at: [x, y], ai?: aggressive|stationary }] }. map is a custom map id or fe8-<n> for an FE8 chapter. Placement ids are assigned when missing. Validated (references, on map, passable tile, no shared tile, both sides present) before writing; on any error nothing is written and every problem is listed. Returns the scenario as text plus a viewer link.",
    params: { type: "object", properties: { id: { type: "string" }, spec: { type: "object" } }, required: ["id", "spec"] },
    handler: (root, a) => sh.setScenario(root, a.id, a.spec),
  },
  {
    name: "place_unit",
    description: "Add a unit to a scenario, or update the placement with the same id (for example to move it: { id, at: [x, y] }). Adding needs unit, weapon, side, and at. Same validation as set_scenario.",
    params: { type: "object", properties: { scenario: { type: "string" }, placement: { type: "object" } }, required: ["scenario", "placement"] },
    handler: (root, a) => sh.placeUnit(root, a.scenario, a.placement),
  },
  {
    name: "remove_unit",
    description: "Remove the placement with this id from a scenario. Same validation as set_scenario.",
    params: { type: "object", properties: { scenario: { type: "string" }, id: { type: "string" } }, required: ["scenario", "id"] },
    handler: (root, a) => sh.removeUnit(root, a.scenario, a.id),
  },
  {
    name: "describe_map",
    description: "Show a map as text: an ASCII terrain grid with x and y rulers and a legend with each terrain's defense, avoid, heal, and move cost for foot, cav, and fly units. map is a custom map id or fe8-<n>. Use it before placing units.",
    params: { type: "object", properties: { map: { type: "string" } }, required: ["map"] },
    handler: (root, a) => sh.describeMapById(root, a.map),
  },
  {
    name: "describe_scenario",
    description: "Show a scenario as text: the map with units overlaid (player A..Z, enemy a..z), each unit's resolved stats, weapon, AI, and position, and any placement problems.",
    params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: (root, a) => sh.describeScenarioById(root, a.id),
  },
  {
    name: "simulate_scenario",
    description: "Play a scenario headlessly with the AI on both sides until a side is routed or turnCap (default 50) passes. Returns status (player-won, player-lost, or ongoing at the cap), turns, survivors with HP, and the combat log. Deterministic for a seed; try several seeds to judge balance.",
    params: { type: "object", properties: { id: { type: "string" }, seed: { type: "number" }, turnCap: { type: "number" } }, required: ["id"] },
    handler: (root, a) => sh.simulateScenario(root, a.id, a.seed, a.turnCap),
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --no-warnings --test mcp/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/toolspecs.ts mcp/toolspecs.test.ts
git commit -m "feat: register scenario authoring MCP tools"
```

---

### Task 10: Scenario list endpoint (`src/server.ts`)

**Files:**
- Modify: `src/server.ts`

The listing logic is `scenarioIndex`, already tested in Task 1; this task only wires it.

- [ ] **Step 1: Implement**

In `src/server.ts`, change the fs import to:

```ts
import { readFile, writeFile, readdir } from "node:fs/promises";
```

add:

```ts
import { scenarioIndex } from "./grid/scenariosrc.ts";
```

and insert this block in the request handler directly before the `// Static routes.` comment:

```ts
      // Read-only scenario listing for the scenario viewer's dropdown.
      if (req.method === "GET" && url.pathname === "/api/scenarios") {
        const files = (await readdir("encounters")).filter((f) => f.endsWith(".json"));
        const entries: { file: string; json: any }[] = [];
        for (const file of files) {
          try {
            entries.push({ file, json: JSON.parse(await readFile(`encounters/${file}`, "utf8")) });
          } catch {
            // Skip an unreadable or mid-edit file rather than failing the whole list.
          }
        }
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify(scenarioIndex(entries)));
        return;
      }
```

- [ ] **Step 2: Verify by hand**

Run in one terminal (from the repo root): `$env:FEA_NO_BROWSER=1; node --no-warnings src/server.ts` (PowerShell) or `FEA_NO_BROWSER=1 node --no-warnings src/server.ts` (bash).
In another: `curl -s http://localhost:5173/api/scenarios`
Expected: `[{"id":"scenario-01","map":"showcase-terrain","notes":"Authoring demo: several units per side with computed statblocks and skills."}]`. Stop the server.

- [ ] **Step 3: Run the existing server tests**

Run: `node --no-warnings --test src/server.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: /api/scenarios listing endpoint"
```

---

### Task 11: Viewer: listing, `?s=`, live reload, problems banner

**Files:**
- Modify: `src/game/scenario.html`
- Modify: `src/game/scenario.ts`

- [ ] **Step 1: HTML**

In `src/game/scenario.html`:

1. Replace

```html
      <select id="enc">
        <option value="/encounters/scenario-01.json">Scenario 01 (authored units)</option>
      </select>
```

with

```html
      <select id="enc"></select>
```

2. After the `<span id="status">...</span>` line, add:

```html
    <span id="notice" class="notice" hidden></span>
```

3. Directly after the closing `</div>` of `<div class="controls" ...>`, add:

```html
  <div id="banner" class="banner" hidden></div>
```

4. Add to the `<style>` block:

```css
    .banner { margin: 0.5rem 0; padding: 0.4rem 0.6rem; border-radius: 6px; border: 1px solid #8886; font-size: 0.9rem; }
    .banner .err { color: #e0453b; }
    .banner .warn { color: #c08a00; }
    .notice { font-size: 0.85rem; color: #2b8a3e; }
```

- [ ] **Step 2: Script: imports and loading**

In `src/game/scenario.ts`:

1. Add imports:

```ts
import { scenarioSources, normalizeScenario, CLASS_PATHS } from "../grid/scenariosrc.ts";
import { checkScenario } from "../grid/scenariocheck.ts";
```

2. Next to the other element lookups near the top, add:

```ts
const bannerEl = document.getElementById("banner")!;
const noticeEl = document.getElementById("notice")!;
let currentId = "";   // scenario id open in the viewer
let lastText = "";    // file text last loaded, for change detection
let loadError = "";   // last load or resolve error, shown in the banner
let polling = false;  // a reload check is in flight
```

3. Replace the whole `fetchScenario` function with:

```ts
async function fetchText(id: string): Promise<string> {
  const r = await fetch(`/encounters/${encodeURIComponent(id)}.json`, { cache: "no-store" });
  if (!r.ok) throw new Error(`scenario ${id}: HTTP ${r.status}`);
  return r.text();
}

// Resolve scenario file text with the same file rules the MCP uses.
async function resolveText(id: string, text: string): Promise<ResolvedScenario> {
  const enc = normalizeScenario(id, JSON.parse(text));
  const src = scenarioSources(enc);
  const [units, weapons, custom, fe8cls, skills, terrain, map] = await Promise.all([
    fetchJson("/data/units.json"), fetchJson("/data/weapons.json"), fetchJson(`/${CLASS_PATHS.custom}`),
    fetchJson(`/${CLASS_PATHS.fe8}`, {}), fetchJson("/data/skills.json", {}),
    fetchJson(`/${src.terrainPath}`), fetchJson(`/${src.mapPath}`),
  ]);
  if (!terrain) throw new Error(`terrain file ${src.terrainPath} not found`);
  if (!map) throw new Error(`map file ${src.mapPath} not found`);
  return resolveScenario(enc, units, weapons, terrain, { ...(fe8cls ?? {}), ...custom }, map, skills ?? {});
}

function renderBanner(): void {
  const items: string[] = [];
  if (loadError) items.push(`<div class="err">Could not load the latest file, showing the last good version: ${esc(loadError)}</div>`);
  if (scRaw) {
    for (const p of checkScenario(scRaw)) items.push(`<div class="${p.level === "error" ? "err" : "warn"}">${p.level}: ${esc(p.message)}</div>`);
  }
  bannerEl.innerHTML = items.join("");
  bannerEl.hidden = items.length === 0;
}

let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function flashNotice(msg: string): void {
  noticeEl.textContent = msg;
  noticeEl.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { noticeEl.hidden = true; }, 3000);
}

// Load (or reload) a scenario. A reload with unchanged text does nothing. A file that
// fails to load or resolve keeps the last good scenario on screen.
async function openScenario(id: string, reason: "open" | "reload"): Promise<void> {
  let text: string;
  try { text = await fetchText(id); }
  catch (e) { loadError = (e as Error).message; renderBanner(); return; }
  if (id !== currentId) return;              // the user switched scenarios meanwhile
  if (reason === "reload" && text === lastText) return;
  lastText = text;
  let next: ResolvedScenario;
  try { next = await resolveText(id, text); }
  catch (e) { loadError = (e as Error).message; renderBanner(); return; }
  if (id !== currentId) return;
  scRaw = next;
  loadError = "";
  start();
  renderBanner();
  if (reason === "reload") flashNotice("Reloaded: scenario changed on disk");
}
```

Note: `let scRaw: ResolvedScenario;` near the top stays as is; `renderBanner` guards it because a first load can fail before it is set.

- [ ] **Step 3: Script: boot**

Replace the whole `boot` function with:

```ts
async function boot(): Promise<void> {
  const sel2 = document.getElementById("enc") as HTMLSelectElement;
  const listing: { id: string; notes: string }[] = (await fetchJson("/api/scenarios", [])) ?? [];
  const label = (s: { id: string; notes: string }) => {
    const notes = s.notes.length > 60 ? `${s.notes.slice(0, 57)}...` : s.notes;
    return notes ? `${s.id}: ${notes}` : s.id;
  };
  sel2.innerHTML = listing.map((s) => `<option value="${esc(s.id)}">${esc(label(s))}</option>`).join("");
  const wanted = new URLSearchParams(location.search).get("s");
  currentId = wanted && listing.some((s) => s.id === wanted) ? wanted : (listing[0]?.id ?? "");
  if (!currentId) { statusEl.textContent = "No scenarios found in encounters/"; return; }
  sel2.value = currentId;
  sel2.addEventListener("change", () => {
    currentId = sel2.value;
    lastText = "";
    history.replaceState(null, "", `?s=${encodeURIComponent(currentId)}`);
    void openScenario(currentId, "open");
  });
  await openScenario(currentId, "open");
  // Live reload: check the open scenario's file about every 1.5 seconds. Skipped
  // while the enemy phase animates so a reload never lands mid-move.
  setInterval(async () => {
    if (!currentId || busy || polling) return;
    polling = true;
    try { await openScenario(currentId, "reload"); } finally { polling = false; }
  }, 1500);
}
```

- [ ] **Step 4: Run the full suite**

Run: `node --no-warnings --test`
Expected: PASS, all tests (the viewer has no unit tests; its logic lives in the tested pure modules).

- [ ] **Step 5: Verify in the browser**

1. Start the server: `$env:FEA_NO_BROWSER=1; node --no-warnings src/server.ts` (or the bash form).
2. Open `http://localhost:5173/src/game/scenario.html`. Expected: the dropdown shows `scenario-01: Authoring demo...`, the map renders, no banner.
3. Open `http://localhost:5173/src/game/scenario.html?s=scenario-01`. Same result.
4. In another terminal, create a scenario through the handler (stands in for the MCP):

```bash
node --no-warnings -e "import('./mcp/scenariohandlers.ts').then(async (h) => { const r = await h.setScenario('.', 'live-test', { map: 'showcase-terrain', notes: 'live reload check', units: [ { unit: 'seth', weapon: 'iron-lance', side: 'player', at: [1, 5] }, { unit: 'gen-soldier', weapon: 'iron-lance', side: 'enemy', at: [8, 1] } ] }); console.log(r.link); })"
```

5. Open the printed link. Expected: `live-test` selected, two units.
6. Move Seth through the handler:

```bash
node --no-warnings -e "import('./mcp/scenariohandlers.ts').then((h) => h.placeUnit('.', 'live-test', { id: 'seth', at: [3, 5] }))"
```

Expected: within about 2 seconds the viewer shows Seth at [3,5] and the notice "Reloaded: scenario changed on disk".
7. Hand-edit `encounters/live-test.json` so `gen-soldier` has `"at": [5, 3]` (a mountain, passable for foot, so no error), then set it to `[9, 0]` (water). Expected: after the second edit the banner shows `error: gen-soldier at [9,0] is on Water, impassable for foot units`, and the map still renders.
8. Break the JSON (delete a closing brace). Expected: banner shows "Could not load the latest file, showing the last good version: ...", the last good map stays. Restore the brace: the banner clears.
9. Delete `encounters/live-test.json` and stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/game/scenario.ts src/game/scenario.html
git commit -m "feat: scenario viewer lists scenarios, opens ?s=, live reloads, shows problems"
```

---

### Task 12: End to end check through the real MCP server, and wrap up

**Files:**
- Modify: `docs/superpowers/plans/2026-11-10-fearchitect-scenario-authoring.md` (tick boxes)

- [ ] **Step 1: Full suite**

Run: `node --no-warnings --test`
Expected: PASS, all tests, 0 failures.

- [ ] **Step 2: MCP round trip**

Reconnect the `fearchitect` MCP server in the client (it reads `mcp/server.ts` at start, so the new tools need a restart). Then, through the MCP tools:
1. `list` kind `chapters` (if FE8 data is imported) and `describe_map` on `fe8-2` (or `forest-hills` without FE8 data).
2. `set_unit` an authored enemy, for example `{ name: "Brigand", class: "soldier", level: 4, baseLevel: 1, skills: ["vantage"] }`.
3. `set_scenario` a 2v3 scenario on that map using passable tiles read from `describe_map`.
4. Deliberately `place_unit` onto an impassable tile and confirm the error lists it and nothing changed.
5. `simulate_scenario` with seeds 1, 2, 3 and confirm it returns results.
6. Open the returned link with the viewer running, `place_unit` a move, and watch it reload.
Remove the scratch scenario and unit afterward (`remove` is not a tool: delete `encounters/<id>.json` and the unit entry by hand, or keep them if Theo wants them).

- [ ] **Step 3: Tick this plan's checkboxes and commit**

```bash
git add docs/superpowers/plans/2026-11-10-fearchitect-scenario-authoring.md
git commit -m "docs: mark scenario authoring plan complete"
```

---

## Self-review notes (for the implementer)

- `GridUnit.id` is now the placement id. The viewer, engine, and AI already key on `u.id`, so two copies of one unit now work everywhere.
- `set_unit` returns `{ unit, stats }` (was the merged unit). The CLI prints whatever the handler returns, so `set-unit` output changes shape; that is intended.
- `get` for `classes` now falls back to FE8 sim classes; `list classes` includes them. Custom classes win on id clashes, matching the viewer.
- If a test depends on FE8 reference data, it must use `{ skip: !HAS_FE8 }`.
- Do not add a dependency. Do not restructure `src/game/scenario.ts` beyond the functions named.
