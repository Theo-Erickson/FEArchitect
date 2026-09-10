# FEArchitect Slice B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the Tier 1 preview into a playable 1v1 tactical grid with movement types (foot, cavalry, flying), terrain, a two-click move with path-slide animation, live seeded combat, a simple enemy AI, and an auto-play-player toggle.

**Architecture:** New pure, DOM-free modules under `src/grid/` handle terrain, movement (Dijkstra), AI, and a turn state machine, all unit-tested with the Node test runner. The existing `combat.ts` gains optional terrain avoid/def and a one-exchange resolver, reused unchanged in the Monte Carlo path. A thin browser client in `src/game/` renders the grid with inline vector sprites and drives interaction. The existing standard-library server serves it.

**Tech Stack:** TypeScript run natively by Node 24 (no build step, no dependencies). Node built-in test runner. Node standard-library `http`/`fs` server. Plain SVG/TS in the browser.

**Prose and code conventions:** No em dashes or en dashes anywhere. Use colons or commas. Comment new code well. Do not add Co-Authored-By or any attribution trailer to commits (project owner preference).

---

## File structure

| Path | Responsibility |
|------|----------------|
| `src/grid/types.ts` | Grid types: MovementType, TerrainDef, ClassDef, TerrainMod, ResolvedMap, GridUnit, GridEncounter, TileVec, GameStatus. |
| `src/grid/terrain.ts` | Terrain cost, passability, and bonus lookups. |
| `src/grid/movement.ts` | Reachable-tile set (Dijkstra) and least-cost pathfinding. |
| `src/grid/datagen.ts` | Load and validate terrain, classes, maps, and a grid encounter into a GridEncounter. |
| `src/grid/ai.ts` | Decide a unit's action: attack in range, else approach. |
| `src/grid/game.ts` | Turn state machine: reachable, path, applyMove, applyAttack, endPhase, status, takeAiTurn. |
| `src/grid/render.ts` | Pure SVG builders for tiles, terrain sprites, and unit sprites. |
| `src/combat.ts` | MODIFY: computeMatchup gains optional terrain; add resolveExchange; strike returns hit/crit/damage. |
| `src/types.ts` | MODIFY: add optional weapon range; re-export nothing new (grid types live in grid/types.ts). |
| `src/server.ts` | MODIFY: allow serving `maps/`; open a chosen page; tolerate an already-running server. |
| `data/terrain.json`, `data/classes.json` | New config. |
| `data/units.json` | MODIFY: add `class` to each unit. |
| `maps/*.json`, `encounters/skirmish-01.json` | New config. |
| `src/game/index.html`, `src/game/client.ts` | The Play view. |
| `Play Map.cmd` | Launcher. |
| `src/editor/index.html` | MODIFY: add a link to the Play view. |
| `README.md` | MODIFY: document the Play view and `Play Map.cmd`. |

---

## Task 1: Grid types and weapon range

**Files:**
- Create: `src/grid/types.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Add optional weapon range and a terrain modifier to `src/types.ts`**

Add `range?: number` to the `WeaponDef` interface (place it after `weight`):

```ts
export interface WeaponDef {
  name: string;
  type: WeaponType;
  rank: string;
  might: number;
  hit: number;
  crit: number;
  weight: number;
  range?: number; // attack range in tiles; defaults to 1 (melee) when absent
}
```

Append this interface to `src/types.ts`:

```ts
// A terrain tile's contribution to the defender in a matchup.
export interface TerrainMod {
  avoid: number;
  def: number;
}
```

- [ ] **Step 2: Create `src/grid/types.ts`**

```ts
// Grid-specific contracts. Declarations only.
import type { UnitDef, WeaponDef } from "../types.ts";

export type MovementType = "foot" | "cav" | "fly";

export interface TerrainDef {
  name: string;
  // Cost to ENTER a tile of this terrain per movement type. null = impassable.
  moveCost: Record<MovementType, number | null>;
  avoid: number;
  def: number;
}

export interface ClassDef {
  name: string;
  movementType: MovementType;
  move: number; // movement budget in points
}

export interface TileVec {
  x: number;
  y: number;
}

// A map with its tiles resolved from legend chars into terrain ids.
export interface ResolvedMap {
  id: string;
  width: number;
  height: number;
  terrain: string[][]; // terrain[y][x] = terrain id
}

export type Side = "player" | "enemy";
export type AiKind = "aggressive" | "stationary";

// A fighter placed on the grid with live HP and position.
export interface GridUnit {
  id: string;      // unit key
  side: Side;
  unit: UnitDef;
  weapon: WeaponDef;
  cls: ClassDef;
  ai: AiKind;      // player defaults to "aggressive" but is normally human-driven
  pos: TileVec;
  hp: number;      // current HP
}

export interface GridEncounter {
  id: string;
  win: string;
  map: ResolvedMap;
  terrainDefs: Record<string, TerrainDef>;
  player: GridUnit;
  enemy: GridUnit;
}

export type GameStatus = "ongoing" | "player-won" | "player-lost";
```

- [ ] **Step 3: Sanity-check both files parse**

Run: `node --check src/types.ts && node --check src/grid/types.ts`
Expected: no output (both parse). If `node --check` rejects TypeScript on this build, instead run `node --test` after Task 2, which imports these.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/grid/types.ts
git commit -m "feat: grid types and optional weapon range"
```

---

## Task 2: Terrain lookups

**Files:**
- Create: `src/grid/terrain.ts`
- Test: `src/grid/terrain.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/grid/terrain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { enterCost, isPassable, terrainMod } from "./terrain.ts";
import type { TerrainDef } from "./types.ts";

const DEFS: Record<string, TerrainDef> = {
  plains: { name: "Plains", moveCost: { foot: 1, cav: 1, fly: 1 }, avoid: 0, def: 0 },
  forest: { name: "Forest", moveCost: { foot: 2, cav: 3, fly: 1 }, avoid: 20, def: 1 },
  mountain: { name: "Mountain", moveCost: { foot: 3, cav: null, fly: 1 }, avoid: 30, def: 2 },
  water: { name: "Water", moveCost: { foot: null, cav: null, fly: 1 }, avoid: 0, def: 0 },
};

test("enterCost returns per-type cost or null", () => {
  assert.equal(enterCost(DEFS, "forest", "foot"), 2);
  assert.equal(enterCost(DEFS, "forest", "cav"), 3);
  assert.equal(enterCost(DEFS, "mountain", "cav"), null);
  assert.equal(enterCost(DEFS, "water", "fly"), 1);
});

test("isPassable reflects null cost", () => {
  assert.equal(isPassable(DEFS, "water", "foot"), false);
  assert.equal(isPassable(DEFS, "water", "fly"), true);
  assert.equal(isPassable(DEFS, "mountain", "cav"), false);
});

test("terrainMod returns avoid and def", () => {
  assert.deepEqual(terrainMod(DEFS, "forest"), { avoid: 20, def: 1 });
  assert.deepEqual(terrainMod(DEFS, "plains"), { avoid: 0, def: 0 });
});

test("unknown terrain id throws", () => {
  assert.throws(() => enterCost(DEFS, "lava", "foot"), /unknown terrain/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/grid/terrain.test.ts`
Expected: FAIL, `./terrain.ts` not found.

- [ ] **Step 3: Implement `src/grid/terrain.ts`**

```ts
// Terrain lookups over a set of terrain definitions.
import type { TerrainDef, MovementType, TerrainMod } from "./types.ts";

function def(defs: Record<string, TerrainDef>, id: string): TerrainDef {
  const d = defs[id];
  if (!d) throw new Error(`unknown terrain id: ${id}`);
  return d;
}

// Cost to enter a tile of the given terrain with the given movement type, or
// null if impassable to that type.
export function enterCost(
  defs: Record<string, TerrainDef>, id: string, type: MovementType,
): number | null {
  return def(defs, id).moveCost[type];
}

export function isPassable(
  defs: Record<string, TerrainDef>, id: string, type: MovementType,
): boolean {
  return enterCost(defs, id, type) != null;
}

export function terrainMod(defs: Record<string, TerrainDef>, id: string): TerrainMod {
  const d = def(defs, id);
  return { avoid: d.avoid, def: d.def };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/grid/terrain.test.ts`
Expected: PASS, 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/grid/terrain.ts src/grid/terrain.test.ts
git commit -m "feat: terrain cost and passability lookups"
```

---

## Task 3: Movement (reachable set and pathfinding)

**Files:**
- Create: `src/grid/movement.ts`
- Test: `src/grid/movement.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/grid/movement.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReachable, findPath, tileKey } from "./movement.ts";
import type { TerrainDef, ResolvedMap, MovementType } from "./types.ts";

const DEFS: Record<string, TerrainDef> = {
  plains: { name: "Plains", moveCost: { foot: 1, cav: 1, fly: 1 }, avoid: 0, def: 0 },
  forest: { name: "Forest", moveCost: { foot: 2, cav: 3, fly: 1 }, avoid: 20, def: 1 },
  mountain: { name: "Mountain", moveCost: { foot: 3, cav: null, fly: 1 }, avoid: 30, def: 2 },
  water: { name: "Water", moveCost: { foot: null, cav: null, fly: 1 }, avoid: 0, def: 0 },
};

// Same layout as the showcase map. legend: .=plains f=forest ^=mountain ~=water
const ROWS = [
  ".....^...~.",
  "...ff^...~.",
  "...ff^...~.",
  "...ff^.....",
  "...ff^...~.",
  ".....^...~.",
  ".........~.",
];
const LEGEND: Record<string, string> = { ".": "plains", f: "forest", "^": "mountain", "~": "water" };
const MAP: ResolvedMap = {
  id: "test",
  width: 10,
  height: 7,
  terrain: ROWS.map((r) => [...r].map((c) => LEGEND[c])),
};

function reach(type: MovementType, move: number, blocked: string[] = []) {
  return computeReachable(MAP, DEFS, { movementType: type, move, from: { x: 1, y: 3 } }, new Set(blocked)).tiles;
}

test("foot is boxed in by forest and mountain", () => {
  const t = reach("foot", 5);
  assert.ok(t.has("4,3"));   // through forest: 1+2+2 = 5
  assert.ok(t.has("1,0"));   // up the open left column: 3
  assert.ok(!t.has("5,3"));  // mountain past forest costs 8
  assert.ok(!t.has("8,3"));  // far side of the river, unreachable
});

test("cavalry ranges wider on open ground but is walled by mountain and river", () => {
  const t = reach("cav", 7);
  assert.ok(t.has("4,0"));   // along the top: 6
  assert.ok(!t.has("5,3"));  // mountain impassable to cav
  assert.ok(!t.has("8,3"));  // cannot cross the river within budget
});

test("flying ignores terrain and crosses water and mountains", () => {
  const t = reach("fly", 7);
  assert.ok(t.has("5,3"));   // over the mountain, distance 4
  assert.ok(t.has("7,3"));   // distance 6
  assert.ok(t.has("8,3"));   // the bridge tile, distance 7
});

test("an occupied tile is not reachable", () => {
  const t = reach("fly", 7, ["7,3"]);
  assert.ok(!t.has("7,3"));
});

test("findPath returns a least-cost path or null", () => {
  const p = findPath(MAP, DEFS, { movementType: "fly", move: Infinity, from: { x: 1, y: 3 } }, { x: 7, y: 3 }, new Set());
  assert.ok(p);
  assert.equal(p!.cost, 6);
  assert.deepEqual(p!.path[0], { x: 1, y: 3 });
  assert.deepEqual(p!.path[p!.path.length - 1], { x: 7, y: 3 });

  // foot cannot enter water at all
  const none = findPath(MAP, DEFS, { movementType: "foot", move: Infinity, from: { x: 1, y: 3 } }, { x: 8, y: 2 }, new Set());
  assert.equal(none, null);

  // a blocked destination yields null
  const blocked = findPath(MAP, DEFS, { movementType: "fly", move: Infinity, from: { x: 1, y: 3 } }, { x: 7, y: 3 }, new Set(["7,3"]));
  assert.equal(blocked, null);
});

test("tileKey formats coordinates", () => {
  assert.equal(tileKey({ x: 3, y: 4 }), "3,4");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/grid/movement.test.ts`
Expected: FAIL, `./movement.ts` not found.

- [ ] **Step 3: Implement `src/grid/movement.ts`**

```ts
// Grid movement: reachable-tile computation and least-cost pathfinding, both
// via Dijkstra over per-movement-type terrain costs. Pure and deterministic.
import type { TerrainDef, ResolvedMap, MovementType, TileVec } from "./types.ts";
import { enterCost } from "./terrain.ts";

export function tileKey(t: TileVec): string {
  return `${t.x},${t.y}`;
}

export interface MoveOpts {
  movementType: MovementType;
  move: number;       // budget; pass Infinity for pathfinding regardless of range
  from: TileVec;
}

const DIRS: TileVec[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

function inBounds(map: ResolvedMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

// Least-cost distance from `from` to every reachable tile within `move`, plus
// predecessors for path reconstruction. Tiles in `blocked` cannot be entered.
function dijkstra(
  map: ResolvedMap, defs: Record<string, TerrainDef>, opts: MoveOpts, blocked: Set<string>,
): { cost: Map<string, number>; prev: Map<string, TileVec> } {
  const cost = new Map<string, number>();
  const prev = new Map<string, TileVec>();
  const startKey = tileKey(opts.from);
  cost.set(startKey, 0);
  // Small binary-heap-free priority queue: fine for these map sizes.
  const frontier: { t: TileVec; c: number }[] = [{ t: opts.from, c: 0 }];
  while (frontier.length) {
    frontier.sort((a, b) => a.c - b.c);
    const cur = frontier.shift()!;
    if (cur.c > (cost.get(tileKey(cur.t)) ?? Infinity)) continue;
    for (const d of DIRS) {
      const nx = cur.t.x + d.x, ny = cur.t.y + d.y;
      if (!inBounds(map, nx, ny)) continue;
      const key = `${nx},${ny}`;
      if (blocked.has(key)) continue;
      const step = enterCost(defs, map.terrain[ny][nx], opts.movementType);
      if (step == null) continue;
      const nc = cur.c + step;
      if (nc <= opts.move && nc < (cost.get(key) ?? Infinity)) {
        cost.set(key, nc);
        prev.set(key, cur.t);
        frontier.push({ t: { x: nx, y: ny }, c: nc });
      }
    }
  }
  return { cost, prev };
}

// The set of tiles reachable within budget, with their costs.
export function computeReachable(
  map: ResolvedMap, defs: Record<string, TerrainDef>, opts: MoveOpts, blocked: Set<string>,
): { tiles: Set<string>; costs: Map<string, number> } {
  const { cost } = dijkstra(map, defs, opts, blocked);
  return { tiles: new Set(cost.keys()), costs: cost };
}

export interface PathResult {
  path: TileVec[]; // from start tile to destination, inclusive
  cost: number;
}

// Least-cost path to `to`, or null if unreachable within `opts.move` or blocked.
export function findPath(
  map: ResolvedMap, defs: Record<string, TerrainDef>, opts: MoveOpts, to: TileVec, blocked: Set<string>,
): PathResult | null {
  const toKey = tileKey(to);
  if (blocked.has(toKey)) return null;
  const { cost, prev } = dijkstra(map, defs, opts, blocked);
  if (!cost.has(toKey)) return null;
  const path: TileVec[] = [];
  let curKey: string | undefined = toKey;
  let cur: TileVec | undefined = to;
  while (cur) {
    path.unshift(cur);
    const p = prev.get(tileKey(cur));
    cur = p;
    curKey = p ? tileKey(p) : undefined;
    if (curKey === tileKey(opts.from)) { path.unshift(opts.from); break; }
  }
  return { path, cost: cost.get(toKey)! };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/grid/movement.test.ts`
Expected: PASS, 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/grid/movement.ts src/grid/movement.test.ts
git commit -m "feat: grid reachable set and least-cost pathfinding"
```

---

## Task 4: Combat terrain support and one-exchange resolver

**Files:**
- Modify: `src/combat.ts`
- Test: `src/exchange.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/exchange.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMatchup, resolveExchange } from "./combat.ts";
import { makeRng } from "./rng.ts";
import type { Combatant, UnitDef, WeaponDef } from "./types.ts";

function unit(over: Partial<UnitDef>): UnitDef {
  return { name: "U", hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 0, def: 5, res: 0, con: 5, ...over };
}
function weapon(over: Partial<WeaponDef>): WeaponDef {
  return { name: "W", type: "sword", rank: "E", might: 5, hit: 90, crit: 0, weight: 5, ...over };
}
function fighter(id: string, u: UnitDef, w: WeaponDef): Combatant {
  return { id, unit: u, weaponId: "w", weapon: w };
}

test("terrain avoid and def change the matchup", () => {
  const atk = fighter("a", unit({ str: 10, skl: 10, spd: 10, lck: 0 }), weapon({ type: "sword", hit: 100 }));
  const def = fighter("d", unit({ def: 5, spd: 5, lck: 0 }), weapon({ type: "axe" }));
  const plain = computeMatchup(atk, def);
  const onForest = computeMatchup(atk, def, { avoid: 20, def: 1 });
  assert.equal(onForest.displayedHit, plain.displayedHit - 20);
  assert.equal(onForest.damage, plain.damage - 1);
});

test("Slice A callers with no terrain get identical numbers (regression)", () => {
  const atk = fighter("a", unit({ str: 9, skl: 13, spd: 15, lck: 12 }), weapon({ type: "sword", might: 5, hit: 90 }));
  const def = fighter("d", unit({ def: 11, spd: 9, lck: 2, con: 13 }), weapon({ type: "lance", might: 7, hit: 80, weight: 8 }));
  const a = computeMatchup(atk, def);
  const b = computeMatchup(atk, def, { avoid: 0, def: 0 });
  assert.deepEqual(a, b);
});

test("resolveExchange runs attacker, counter, and doubles, and is seed-stable", () => {
  const atk = fighter("hero", unit({ hp: 24, str: 10, skl: 12, spd: 16, lck: 6 }), weapon({ type: "sword", hit: 90 }));
  const def = fighter("foe", unit({ hp: 20, str: 8, skl: 6, spd: 8, def: 4, lck: 1 }), weapon({ type: "axe", hit: 75 }));
  const args = () => ({
    attacker: atk, defender: def, attackerHp: 24, defenderHp: 20,
    defenderCanCounter: true, rng: makeRng(3),
  });
  const r1 = resolveExchange(args());
  const r2 = resolveExchange(args());
  assert.deepEqual(r1, r2);
  // attacker has higher AS (16 vs 8), so it doubles: at least 2 attacker events.
  const attackerHits = r1.events.filter((e) => e.attackerId === "hero");
  assert.ok(attackerHits.length >= 2);
});

test("resolveExchange with no counter leaves the attacker unharmed", () => {
  const atk = fighter("hero", unit({ hp: 24, str: 20 }), weapon({ type: "sword", hit: 100 }));
  const def = fighter("foe", unit({ hp: 20, def: 0 }), weapon({ type: "axe", hit: 100 }));
  const r = resolveExchange({ attacker: atk, defender: def, attackerHp: 24, defenderHp: 20, defenderCanCounter: false, rng: makeRng(1) });
  assert.equal(r.attackerHp, 24);
  assert.ok(r.events.every((e) => e.attackerId === "hero"));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/exchange.test.ts`
Expected: FAIL, `resolveExchange` not exported (and computeMatchup rejects a third argument).

- [ ] **Step 3: Modify `computeMatchup` in `src/combat.ts`**

Change the imports at the top of `src/combat.ts` to also bring in `TerrainMod`:

```ts
import type {
  Combatant, Matchup, WeaponType,
  DeterministicReport, MonteCarloReport, TerrainMod,
} from "./types.ts";
```

Change the `computeMatchup` signature and the two lines that use terrain. The
new signature adds a defaulted terrain argument:

```ts
export function computeMatchup(
  attacker: Combatant, defender: Combatant,
  defenderTerrain: TerrainMod = { avoid: 0, def: 0 },
): Matchup {
```

Inside the function, change the damage line to add terrain def:

```ts
  const damage = Math.max(0, attack - (defenseStat + defenderTerrain.def));
```

And change the defender avoid line to add terrain avoid:

```ts
  const defenderAvoid = Math.max(0, attackSpeed(defender) * 2 + defender.unit.lck + defenderTerrain.avoid);
```

- [ ] **Step 4: Change `strike` to report hit and crit, update its callers**

Replace the existing private `strike` function in `src/combat.ts` with:

```ts
// One strike: roll 2RN to hit, then roll crit. Returns what happened so callers
// can both apply damage and log the result.
function strike(m: Matchup, rng: Rng): { hit: boolean; crit: boolean; damage: number } {
  if (!roll2RN(m.displayedHit, rng)) return { hit: false, crit: false, damage: 0 };
  const crit = rng.next100() < m.displayedCrit;
  return { hit: true, crit, damage: crit ? m.damage * 3 : m.damage };
}
```

In `simulateDuel`, update the four `strike(...)` call sites to use `.damage`.
They currently read like `eHp -= strike(pm, rng);` and must become:

```ts
    eHp -= strike(pm, rng).damage;
```
```ts
    pHp -= strike(em, rng).damage;
```
(both the initial and the doubling strikes: all four sites take `.damage`).

- [ ] **Step 5: Add `resolveExchange` to the end of `src/combat.ts`**

```ts
export interface ExchangeEvent {
  attackerId: string;
  defenderId: string;
  displayedHit: number;
  hit: boolean;
  crit: boolean;
  damage: number;
  defenderHpAfter: number;
}

export interface ExchangeArgs {
  attacker: Combatant;
  defender: Combatant;
  attackerHp: number;
  defenderHp: number;
  attackerTerrain?: TerrainMod; // terrain under the attacker (for counters)
  defenderTerrain?: TerrainMod; // terrain under the defender
  defenderCanCounter: boolean;  // defender is in range to strike back
  rng: Rng;
}

// One combat engagement: attacker strikes, defender counters if able and alive,
// then either side that doubles strikes again. Returns the event log and the
// resulting HP totals (floored at 0). Reuses computeMatchup and strike, so the
// numbers match the Tier 1 preview.
export function resolveExchange(a: ExchangeArgs): {
  events: ExchangeEvent[]; attackerHp: number; defenderHp: number;
} {
  const zero: TerrainMod = { avoid: 0, def: 0 };
  const atkM = computeMatchup(a.attacker, a.defender, a.defenderTerrain ?? zero);
  const defM = computeMatchup(a.defender, a.attacker, a.attackerTerrain ?? zero);
  let atkHp = a.attackerHp;
  let defHp = a.defenderHp;
  const events: ExchangeEvent[] = [];

  const attackerStrike = () => {
    const r = strike(atkM, a.rng);
    defHp = Math.max(0, defHp - r.damage);
    events.push({ attackerId: a.attacker.id, defenderId: a.defender.id, displayedHit: atkM.displayedHit, hit: r.hit, crit: r.crit, damage: r.damage, defenderHpAfter: defHp });
  };
  const defenderStrike = () => {
    const r = strike(defM, a.rng);
    atkHp = Math.max(0, atkHp - r.damage);
    events.push({ attackerId: a.defender.id, defenderId: a.attacker.id, displayedHit: defM.displayedHit, hit: r.hit, crit: r.crit, damage: r.damage, defenderHpAfter: atkHp });
  };

  attackerStrike();
  if (defHp > 0 && a.defenderCanCounter) defenderStrike();
  if (defHp > 0 && atkM.doubles) attackerStrike();
  if (atkHp > 0 && a.defenderCanCounter && defM.doubles) defenderStrike();

  return { events, attackerHp: atkHp, defenderHp: defHp };
}
```

- [ ] **Step 6: Run to verify the new tests and the whole suite pass**

Run: `node --test`
Expected: PASS, all Slice A tests plus the new exchange tests pass. If the
regression test fails, the terrain default is not being applied as zero: recheck
Step 3.

- [ ] **Step 7: Commit**

```bash
git add src/combat.ts src/exchange.test.ts
git commit -m "feat: terrain-aware matchups and one-exchange resolver"
```

---

## Task 5: Config data and grid datagen

**Files:**
- Create: `data/terrain.json`, `data/classes.json`
- Create: `maps/showcase-terrain.json`, `maps/river-crossing.json`, `maps/forest-hills.json`
- Create: `encounters/skirmish-01.json`
- Modify: `data/units.json`
- Create: `src/grid/datagen.ts`
- Test: `src/grid/datagen.test.ts`

- [ ] **Step 1: Create `data/terrain.json`**

```json
{
  "plains":   { "name": "Plains",   "moveCost": { "foot": 1, "cav": 1,    "fly": 1 }, "avoid": 0,  "def": 0 },
  "forest":   { "name": "Forest",   "moveCost": { "foot": 2, "cav": 3,    "fly": 1 }, "avoid": 20, "def": 1 },
  "mountain": { "name": "Mountain", "moveCost": { "foot": 3, "cav": null, "fly": 1 }, "avoid": 30, "def": 2 },
  "water":    { "name": "Water",    "moveCost": { "foot": null, "cav": null, "fly": 1 }, "avoid": 0, "def": 0 },
  "wall":     { "name": "Wall",     "moveCost": { "foot": null, "cav": null, "fly": null }, "avoid": 0, "def": 0 }
}
```

- [ ] **Step 2: Create `data/classes.json`**

```json
{
  "infantry": { "name": "Infantry", "movementType": "foot", "move": 5 },
  "cavalier": { "name": "Cavalier", "movementType": "cav",  "move": 7 },
  "flier":    { "name": "Flier",    "movementType": "fly",  "move": 7 }
}
```

- [ ] **Step 3: Add `class` to `data/units.json`**

Replace the file contents with:

```json
{
  "eirika-t": { "name": "Eirika", "class": "infantry", "hp": 24, "str": 9, "mag": 3, "skl": 13, "spd": 15, "lck": 12, "def": 7, "res": 6, "con": 5 },
  "wyvern-1": { "name": "Wyvern Rider", "class": "flier", "hp": 30, "str": 12, "mag": 0, "skl": 8, "spd": 9, "lck": 2, "def": 11, "res": 2, "con": 13 }
}
```

- [ ] **Step 4: Create the three maps**

`maps/showcase-terrain.json`:

```json
{
  "id": "showcase-terrain",
  "legend": { ".": "plains", "f": "forest", "^": "mountain", "~": "water", "#": "wall" },
  "tiles": [
    ".....^...~.",
    "...ff^...~.",
    "...ff^...~.",
    "...ff^.....",
    "...ff^...~.",
    ".....^...~.",
    ".........~."
  ]
}
```

`maps/river-crossing.json`:

```json
{
  "id": "river-crossing",
  "legend": { ".": "plains", "f": "forest", "^": "mountain", "~": "water", "#": "wall" },
  "tiles": [
    "....~.....",
    "....~.....",
    "....~.....",
    "..........",
    "....~.....",
    "....~.....",
    "....~....."
  ]
}
```

`maps/forest-hills.json`:

```json
{
  "id": "forest-hills",
  "legend": { ".": "plains", "f": "forest", "^": "mountain", "~": "water", "#": "wall" },
  "tiles": [
    "..fff..^^.",
    "..fff..^^.",
    "....f...^.",
    "..........",
    ".^^...ff..",
    ".^^...ff..",
    "......ff.."
  ]
}
```

- [ ] **Step 5: Create `encounters/skirmish-01.json`**

```json
{
  "id": "skirmish-01",
  "map": "showcase-terrain",
  "notes": "Grid proof: reach the flying Wyvern across terrain.",
  "player": { "unit": "eirika-t", "weapon": "iron-sword", "at": [1, 3] },
  "enemy":  { "unit": "wyvern-1", "weapon": "iron-lance", "at": [9, 3], "ai": "aggressive" },
  "win": "rout"
}
```

- [ ] **Step 6: Write the failing tests**

Create `src/grid/datagen.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGridEncounter } from "./datagen.ts";

test("loads and resolves the skirmish encounter", async () => {
  const enc = await loadGridEncounter("encounters/skirmish-01.json");
  assert.equal(enc.id, "skirmish-01");
  assert.equal(enc.map.width, 10);
  assert.equal(enc.map.height, 7);
  assert.equal(enc.map.terrain[3][5], "mountain");
  assert.equal(enc.player.unit.name, "Eirika");
  assert.equal(enc.player.cls.movementType, "foot");
  assert.deepEqual(enc.player.pos, { x: 1, y: 3 });
  assert.equal(enc.player.hp, 24);
  assert.equal(enc.enemy.cls.movementType, "fly");
  assert.equal(enc.enemy.ai, "aggressive");
});

test("a bad legend char fails loudly", async () => {
  await assert.rejects(
    () => loadGridEncounter("encounters/skirmish-01.json", {
      mapsDir: "src/grid", // wrong dir: no such map file
    }),
    /map|read|json/i,
  );
});

test("an unknown class fails loudly", async () => {
  await assert.rejects(
    () => loadGridEncounter("encounters/skirmish-01.json", {
      classesPath: "data/terrain.json", // valid json, but no class keys
    }),
    /class/i,
  );
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `node --test src/grid/datagen.test.ts`
Expected: FAIL, `./datagen.ts` not found.

- [ ] **Step 8: Create the pure resolver `src/grid/resolve.ts`**

This module has NO Node imports, so the browser client can import it. It turns
already-parsed JSON objects into a `GridEncounter`.

```ts
// Pure grid resolving: validate and combine already-parsed JSON (units, weapons,
// terrain, classes, map, encounter) into a GridEncounter. No node imports, so
// both the Node loader and the browser client can use it.
import type {
  TerrainDef, ClassDef, ResolvedMap, GridEncounter, GridUnit, MovementType, AiKind, Side,
} from "./types.ts";
import type { UnitDef, WeaponDef } from "../types.ts";

const MOVEMENT_TYPES: MovementType[] = ["foot", "cav", "fly"];

export function validateTerrainDefs(raw: any): Record<string, TerrainDef> {
  const out: Record<string, TerrainDef> = {};
  for (const [id, d] of Object.entries<any>(raw)) {
    if (typeof d?.name !== "string") throw new Error(`Terrain ${id} missing name`);
    if (!d.moveCost) throw new Error(`Terrain ${id} missing moveCost`);
    for (const mt of MOVEMENT_TYPES) {
      const c = d.moveCost[mt];
      if (!(c === null || typeof c === "number")) throw new Error(`Terrain ${id} moveCost.${mt} must be number or null`);
    }
    if (typeof d.avoid !== "number" || typeof d.def !== "number") throw new Error(`Terrain ${id} needs numeric avoid and def`);
    out[id] = d as TerrainDef;
  }
  return out;
}

export function validateClasses(raw: any): Record<string, ClassDef> {
  const out: Record<string, ClassDef> = {};
  for (const [id, c] of Object.entries<any>(raw)) {
    if (typeof c?.name !== "string") throw new Error(`Class ${id} missing name`);
    if (!MOVEMENT_TYPES.includes(c.movementType)) throw new Error(`Class ${id} invalid movementType: ${c.movementType}`);
    if (typeof c.move !== "number") throw new Error(`Class ${id} missing numeric move`);
    out[id] = c as ClassDef;
  }
  return out;
}

export function resolveMap(raw: any, terrainDefs: Record<string, TerrainDef>): ResolvedMap {
  if (!Array.isArray(raw?.tiles) || raw.tiles.length === 0) throw new Error(`Map ${raw?.id} has no tiles`);
  const legend: Record<string, string> = raw.legend ?? {};
  const width = raw.tiles[0].length;
  const terrain: string[][] = raw.tiles.map((row: string, y: number) => {
    if (row.length !== width) throw new Error(`Map ${raw.id} row ${y} has wrong width`);
    return [...row].map((ch) => {
      const id = legend[ch];
      if (!id) throw new Error(`Map ${raw.id} legend has no entry for '${ch}'`);
      if (!terrainDefs[id]) throw new Error(`Map ${raw.id} references unknown terrain '${id}'`);
      return id;
    });
  });
  return { id: raw.id, width, height: raw.tiles.length, terrain };
}

function buildUnit(
  side: Side, ref: any, units: Record<string, any>, weapons: Record<string, any>,
  classes: Record<string, ClassDef>,
): GridUnit {
  const unit = units[ref?.unit];
  if (!unit) throw new Error(`${side} references unknown unit: ${ref?.unit}`);
  const weapon = weapons[ref?.weapon];
  if (!weapon) throw new Error(`${side} references unknown weapon: ${ref?.weapon}`);
  const cls = classes[unit.class];
  if (!cls) throw new Error(`${side} unit references unknown class: ${unit.class}`);
  if (!Array.isArray(ref.at) || ref.at.length !== 2) throw new Error(`${side} needs an "at": [x, y]`);
  const ai: AiKind = ref.ai === "stationary" ? "stationary" : "aggressive";
  return { id: ref.unit, side, unit: unit as UnitDef, weapon: weapon as WeaponDef, cls, ai, pos: { x: ref.at[0], y: ref.at[1] }, hp: unit.hp };
}

export function resolveGridEncounter(
  rawEnc: any, rawUnits: any, rawWeapons: any, rawTerrain: any, rawClasses: any, rawMap: any,
): GridEncounter {
  if (typeof rawEnc?.id !== "string" || typeof rawEnc?.map !== "string") {
    throw new Error(`Encounter needs string id and map`);
  }
  const terrainDefs = validateTerrainDefs(rawTerrain);
  const classes = validateClasses(rawClasses);
  const map = resolveMap(rawMap, terrainDefs);
  const player = buildUnit("player", rawEnc.player, rawUnits, rawWeapons, classes);
  const enemy = buildUnit("enemy", rawEnc.enemy, rawUnits, rawWeapons, classes);
  return { id: rawEnc.id, win: rawEnc.win ?? "rout", map, terrainDefs, player, enemy };
}
```

- [ ] **Step 9: Implement the Node loader `src/grid/datagen.ts` as a thin wrapper**

```ts
// Node-side loader: read the config files, then hand the parsed objects to the
// pure resolver. Uses node:fs, so this file is imported only by Node (tests and
// any headless tools), never by the browser client.
import { readFile } from "node:fs/promises";
import { resolveGridEncounter } from "./resolve.ts";
import type { GridEncounter } from "./types.ts";

async function readJson(path: string): Promise<any> {
  let text: string;
  try { text = await readFile(path, "utf8"); }
  catch { throw new Error(`Cannot read config file: ${path}`); }
  try { return JSON.parse(text); }
  catch (e) { throw new Error(`Invalid JSON in ${path}: ${(e as Error).message}`); }
}

export interface GridLoadPaths {
  unitsPath?: string;
  weaponsPath?: string;
  terrainPath?: string;
  classesPath?: string;
  mapsDir?: string;
}

export async function loadGridEncounter(encounterPath: string, paths: GridLoadPaths = {}): Promise<GridEncounter> {
  const rawEnc = await readJson(encounterPath);
  const rawUnits = await readJson(paths.unitsPath ?? "data/units.json");
  const rawWeapons = await readJson(paths.weaponsPath ?? "data/weapons.json");
  const rawTerrain = await readJson(paths.terrainPath ?? "data/terrain.json");
  const rawClasses = await readJson(paths.classesPath ?? "data/classes.json");
  const rawMap = await readJson(`${paths.mapsDir ?? "maps"}/${rawEnc.map}.json`);
  return resolveGridEncounter(rawEnc, rawUnits, rawWeapons, rawTerrain, rawClasses, rawMap);
}
```

- [ ] **Step 10: Run to verify it passes**

Run: `node --test src/grid/datagen.test.ts`
Expected: PASS, 3 tests passed. Run from the repo root so relative paths resolve.
The "unknown class" test points `classesPath` at `data/terrain.json`, so class
lookup fails inside `resolveGridEncounter` with a `/class/i` error. The "bad map"
test points `mapsDir` at `src/grid`, so the map file cannot be read and the
loader throws a `/read/i` error.

- [ ] **Step 11: Commit**

```bash
git add data/ maps/ encounters/skirmish-01.json src/grid/resolve.ts src/grid/datagen.ts src/grid/datagen.test.ts
git commit -m "feat: grid config data, pure resolver, and Node loader"
```

---

## Task 6: Enemy and auto-player AI

**Files:**
- Create: `src/grid/ai.ts`
- Test: `src/grid/ai.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/grid/ai.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAction } from "./ai.ts";
import type { GridEncounter, GridUnit, TerrainDef, ResolvedMap } from "./types.ts";
import type { UnitDef, WeaponDef } from "../types.ts";

const DEFS: Record<string, TerrainDef> = {
  plains: { name: "Plains", moveCost: { foot: 1, cav: 1, fly: 1 }, avoid: 0, def: 0 },
};
function openMap(w: number, h: number): ResolvedMap {
  return { id: "m", width: w, height: h, terrain: Array.from({ length: h }, () => new Array(w).fill("plains")) };
}
function unit(over: Partial<UnitDef>): UnitDef {
  return { name: "U", hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 0, def: 5, res: 0, con: 5, ...over };
}
function weapon(): WeaponDef { return { name: "W", type: "sword", rank: "E", might: 5, hit: 90, crit: 0, weight: 5 }; }
function gu(id: string, side: any, x: number, y: number, ai: any = "aggressive", move = 5): GridUnit {
  return { id, side, unit: unit({}), weapon: weapon(), cls: { name: "C", movementType: "foot", move }, ai, pos: { x, y }, hp: 20 };
}
function enc(player: GridUnit, enemy: GridUnit): GridEncounter {
  return { id: "e", win: "rout", map: openMap(10, 3), terrainDefs: DEFS, player, enemy };
}

test("attacks a target already in range without moving", () => {
  const e = gu("foe", "enemy", 5, 1);
  const p = gu("hero", "player", 4, 1);
  const a = decideAction(enc(p, e), "foe");
  assert.deepEqual(a.to, { x: 5, y: 1 });
  assert.equal(a.attackTargetId, "hero");
});

test("aggressive moves adjacent to the target and attacks", () => {
  const e = gu("foe", "enemy", 9, 1, "aggressive", 5);
  const p = gu("hero", "player", 4, 1);
  const a = decideAction(enc(p, e), "foe");
  // nearest reachable tile adjacent to the player is (5,1), 4 tiles away.
  assert.deepEqual(a.to, { x: 5, y: 1 });
  assert.equal(a.attackTargetId, "hero");
});

test("aggressive approaches when it cannot reach, without attacking", () => {
  const e = gu("foe", "enemy", 9, 1, "aggressive", 2);
  const p = gu("hero", "player", 0, 1);
  const a = decideAction(enc(p, e), "foe");
  assert.equal(a.attackTargetId, null);
  assert.deepEqual(a.to, { x: 7, y: 1 }); // moved 2 toward the player
});

test("stationary never moves and only attacks in range", () => {
  const far = decideAction(enc(gu("hero", "player", 0, 1), gu("foe", "enemy", 9, 1, "stationary")), "foe");
  assert.deepEqual(far.to, { x: 9, y: 1 });
  assert.equal(far.attackTargetId, null);

  const near = decideAction(enc(gu("hero", "player", 8, 1), gu("foe", "enemy", 9, 1, "stationary")), "foe");
  assert.equal(near.attackTargetId, "hero");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/grid/ai.test.ts`
Expected: FAIL, `./ai.ts` not found.

- [ ] **Step 3: Implement `src/grid/ai.ts`**

```ts
// Decide a unit's action for a phase: attack a target in range, otherwise (for
// aggressive AI) move to the cheapest tile adjacent to the target and attack, or
// approach as far as possible. Stationary AI never moves. Pure and deterministic.
import type { GridEncounter, GridUnit, TileVec } from "./types.ts";
import { computeReachable, findPath, tileKey } from "./movement.ts";
import { weaponRange, manhattan } from "./range.ts";

export interface AiAction {
  to: TileVec;                    // where the unit should end up (may equal its current tile)
  attackTargetId: string | null; // whom to attack after moving, or null
}

function other(enc: GridEncounter, unitId: string): GridUnit {
  return enc.player.id === unitId ? enc.enemy : enc.player;
}
function self(enc: GridEncounter, unitId: string): GridUnit {
  return enc.player.id === unitId ? enc.player : enc.enemy;
}

export function decideAction(enc: GridEncounter, unitId: string): AiAction {
  const me = self(enc, unitId);
  const target = other(enc, unitId);
  const range = weaponRange(me.weapon);

  // Already in range from the current tile?
  if (manhattan(me.pos, target.pos) <= range) {
    return { to: me.pos, attackTargetId: target.id };
  }
  if (me.ai === "stationary") {
    return { to: me.pos, attackTargetId: null };
  }

  const blocked = new Set<string>([tileKey(target.pos)]);
  const opts = { movementType: me.cls.movementType, move: me.cls.move, from: me.pos };
  const { tiles } = computeReachable(enc.map, enc.terrainDefs, opts, blocked);

  // Prefer the cheapest reachable tile from which the target is in range.
  let best: { to: TileVec; cost: number } | null = null;
  for (const key of tiles) {
    const [x, y] = key.split(",").map(Number);
    const tile = { x, y };
    if (manhattan(tile, target.pos) <= range) {
      const p = findPath(enc.map, enc.terrainDefs, opts, tile, blocked);
      if (p && (!best || p.cost < best.cost)) best = { to: tile, cost: p.cost };
    }
  }
  if (best) return { to: best.to, attackTargetId: target.id };

  // Cannot reach striking distance: approach along the cheapest path to any tile
  // adjacent to the target, truncated to the movement budget.
  const approach = approachTile(enc, me, target, blocked);
  return { to: approach, attackTargetId: null };
}

function approachTile(enc: GridEncounter, me: GridUnit, target: GridUnit, blocked: Set<string>): TileVec {
  // Full-cost path to the cheapest tile adjacent to the target, ignoring budget.
  const opts = { movementType: me.cls.movementType, move: Infinity, from: me.pos };
  const range = weaponRange(me.weapon);
  const adj: TileVec[] = [];
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (Math.abs(dx) + Math.abs(dy) === 0) continue;
      if (Math.abs(dx) + Math.abs(dy) <= range) adj.push({ x: target.pos.x + dx, y: target.pos.y + dy });
    }
  }
  let bestPath: TileVec[] | null = null;
  let bestCost = Infinity;
  for (const t of adj) {
    const p = findPath(enc.map, enc.terrainDefs, opts, t, blocked);
    if (p && p.cost < bestCost) { bestCost = p.cost; bestPath = p.path; }
  }
  if (!bestPath) return me.pos; // fully cut off: hold

  // Walk along the path spending at most the movement budget.
  let spent = 0;
  let landing = me.pos;
  for (let i = 1; i < bestPath.length; i++) {
    const step = enterStep(enc, me, bestPath[i]);
    if (step == null || spent + step > me.cls.move) break;
    spent += step;
    landing = bestPath[i];
  }
  return landing;
}

function enterStep(enc: GridEncounter, me: GridUnit, t: TileVec): number | null {
  const id = enc.map.terrain[t.y][t.x];
  const c = enc.terrainDefs[id].moveCost[me.cls.movementType];
  return c;
}
```

- [ ] **Step 4: Create the shared range helpers `src/grid/range.ts`**

```ts
// Small shared helpers for range and distance, used by ai.ts and game.ts.
import type { WeaponDef } from "../types.ts";
import type { TileVec } from "./types.ts";

export function weaponRange(w: WeaponDef): number {
  return w.range ?? 1;
}

export function manhattan(a: TileVec, b: TileVec): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test src/grid/ai.test.ts`
Expected: PASS, 4 tests passed.

- [ ] **Step 6: Commit**

```bash
git add src/grid/ai.ts src/grid/range.ts src/grid/ai.test.ts
git commit -m "feat: enemy and auto-player AI decisions"
```

---

## Task 7: Turn state machine

**Files:**
- Create: `src/grid/game.ts`
- Test: `src/grid/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/grid/game.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGridEncounter } from "./datagen.ts";
import { createGame, reachableFor, applyMove, applyAttack, endPhase, status, takeAiTurn } from "./game.ts";
import { tileKey } from "./movement.ts";

async function game(seed = 1) {
  const enc = await loadGridEncounter("encounters/skirmish-01.json");
  return createGame(enc, seed);
}

test("reachable respects movement type and blocks the enemy tile", async () => {
  const g = await game();
  const r = reachableFor(g, "eirika-t");
  assert.ok(r.has("4,3"));       // foot can reach through the forest
  assert.ok(!r.has(tileKey(g.enemy.pos))); // cannot end on the enemy
});

test("applyMove rejects an unreachable tile", async () => {
  const g = await game();
  assert.throws(() => applyMove(g, "eirika-t", { x: 9, y: 0 }), /reachable/i);
});

test("applyMove moves the unit", async () => {
  const g = await game();
  applyMove(g, "eirika-t", { x: 4, y: 3 });
  assert.deepEqual(g.player.pos, { x: 4, y: 3 });
});

test("applyAttack resolves an exchange, logs it, and can end the game", async () => {
  const g = await game(7);
  // Put the units adjacent and give the player an overwhelming edge.
  g.player.pos = { x: 8, y: 3 };
  g.enemy.pos = { x: 9, y: 3 };
  g.player.unit.str = 99;
  applyAttack(g, "eirika-t", "wyvern-1");
  assert.ok(g.log.length > 0);
  assert.equal(g.enemy.hp, 0);
  assert.equal(status(g), "player-won");
});

test("endPhase toggles the active side", async () => {
  const g = await game();
  assert.equal(g.phase, "player");
  endPhase(g);
  assert.equal(g.phase, "enemy");
  endPhase(g);
  assert.equal(g.phase, "player");
});

test("a seeded auto-played skirmish is deterministic", async () => {
  async function run(seed: number) {
    const g = await game(seed);
    for (let i = 0; i < 40 && status(g) === "ongoing"; i++) {
      takeAiTurn(g, g.phase === "player" ? "eirika-t" : "wyvern-1");
      endPhase(g);
    }
    return { status: status(g), log: g.log };
  }
  assert.deepEqual(await run(5), await run(5));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/grid/game.test.ts`
Expected: FAIL, `./game.ts` not found.

- [ ] **Step 3: Implement `src/grid/game.ts`**

```ts
// The turn state machine. Holds mutable game state and exposes transitions the
// client calls. All randomness flows through a seeded RNG so runs replay.
import type { GridEncounter, GridUnit, TileVec, GameStatus, Side } from "./types.ts";
import { computeReachable, findPath, tileKey } from "./movement.ts";
import { terrainMod } from "./terrain.ts";
import { weaponRange, manhattan } from "./range.ts";
import { decideAction } from "./ai.ts";
import { resolveExchange } from "../combat.ts";
import { makeRng, type Rng } from "../rng.ts";
import type { Combatant } from "../types.ts";

export interface GameState {
  enc: GridEncounter;
  player: GridUnit;
  enemy: GridUnit;
  phase: Side;
  turn: number;
  seed: number;
  rng: Rng;
  log: string[];
}

export function createGame(enc: GridEncounter, seed: number): GameState {
  return {
    enc, player: enc.player, enemy: enc.enemy,
    phase: "player", turn: 1, seed, rng: makeRng(seed), log: [],
  };
}

function unitById(g: GameState, id: string): GridUnit {
  return g.player.id === id ? g.player : g.enemy;
}
function opponentOf(g: GameState, id: string): GridUnit {
  return g.player.id === id ? g.enemy : g.player;
}

// Reachable tiles for a unit this phase, optionally overriding its movement type
// (used by the showcase movement-type selector). The opposing unit blocks tiles.
export function reachableFor(g: GameState, id: string, overrideMove?: { movementType: any; move: number }): Set<string> {
  const u = unitById(g, id);
  const foe = opponentOf(g, id);
  const opts = {
    movementType: overrideMove?.movementType ?? u.cls.movementType,
    move: overrideMove?.move ?? u.cls.move,
    from: u.pos,
  };
  return computeReachable(g.enc.map, g.enc.terrainDefs, opts, new Set([tileKey(foe.pos)])).tiles;
}

export function pathFor(g: GameState, id: string, to: TileVec) {
  const u = unitById(g, id);
  const foe = opponentOf(g, id);
  const opts = { movementType: u.cls.movementType, move: u.cls.move, from: u.pos };
  return findPath(g.enc.map, g.enc.terrainDefs, opts, to, new Set([tileKey(foe.pos)]));
}

export function applyMove(g: GameState, id: string, to: TileVec): void {
  if (!reachableFor(g, id).has(tileKey(to))) {
    throw new Error(`tile ${tileKey(to)} is not reachable for ${id}`);
  }
  unitById(g, id).pos = to;
}

function combatant(u: GridUnit): Combatant {
  return { id: u.id, unit: u.unit, weaponId: u.weapon.name, weapon: u.weapon };
}

export function applyAttack(g: GameState, attackerId: string, targetId: string): void {
  const attacker = unitById(g, attackerId);
  const target = unitById(g, targetId);
  const range = weaponRange(attacker.weapon);
  if (manhattan(attacker.pos, target.pos) > range) {
    throw new Error(`${attackerId} is not in range of ${targetId}`);
  }
  const defenderCanCounter = manhattan(attacker.pos, target.pos) <= weaponRange(target.weapon);
  const atkTerrainId = g.enc.map.terrain[attacker.pos.y][attacker.pos.x];
  const defTerrainId = g.enc.map.terrain[target.pos.y][target.pos.x];

  const result = resolveExchange({
    attacker: combatant(attacker),
    defender: combatant(target),
    attackerHp: attacker.hp,
    defenderHp: target.hp,
    attackerTerrain: terrainMod(g.enc.terrainDefs, atkTerrainId),
    defenderTerrain: terrainMod(g.enc.terrainDefs, defTerrainId),
    defenderCanCounter,
    rng: g.rng,
  });
  attacker.hp = result.attackerHp;
  target.hp = result.defenderHp;
  for (const e of result.events) {
    const who = e.attackerId === attacker.id ? attacker : target;
    const whom = e.defenderId === attacker.id ? attacker : target;
    g.log.push(
      e.hit
        ? `${who.unit.name} hit ${whom.unit.name} for ${e.damage}${e.crit ? " (crit)" : ""} [${e.displayedHit}%], ${whom.unit.name} HP ${e.defenderHpAfter}`
        : `${who.unit.name} missed ${whom.unit.name} [${e.displayedHit}%]`,
    );
  }
}

export function endPhase(g: GameState): void {
  if (g.phase === "enemy") g.turn += 1;
  g.phase = g.phase === "player" ? "enemy" : "player";
}

export function status(g: GameState): GameStatus {
  if (g.enemy.hp <= 0) return "player-won";
  if (g.player.hp <= 0) return "player-lost";
  return "ongoing";
}

// Run one unit's turn by AI: move to the decided tile, then attack if planned.
export function takeAiTurn(g: GameState, id: string): void {
  if (status(g) !== "ongoing") return;
  const action = decideAction(g.enc, id);
  const u = unitById(g, id);
  if (!(action.to.x === u.pos.x && action.to.y === u.pos.y)) {
    // The AI only proposes reachable tiles; guard anyway.
    if (reachableFor(g, id).has(tileKey(action.to))) u.pos = action.to;
  }
  if (action.attackTargetId) applyAttack(g, id, action.attackTargetId);
}
```

Note: `takeAiTurn` reads the encounter's live units through `g.enc.player` and
`g.enc.enemy`, which are the same objects as `g.player` and `g.enemy` (set in
`createGame`), so AI decisions see current positions and HP.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/grid/game.test.ts`
Expected: PASS, 6 tests passed.

- [ ] **Step 5: Run the whole suite**

Run: `node --test`
Expected: PASS, every test across Slice A and Slice B so far passes.

- [ ] **Step 6: Commit**

```bash
git add src/grid/game.ts src/grid/game.test.ts
git commit -m "feat: grid turn state machine"
```

---

## Task 8: Sprite and tile rendering

**Files:**
- Create: `src/grid/render.ts`
- Test: `src/grid/render.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/grid/render.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { terrainSprite, unitSprite, TILE_COLORS } from "./render.ts";

test("terrain sprites include the expected motif", () => {
  assert.match(terrainSprite("forest", 0, 0, 64, 1, 1), /polygon/);   // pine triangles
  assert.match(terrainSprite("water", 0, 0, 64, 1, 1), /path/);       // waves
  assert.match(terrainSprite("mountain", 0, 0, 64, 1, 1), /polygon/); // peaks
  assert.equal(terrainSprite("plains", 0, 0, 64, 1, 1).includes("path") || terrainSprite("plains", 0, 0, 64, 1, 1).includes("stroke"), true);
});

test("terrain variation differs by tile coordinates", () => {
  const a = terrainSprite("forest", 0, 0, 64, 1, 1);
  const b = terrainSprite("forest", 0, 0, 64, 8, 2);
  assert.notEqual(a, b);
});

test("unit sprites distinguish movement types", () => {
  const foot = unitSprite("foot", 32, 32, 64, 24, "#2b6cff");
  const cav = unitSprite("cav", 32, 32, 64, 24, "#2b6cff");
  const fly = unitSprite("fly", 32, 32, 64, 30, "#e0453b");
  assert.match(cav, /ellipse/);   // horse body
  assert.match(fly, /ellipse/);   // hover shadow
  assert.notEqual(foot, cav);
  assert.notEqual(cav, fly);
  assert.match(fly, /30/);        // HP number rendered
});

test("TILE_COLORS covers the terrain palette", () => {
  for (const id of ["plains", "forest", "mountain", "water", "wall"]) {
    assert.ok(TILE_COLORS[id], `missing color for ${id}`);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/grid/render.test.ts`
Expected: FAIL, `./render.ts` not found.

- [ ] **Step 3: Implement `src/grid/render.ts`**

```ts
// Pure SVG builders for tiles, terrain sprites, and unit sprites. No DOM. The
// client stitches these into a board. Terrain sprites carry small deterministic
// per-tile variation so the map does not look stamped.

export const TILE_COLORS: Record<string, string> = {
  plains: "#bcd98f", forest: "#7ba85f", mountain: "#b9a684", water: "#5fa8e0", wall: "#5b524a",
};

// Deterministic 0..1 variation from tile coordinates and a salt.
function vary(x: number, y: number, salt: number): number {
  const h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(salt + 1, 83492791)) >>> 0;
  return (h % 1000) / 1000;
}

function pine(cx: number, footY: number, s: number, v: number, hue: string): string {
  const u = s / 64, H0 = (30 + v * 12) * u, halfW = (13 + v * 3) * u;
  let out = `<rect x="${cx - 2 * u}" y="${footY - 2 * u}" width="${4 * u}" height="${9 * u}" fill="#6b4a2b"/>`;
  for (let i = 0; i < 3; i++) {
    const by = footY - i * (H0 * 0.30), ty = by - H0 * 0.55, hw = halfW * (1 - i * 0.24);
    out += `<polygon points="${cx - hw},${by} ${cx + hw},${by} ${cx},${ty}" fill="${hue}"/>`;
  }
  return out;
}

// A terrain sprite positioned at tile origin (ox, oy) of size s, for tile (x, y).
export function terrainSprite(id: string, ox: number, oy: number, s: number, x: number, y: number): string {
  const u = s / 64, S = (n: number) => n * u;
  const g = (inner: string) => `<g transform="translate(${ox},${oy})">${inner}</g>`;
  if (id === "plains") {
    const n = 2 + Math.floor(vary(x, y, 1) * 3);
    let t = "";
    for (let i = 0; i < n; i++) {
      const gx = S(10 + vary(x, y, i + 2) * 44), gy = S(46 + vary(x, y, i + 7) * 8), hh = S(6 + vary(x, y, i + 5) * 5);
      t += `<path d="M${gx},${gy} l${S(2.5)},${-hh} l${S(2.5)},${hh}" stroke="#7fae55" stroke-width="${S(2)}" fill="none"/>`;
    }
    return g(t);
  }
  if (id === "forest") {
    const hue = ["#2f5d2a", "#356a30", "#295426"][Math.floor(vary(x, y, 9) * 3)];
    let out = pine(S(32) + (vary(x, y, 3) - 0.5) * S(6), S(56), s, vary(x, y, 4), hue);
    if (vary(x, y, 8) > 0.55) out += pine(S(16 + vary(x, y, 6) * 8), S(54), s * 0.7, vary(x, y, 5), hue);
    return g(out);
  }
  if (id === "mountain") {
    const a = vary(x, y, 1), b = vary(x, y, 2);
    return g(
      `<polygon points="${S(8)},${S(54)} ${S(24 + a * 4)},${S(16 + a * 8)} ${S(40)},${S(54)}" fill="#7d7266"/>` +
      `<polygon points="${S(30)},${S(54)} ${S(44 + b * 4)},${S(26 + b * 6)} ${S(58)},${S(54)}" fill="#8a7f72"/>` +
      `<polygon points="${S(19 + a * 4)},${S(29)} ${S(24 + a * 4)},${S(16 + a * 8)} ${S(29 + a * 4)},${S(29)}" fill="#f4f4f2"/>`,
    );
  }
  if (id === "water") {
    const ph = vary(x, y, 1) * 8;
    const wave = (yy: number) => `<path d="M${S(6 + ph)},${S(yy)} q${S(8)},${S(-6)} ${S(16)},0 q${S(8)},${S(6)} ${S(16)},0 q${S(8)},${S(-6)} ${S(16)},0" stroke="#cdeafd" stroke-width="${S(2.5)}" fill="none" stroke-linecap="round"/>`;
    return g(wave(22 + ph) + wave(38) + wave(52 - ph * 0.5));
  }
  if (id === "wall") {
    return g(`<g stroke="#3f3831" stroke-width="${S(2)}"><line x1="0" y1="${S(21)}" x2="${s}" y2="${S(21)}"/><line x1="0" y1="${S(42)}" x2="${s}" y2="${S(42)}"/><line x1="${S(20)}" y1="0" x2="${S(20)}" y2="${S(21)}"/><line x1="${S(44)}" y1="0" x2="${S(44)}" y2="${S(21)}"/><line x1="${S(32)}" y1="${S(21)}" x2="${S(32)}" y2="${S(42)}"/><line x1="${S(20)}" y1="${S(42)}" x2="${S(20)}" y2="${s}"/><line x1="${S(44)}" y1="${S(42)}" x2="${S(44)}" y2="${s}"/></g>`);
  }
  return "";
}

// A unit token centered at (cx, cy) in a tile of size s, with an HP number and a
// movement-type mark. kind is "foot" | "cav" | "fly".
export function unitSprite(kind: string, cx: number, cy: number, s: number, hp: number, color: string): string {
  const u = s / 64, S = (n: number) => n * u;
  const dark = color === "#2b6cff" ? "#1f4fbf" : "#a82f27";
  if (kind === "cav") {
    const body = `<g fill="${dark}">
      <ellipse cx="${cx}" cy="${cy + S(9)}" rx="${S(20)}" ry="${S(9)}"/>
      <path d="M${cx + S(14)},${cy + S(4)} q${S(10)},${S(-2)} ${S(11)},${S(-14)} l${S(-5)},${S(-1)} q${S(-2)},${S(9)} ${S(-10)},${S(9)} z"/>
      <rect x="${cx - S(15)}" y="${cy + S(14)}" width="${S(3.5)}" height="${S(12)}"/>
      <rect x="${cx - S(6)}" y="${cy + S(14)}" width="${S(3.5)}" height="${S(12)}"/>
      <rect x="${cx + S(4)}" y="${cy + S(14)}" width="${S(3.5)}" height="${S(12)}"/>
      <rect x="${cx + S(13)}" y="${cy + S(14)}" width="${S(3.5)}" height="${S(12)}"/></g>`;
    const token = `<circle cx="${cx}" cy="${cy - S(6)}" r="${S(13)}" fill="${color}" stroke="#0006" stroke-width="${S(1.5)}"/>`;
    return `${body}${token}<text x="${cx}" y="${cy - S(2)}" font-size="${S(12)}" fill="#fff" text-anchor="middle" font-family="system-ui" font-weight="600">${hp}</text>`;
  }
  if (kind === "fly") {
    const body = `<ellipse cx="${cx}" cy="${cy + S(22)}" rx="${S(15)}" ry="${S(4)}" fill="#00000033"/>
      <path d="M${cx - S(4)},${cy} q${S(-26)},${S(-16)} ${S(-30)},${S(4)} q${S(18)},${S(2)} ${S(30)},${S(6)} z" fill="${dark}"/>
      <path d="M${cx + S(4)},${cy} q${S(26)},${S(-16)} ${S(30)},${S(4)} q${S(-18)},${S(2)} ${S(-30)},${S(6)} z" fill="${dark}"/>`;
    const token = `<circle cx="${cx}" cy="${cy}" r="${S(15)}" fill="${color}" stroke="#0006" stroke-width="${S(1.5)}"/>`;
    return `${body}${token}<text x="${cx}" y="${cy + S(5)}" font-size="${S(14)}" fill="#fff" text-anchor="middle" font-family="system-ui" font-weight="600">${hp}</text>`;
  }
  // foot
  const token = `<circle cx="${cx}" cy="${cy}" r="${S(18)}" fill="${color}" stroke="#0006" stroke-width="${S(1.5)}"/>`;
  return `${token}<text x="${cx}" y="${cy + S(5)}" font-size="${S(14)}" fill="#fff" text-anchor="middle" font-family="system-ui" font-weight="600">${hp}</text>`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/grid/render.test.ts`
Expected: PASS, 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/grid/render.ts src/grid/render.test.ts
git commit -m "feat: pure SVG tile and unit sprite builders"
```

---

## Task 9: Server support for the Play view

**Files:**
- Modify: `src/server.ts`
- Test: `src/server.test.ts`

- [ ] **Step 1: Add a failing test for the static-path allow rule**

Append to `src/server.test.ts`:

```ts
import { staticAllowed } from "./server.ts";

test("staticAllowed permits the known roots and rejects traversal", () => {
  assert.equal(staticAllowed("src/game/client.ts"), true);
  assert.equal(staticAllowed("data/terrain.json"), true);
  assert.equal(staticAllowed("maps/showcase-terrain.json"), true);
  assert.equal(staticAllowed("encounters/skirmish-01.json"), true);
  assert.equal(staticAllowed("../secret"), false);
  assert.equal(staticAllowed("etc/passwd"), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/server.test.ts`
Expected: FAIL, `staticAllowed` not exported.

- [ ] **Step 3: Add `staticAllowed` and use it in `src/server.ts`**

Add this exported function near `safeConfigPath`:

```ts
// Roots the server may read static files from.
export function staticAllowed(p: string): boolean {
  if (p.includes("..")) return false;
  const norm = normalize(p).replace(/\\/g, "/");
  return ["src/", "data/", "encounters/", "maps/"].some((root) => norm.startsWith(root));
}
```

Replace the inline static-route allow check in the request handler. The current
code reads:

```ts
      const norm = normalize(filePath).replace(/\\/g, "/");
      const allowed =
        norm.startsWith("src/") || norm.startsWith("data/") || norm.startsWith("encounters/");
      if (norm.includes("..") || !allowed) {
        res.writeHead(404); res.end("not found"); return;
      }
```

Change it to:

```ts
      const norm = normalize(filePath).replace(/\\/g, "/");
      if (!staticAllowed(norm)) {
        res.writeHead(404); res.end("not found"); return;
      }
```

- [ ] **Step 4: Let the server open a chosen page and tolerate an already-running instance**

In `startServer`, change the `listen` callback to open a page path from argv
(default "/"), and add an error handler for a port already in use. Replace the
`server.listen(...)` block with:

```ts
  const openPath = process.argv[2] && process.argv[2].startsWith("/") ? process.argv[2] : "/";

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      // A server is already running (for example the editor). Just open the page.
      console.log(`Editor already running, opening ${openPath}`);
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
```

- [ ] **Step 5: Run the server tests and confirm the suite still passes**

Run: `node --test src/server.test.ts`
Expected: PASS, 5 tests passed (4 prior plus the new one).

- [ ] **Step 6: Commit**

```bash
git add src/server.ts src/server.test.ts
git commit -m "feat: server serves maps and can open a chosen page"
```

---

## Task 10: The Play view page and client

**Files:**
- Create: `src/game/index.html`
- Create: `src/game/client.ts`
- Modify: `src/editor/index.html`

- [ ] **Step 1: Create `src/game/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FEArchitect: Skirmish</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; padding: 1rem; }
    h1 { font-size: 1.1rem; margin: 0 0 0.5rem; }
    .layout { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
    .board { border: 1px solid #8888; border-radius: 6px; }
    .side { width: 320px; }
    .panel { border: 1px solid #8888; border-radius: 8px; padding: 0.6rem; margin-bottom: 0.6rem; }
    .controls { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    #log { height: 220px; overflow-y: auto; font-size: 0.8rem; white-space: pre-wrap; }
    .note { font-size: 0.8rem; opacity: 0.8; }
    a { font-size: 0.85rem; }
    button { padding: 0.3rem 0.6rem; }
  </style>
</head>
<body>
  <h1>FEArchitect: 1v1 skirmish</h1>
  <a href="/">Back to the stat editor</a>
  <div class="layout" style="margin-top:0.5rem">
    <svg id="board" class="board"></svg>
    <div class="side">
      <div class="panel controls">
        <button id="endTurn">End turn</button>
        <label><input type="checkbox" id="autoPlayer" /> auto play player</label>
      </div>
      <div class="panel controls">
        <label>Seed <input type="number" id="seed" value="1" style="width:6rem" /></label>
        <button id="reroll">Re-roll</button>
        <label>Player type
          <select id="mtype"><option value="">(unit default)</option><option value="foot">foot</option><option value="cav">cavalry</option><option value="fly">flying</option></select>
        </label>
      </div>
      <div class="panel"><strong>Status:</strong> <span id="status">player phase</span></div>
      <div class="panel"><strong>Combat log</strong><div id="log"></div></div>
      <p class="note">Math preview, not engine truth: authoritative for pacing and difficulty only, not animations, menus, skills, or crashes.</p>
    </div>
  </div>
  <script type="module" src="/src/game/client.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Implement `src/game/client.ts`**

```ts
// Play view: renders the grid with sprites, drives the two-click move (preview
// path with slide animation, confirm on second click), runs the enemy phase and
// optional auto-play, and shows a seeded combat log. Game logic lives in the
// pure grid modules; this file is rendering and input only.

// Browser-safe: imports the PURE resolver (resolve.ts), never the Node loader
// (datagen.ts). Config comes in over fetch.
import { resolveGridEncounter } from "../grid/resolve.ts";
import {
  createGame, reachableFor, pathFor, applyMove, applyAttack, endPhase, status, takeAiTurn,
  type GameState,
} from "../grid/game.ts";
import { tileKey, type PathResult } from "../grid/movement.ts";
import { terrainSprite, unitSprite, TILE_COLORS } from "../grid/render.ts";
import { weaponRange, manhattan } from "../grid/range.ts";
import type { TileVec, MovementType } from "../grid/types.ts";

const TILE = 56;

// Fetch and resolve the grid encounter entirely in the browser (no node:fs).
async function fetchGridEncounter(path: string) {
  const enc = await fetch(path).then((r) => r.json());
  const [units, weapons, terrain, classes, map] = await Promise.all([
    fetch("/data/units.json").then((r) => r.json()),
    fetch("/data/weapons.json").then((r) => r.json()),
    fetch("/data/terrain.json").then((r) => r.json()),
    fetch("/data/classes.json").then((r) => r.json()),
    fetch(`/maps/${enc.map}.json`).then((r) => r.json()),
  ]);
  return resolveGridEncounter(enc, units, weapons, terrain, classes, map);
}

let g: GameState;
let preview: { to: TileVec; path: PathResult } | null = null;
let busy = false; // true while an animation runs

const boardEl = document.getElementById("board") as unknown as SVGSVGElement;

async function boot(): Promise<void> {
  const enc = await fetchGridEncounter("/encounters/skirmish-01.json");
  g = createGame(enc, readSeed());
  wire();
  render();
}

function readSeed(): number { return Number((document.getElementById("seed") as HTMLInputElement).value) || 1; }
function overrideMove(): { movementType: MovementType; move: number } | undefined {
  const v = (document.getElementById("mtype") as HTMLSelectElement).value;
  if (!v) return undefined;
  const moveByType: Record<string, number> = { foot: 5, cav: 7, fly: 7 };
  return { movementType: v as MovementType, move: moveByType[v] };
}

function render(): void {
  const w = g.enc.map.width * TILE, h = g.enc.map.height * TILE;
  boardEl.setAttribute("width", String(w));
  boardEl.setAttribute("height", String(h));
  const reach = g.phase === "player" && status(g) === "ongoing" ? reachableFor(g, g.player.id, overrideMove()) : new Set<string>();

  let svg = "";
  for (let y = 0; y < g.enc.map.height; y++) {
    for (let x = 0; x < g.enc.map.width; x++) {
      const id = g.enc.map.terrain[y][x], px = x * TILE, py = y * TILE;
      svg += `<rect x="${px}" y="${py}" width="${TILE}" height="${TILE}" fill="${TILE_COLORS[id] ?? "#ccc"}" stroke="#00000022"/>`;
      svg += terrainSprite(id, px, py, TILE, x, y);
      if (reach.has(`${x},${y}`)) svg += `<rect x="${px}" y="${py}" width="${TILE}" height="${TILE}" fill="#2b6cff40" stroke="#2b6cffcc" stroke-width="1.5" data-reach="${x},${y}"/>`;
    }
  }
  // preview path dots and attackable marker
  if (preview) {
    for (const t of preview.path.path) svg += `<circle cx="${t.x * TILE + TILE / 2}" cy="${t.y * TILE + TILE / 2}" r="${TILE * 0.1}" fill="#fff" pointer-events="none"/>`;
    if (manhattan(preview.to, g.enemy.pos) <= weaponRange(g.player.weapon)) {
      svg += `<rect x="${g.enemy.pos.x * TILE}" y="${g.enemy.pos.y * TILE}" width="${TILE}" height="${TILE}" fill="none" stroke="#ffd23b" stroke-width="3" pointer-events="none"/>`;
    }
  }
  // units (player shown at preview tile if previewing)
  const pPos = preview ? preview.to : g.player.pos;
  svg += `<g id="pUnit">${unitSprite(mType(g.player.cls.movementType), pPos.x * TILE + TILE / 2, pPos.y * TILE + TILE / 2, TILE, g.player.hp, "#2b6cff")}</g>`;
  svg += `<g id="eUnit">${unitSprite(mType(g.enemy.cls.movementType), g.enemy.pos.x * TILE + TILE / 2, g.enemy.pos.y * TILE + TILE / 2, TILE, g.enemy.hp, "#e0453b")}</g>`;
  boardEl.innerHTML = svg;

  renderLog();
  const s = status(g);
  document.getElementById("status")!.textContent =
    s === "player-won" ? "You win" : s === "player-lost" ? "You lose" : `${g.phase} phase, turn ${g.turn}`;
}

function mType(t: string): string { return t; } // movement type string is the sprite kind

function renderLog(): void {
  const el = document.getElementById("log")!;
  el.textContent = g.log.join("\n");
  el.scrollTop = el.scrollHeight;
}

function tileFromEvent(ev: MouseEvent): TileVec {
  const rect = boardEl.getBoundingClientRect();
  return { x: Math.floor((ev.clientX - rect.left) / TILE), y: Math.floor((ev.clientY - rect.top) / TILE) };
}

function onBoardClick(ev: MouseEvent): void {
  if (busy || g.phase !== "player" || status(g) !== "ongoing") return;
  const t = tileFromEvent(ev);
  const key = tileKey(t);

  // Second click: confirm.
  if (preview) {
    const canAttackFromPreview = manhattan(preview.to, g.enemy.pos) <= weaponRange(g.player.weapon);
    if (t.x === preview.to.x && t.y === preview.to.y) { commitMove(preview.to, null); return; }
    if (canAttackFromPreview && t.x === g.enemy.pos.x && t.y === g.enemy.pos.y) { commitMove(preview.to, g.enemy.id); return; }
  }
  // First click (or re-pick): must be a reachable tile.
  if (reachableFor(g, g.player.id, overrideMove()).has(key)) {
    const path = pathFor(g, g.player.id, t);
    if (path) { preview = { to: t, path }; animateAlong(path.path, () => render()); }
  } else {
    preview = null; render();
  }
}

function commitMove(to: TileVec, attackId: string | null): void {
  preview = null;
  applyMove(g, g.player.id, to);
  if (attackId) applyAttack(g, g.player.id, attackId);
  render();
  // End of the player's single action: run the enemy phase.
  endPhase(g);
  runEnemyPhase();
}

function runEnemyPhase(): void {
  if (status(g) !== "ongoing") { render(); return; }
  busy = true;
  const before = { ...g.enemy.pos };
  const action = decideAndPreviewEnemy();
  const finish = () => {
    takeAiTurn(g, g.enemy.id);
    endPhase(g);
    busy = false;
    render();
    if (autoOn() && status(g) === "ongoing") setTimeout(autoStep, 250);
  };
  if (action && (action.x !== before.x || action.y !== before.y)) {
    const path = pathFor(g, g.enemy.id, action);
    animateEnemyAlong(path ? path.path : [before, action], finish);
  } else {
    finish();
  }
}

function decideAndPreviewEnemy(): TileVec | null {
  // Peek where the enemy will move so we can animate before applying.
  // takeAiTurn recomputes the same decision; here we only need the tile.
  const { decideAction } = { decideAction: (window as any).__ai } as any; // not used; see note
  return null;
}

function autoOn(): boolean { return (document.getElementById("autoPlayer") as HTMLInputElement).checked; }

function autoStep(): void {
  if (status(g) !== "ongoing") { render(); return; }
  busy = true;
  const id = g.phase === "player" ? g.player.id : g.enemy.id;
  const before = { ...unitPos(id) };
  // animate to the AI's tile, then apply
  const target = aiTargetTile(id);
  const done = () => { takeAiTurn(g, id); endPhase(g); busy = false; render(); if (autoOn() && status(g) === "ongoing") setTimeout(autoStep, 250); };
  if (target && (target.x !== before.x || target.y !== before.y)) {
    const path = pathFor(g, id, target);
    animateUnit(id, path ? path.path : [before, target], done);
  } else done();
}

function unitPos(id: string): TileVec { return id === g.player.id ? g.player.pos : g.enemy.pos; }
function aiTargetTile(id: string): TileVec | null {
  // Import decideAction lazily to avoid a cycle at module top.
  return aiDecide(id);
}

// Wire helpers set below after imports resolve.
let aiDecide: (id: string) => TileVec | null = () => null;

async function wireAi(): Promise<void> {
  const mod = await import("../grid/ai.ts");
  aiDecide = (id: string) => mod.decideAction(g.enc, id).to;
}

function animateAlong(path: TileVec[], done: () => void): void {
  animateUnit(g.player.id, path, done);
}
function animateEnemyAlong(path: TileVec[], done: () => void): void {
  animateUnit(g.enemy.id, path, done);
}

// Slide a unit's token along the path, one tile per ~120ms, then call done.
function animateUnit(id: string, path: TileVec[], done: () => void): void {
  const gid = id === g.player.id ? "pUnit" : "eUnit";
  const el = document.getElementById(gid);
  if (!el || path.length < 2) { done(); return; }
  let i = 0;
  const stepMs = 120;
  const start = performance.now();
  const from0 = path[0];
  function frame(now: number): void {
    const el2 = document.getElementById(gid);
    if (!el2) { done(); return; }
    const elapsed = now - start;
    const seg = Math.min(path.length - 1, Math.floor(elapsed / stepMs));
    const tSeg = Math.min(1, (elapsed - seg * stepMs) / stepMs);
    const a = path[Math.min(seg, path.length - 1)];
    const b = path[Math.min(seg + 1, path.length - 1)];
    const cx = (a.x + (b.x - a.x) * tSeg) * TILE - a.x * TILE; // relative shift handled by transform below
    // Simpler: absolute translate from the token's rendered origin at path[0].
    const dx = ((a.x + (b.x - a.x) * tSeg) - from0.x) * TILE;
    const dy = ((a.y + (b.y - a.y) * tSeg) - from0.y) * TILE;
    el2.setAttribute("transform", `translate(${dx},${dy})`);
    if (seg >= path.length - 1 && tSeg >= 1) { el2.removeAttribute("transform"); done(); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function wire(): void {
  boardEl.addEventListener("click", onBoardClick);
  boardEl.addEventListener("contextmenu", (e) => { e.preventDefault(); preview = null; render(); });
  document.getElementById("endTurn")!.addEventListener("click", () => { if (!busy && g.phase === "player") { preview = null; endPhase(g); runEnemyPhase(); } });
  document.getElementById("reroll")!.addEventListener("click", () => { (document.getElementById("seed") as HTMLInputElement).value = String(Math.floor(Math.random() * 1_000_000)); restart(); });
  document.getElementById("seed")!.addEventListener("change", restart);
  document.getElementById("mtype")!.addEventListener("change", render);
  document.getElementById("autoPlayer")!.addEventListener("change", () => { if (autoOn() && !busy && status(g) === "ongoing") autoStep(); });
}

async function restart(): Promise<void> {
  const enc = await fetchGridEncounter("/encounters/skirmish-01.json");
  g = createGame(enc, readSeed());
  preview = null;
  render();
  if (autoOn()) autoStep();
}

await wireAi();
await boot();
```

Note on the enemy animation: `decideAndPreviewEnemy` above is a stub left in for
clarity but is not used. The working path is `runEnemyPhase`, which asks
`aiDecide` (wired in `wireAi`) for the enemy's target tile, animates the slide to
it, then calls `takeAiTurn` to apply the identical decision. Remove the unused
`decideAndPreviewEnemy` function during implementation and have `runEnemyPhase`
use `aiTargetTile(g.enemy.id)` for the target, mirroring `autoStep`.

- [ ] **Step 3: Simplify `runEnemyPhase` to use the AI target helper**

Replace the `runEnemyPhase` and `decideAndPreviewEnemy` functions with this
single clean version (removing the stub):

```ts
function runEnemyPhase(): void {
  if (status(g) !== "ongoing") { render(); return; }
  busy = true;
  const before = { ...g.enemy.pos };
  const target = aiTargetTile(g.enemy.id);
  const finish = () => { takeAiTurn(g, g.enemy.id); endPhase(g); busy = false; render(); if (autoOn() && status(g) === "ongoing") setTimeout(autoStep, 250); };
  if (target && (target.x !== before.x || target.y !== before.y)) {
    const path = pathFor(g, g.enemy.id, target);
    animateUnit(g.enemy.id, path ? path.path : [before, target], finish);
  } else finish();
}
```

- [ ] **Step 4: Add the Play view link to the editor**

In `src/editor/index.html`, add this line right after the `<h1>...</h1>` line:

```html
  <a href="/src/game/index.html" style="font-size:0.85rem">Open the map skirmish view</a>
```

- [ ] **Step 5: Manual verification in the browser**

Run: `node --no-warnings src/server.ts`
In the browser that opens (the editor), click "Open the map skirmish view", or
navigate to `http://localhost:5173/src/game/index.html`. Confirm:
- The board renders with terrain sprites, Eirika (blue) at left, the Wyvern (red)
  at right.
- Eirika's reachable tiles are highlighted and match her foot movement over the
  terrain.
- Changing "Player type" to flying expands the highlighted range across water and
  the mountain.
- Clicking a reachable tile slides Eirika there and shows the path dots; clicking
  again on that tile commits the move and the enemy takes its turn.
- Moving adjacent to the Wyvern shows the yellow attack marker; a second click on
  the Wyvern resolves combat and appends to the log.
- Checking "auto play player" runs the whole skirmish to a result, and the same
  seed produces the same log.
Stop the server by closing its window.

- [ ] **Step 6: Commit**

```bash
git add src/game/ src/editor/index.html
git commit -m "feat: play view with grid, two-click move, animation, auto-play"
```

---

## Task 11: Launcher, README, and final verification

**Files:**
- Create: `Play Map.cmd`
- Modify: `README.md`

- [ ] **Step 1: Create `Play Map.cmd`**

```bat
@echo off
rem Double-click to open the map skirmish view. Starts the server if needed.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings src\server.ts /src/game/index.html
pause
```

- [ ] **Step 2: Update `README.md`**

Add this section after the "Use it" list:

```markdown
### Map skirmish (Slice B)

- Double-click **Play Map.cmd** to open the 1v1 tactical grid in your browser.
  Move your unit within its highlighted range (movement depends on its class and
  the terrain), click a tile to preview the path, click again to confirm a move,
  or click an adjacent enemy to attack. Use "End turn" to pass to the enemy, the
  "Player type" selector to compare foot, cavalry, and flying movement, and
  "auto play player" to watch the whole fight run itself from the seed.

Grid data lives in `data/terrain.json`, `data/classes.json`, `maps/*.json`, and
`encounters/skirmish-01.json`.
```

- [ ] **Step 3: Full verification pass**

Run: `node --test`
Expected: PASS, every test across Slice A and Slice B passes. Record the count.

Run: `node --no-warnings src/preview.ts`
Expected: the Tier 1 preview still prints correctly (no regression from the
combat.ts changes).

Then double-click `Play Map.cmd` from Explorer and confirm the skirmish view
opens and plays, including auto-play to a result.

- [ ] **Step 4: Commit**

```bash
git add "Play Map.cmd" README.md
git commit -m "feat: play map launcher and readme"
```

---

## Self-review notes (for the implementer)

- Keep every ported combat formula's decomp citation intact in `combat.ts`.
- Browser-imported modules (`grid/datagen.ts`, `grid/game.ts`, `grid/ai.ts`,
  `grid/movement.ts`, `grid/terrain.ts`, `grid/render.ts`, `grid/range.ts`,
  `combat.ts`, `rng.ts`, and the two `types.ts`) must use `import type` for
  type-only imports so the browser never fetches a types-only module. The plan's
  code already does this.
- The browser client imports the PURE resolver `grid/resolve.ts` and never
  `grid/datagen.ts` (which uses `node:fs`). The Node test files import
  `grid/datagen.ts` directly, which is correct for the Node side.
- Task 5 already splits resolving (pure `resolve.ts`) from file IO (Node
  `datagen.ts`), and Task 10's client fetches config over HTTP, so there is no
  separate browser-safety correction task.
