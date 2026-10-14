# FEArchitect Multi-Unit Tactical Play and Portrait Sprites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a scenario playable with several units per side, drawn as portraits: select a unit, see its move range over terrain, move, attack an enemy in range, and End Turn to run the enemy AI.

**Architecture:** A new pure multi-unit engine (`src/grid/multigame.ts`) and a small enemy AI (`src/grid/multiai.ts`) orchestrate the existing pure movement, pathing, combat (skill aware), and terrain helpers. Units gain an optional portrait. The scenario viewer becomes the playable UI. The 1v1 `GameState`, `game.ts`, and `client.ts` are untouched. We reuse the units and classes already in `data/`, assigning them real FE8 portrait numbers.

**Tech Stack:** TypeScript on Node 24 (no build, no deps), the Node built-in test runner, the existing grid engine.

**Prose and code conventions:** No em dashes or en dashes anywhere. Use commas or colons. Comment new code well. Do NOT add Co-Authored-By or any attribution trailer to commits (project owner preference).

**Existing APIs to reuse:**
- `src/grid/movement.ts`: `computeReachable(map, defs, opts, blocked)` returns `{ tiles: Set<string>, costs }`; `tileKey(t)`; `findPath(...)`. `opts` is `{ movementType, move, from }`, `blocked` is a `Set<string>` of tile keys (blocked tiles cannot be entered).
- `src/grid/range.ts`: `weaponRange(weapon)`, `manhattan(a, b)`.
- `src/combat.ts`: `resolveExchange({ attacker, defender, attackerHp, defenderHp, attackerTerrain, defenderTerrain, defenderCanCounter, rng })` returns `{ events, attackerHp, defenderHp }`. A `Combatant` is `{ id, unit, weaponId, weapon, skills? }`.
- `src/grid/terrain.ts`: `terrainMod(defs, terrainId, movementType)` returns `{ avoid, def, res }`.
- `src/rng.ts`: `makeRng(seed): Rng`.
- `src/grid/datagen.ts`: `loadScenario(path, paths?)` returns a `ResolvedScenario { id, map, terrainDefs, units: GridUnit[] }`. `GridUnit` is `{ id, side, unit, weapon, cls, ai, pos, hp, level?, skills? }`.
- `src/grid/types.ts`: `GameStatus = "ongoing" | "player-won" | "player-lost"`; `Side = "player" | "enemy"`; `TileVec = { x, y }`.
- `src/game/scenario.ts` and `scenario.html` render the map and unit sprites (`unitSprite`, `terrainSprite`, `TILE_COLORS` from `src/grid/render.ts`), inspect a unit, and forecast a matchup.
- Portraits: `assets/reference/fe8/portraits/portrait_NNN.png` (NNN zero-padded to 3), served by `src/server.ts` under `assets/reference/`.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `src/grid/multigame.ts` | Pure: multi-unit game state and engine. |
| `src/grid/multigame.test.ts` | Tests. |
| `src/grid/multiai.ts` | Pure: aggressive enemy AI decision. |
| `src/grid/multiai.test.ts` | Tests. |
| `src/grid/types.ts` | MODIFY: add optional `portrait?: number` to `GridUnit`. |
| `src/grid/resolve.ts` | MODIFY: carry `portrait` onto the built `GridUnit`. |
| `data/units.json` | MODIFY: give the example units portrait numbers. |
| `src/game/scenario.ts`, `scenario.html` | MODIFY: playable loop + portrait tokens. |

---

## Task 1: Multi-unit engine (pure)

**Files:** Create `src/grid/multigame.ts`, `src/grid/multigame.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMultiGame, reachableFor, moveUnit, attack, act, canAttack, endPhase, status, unitById } from "./multigame.ts";
import { tileKey } from "./movement.ts";

// A 4x1 plains strip. Two players and one enemy.
function scenario(): any {
  const terrainDefs = { plains: { name: "Plains", moveCost: { foot: 1, cav: 1, fly: 1 }, avoid: 0, def: 0 } };
  const map = { id: "m", width: 5, height: 1, terrain: [["plains", "plains", "plains", "plains", "plains"]] };
  const mk = (id: string, side: string, x: number, str: number, hp: number) => ({
    id, side, pos: { x, y: 0 }, hp, cls: { name: "Inf", movementType: "foot", move: 3 },
    weapon: { name: "Sword", type: "sword", rank: "E", might: 5, hit: 100, crit: 0, weight: 5 },
    unit: { name: id, hp, str, mag: 0, skl: 5, spd: 5, lck: 0, def: 0, res: 0, con: 5 }, ai: "aggressive",
  });
  return { id: "s", map, terrainDefs, units: [mk("p1", "player", 0, 20, 30), mk("e1", "enemy", 4, 3, 20)] };
}

test("reachableFor excludes tiles occupied by other units and respects move", () => {
  const g = createMultiGame(scenario(), 1);
  const r = reachableFor(g, "p1");
  assert.ok(r.has("0,0") && r.has("3,0")); // start and 3 tiles out
  assert.ok(!r.has("4,0")); // enemy occupies it
});

test("moveUnit rejects an unreachable tile and accepts a reachable one", () => {
  const g = createMultiGame(scenario(), 1);
  assert.throws(() => moveUnit(g, "p1", { x: 4, y: 0 }), /reachable/i);
  moveUnit(g, "p1", { x: 3, y: 0 });
  assert.deepEqual(unitById(g, "p1").pos, { x: 3, y: 0 });
});

test("attack resolves combat, applies HP, removes the dead, and ends when routed", () => {
  const g = createMultiGame(scenario(), 1);
  act(g, "p1", { x: 3, y: 0 }, "e1"); // move adjacent and attack: str 20 + might 5 = 25 per hit, enemy 20 hp
  assert.equal(unitById(g, "e1"), undefined); // enemy dead and removed
  assert.equal(status(g), "player-won");
  assert.ok(g.acted.has("p1"));
});

test("a unit cannot act twice in a phase", () => {
  const g = createMultiGame(scenario(), 1);
  act(g, "p1", { x: 1, y: 0 });
  assert.equal(reachableFor(g, "p1").size, 0); // already acted
});

test("endPhase toggles side, clears acted, and bumps turn after the enemy phase", () => {
  const g = createMultiGame(scenario(), 1);
  act(g, "p1", { x: 1, y: 0 });
  endPhase(g);
  assert.equal(g.phase, "enemy");
  assert.equal(g.acted.size, 0);
  endPhase(g);
  assert.equal(g.phase, "player");
  assert.equal(g.turn, 2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/grid/multigame.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/grid/multigame.ts`**

```ts
// Multi-unit tactical game state and engine. Orchestrates the pure movement, combat,
// and terrain helpers for N units per side. The 1v1 GameState in game.ts is separate
// and unchanged. See the tactical play spec.
import type { ResolvedMap, TerrainDef, GridUnit, Side, GameStatus, TileVec, ResolvedScenario } from "./types.ts";
import type { Combatant } from "../types.ts";
import { makeRng, type Rng } from "../rng.ts";
import { computeReachable, tileKey } from "./movement.ts";
import { weaponRange, manhattan } from "./range.ts";
import { resolveExchange } from "../combat.ts";
import { terrainMod } from "./terrain.ts";

export interface MultiGame {
  id: string;
  map: ResolvedMap;
  terrainDefs: Record<string, TerrainDef>;
  units: GridUnit[];
  phase: Side;
  turn: number;
  acted: Set<string>;
  rng: Rng;
  log: string[];
}

export function createMultiGame(sc: ResolvedScenario, seed: number): MultiGame {
  return {
    id: sc.id, map: sc.map, terrainDefs: sc.terrainDefs,
    units: sc.units.map((u) => ({ ...u, pos: { ...u.pos } })),
    phase: "player", turn: 1, acted: new Set(), rng: makeRng(seed), log: [],
  };
}

export function unitById(g: MultiGame, id: string): GridUnit | undefined { return g.units.find((u) => u.id === id); }
export function unitAt(g: MultiGame, x: number, y: number): GridUnit | undefined { return g.units.find((u) => u.pos.x === x && u.pos.y === y); }

function blockers(g: MultiGame, exceptId: string): Set<string> {
  const s = new Set<string>();
  for (const u of g.units) if (u.id !== exceptId) s.add(tileKey(u.pos));
  return s;
}

// Reachable tiles for a unit whose side is active and that has not yet acted.
export function reachableFor(g: MultiGame, id: string): Set<string> {
  const u = unitById(g, id);
  if (!u || u.side !== g.phase || g.acted.has(id)) return new Set();
  return computeReachable(g.map, g.terrainDefs, { movementType: u.cls.movementType, move: u.cls.move, from: u.pos }, blockers(g, id)).tiles;
}

export function canAttack(g: MultiGame, attackerId: string, targetId: string): boolean {
  const a = unitById(g, attackerId), t = unitById(g, targetId);
  if (!a || !t || a.side === t.side) return false;
  return manhattan(a.pos, t.pos) <= weaponRange(a.weapon);
}

function combatant(u: GridUnit): Combatant {
  return { id: u.id, unit: u.unit, weaponId: u.weapon.name, weapon: u.weapon, skills: u.skills };
}

export function attack(g: MultiGame, attackerId: string, targetId: string): void {
  const a = unitById(g, attackerId), t = unitById(g, targetId);
  if (!a || !t) throw new Error(`attack references a missing unit`);
  if (!canAttack(g, attackerId, targetId)) throw new Error(`${attackerId} cannot reach ${targetId}`);
  const atkTid = g.map.terrain[a.pos.y][a.pos.x], defTid = g.map.terrain[t.pos.y][t.pos.x];
  const res = resolveExchange({
    attacker: combatant(a), defender: combatant(t), attackerHp: a.hp, defenderHp: t.hp,
    attackerTerrain: terrainMod(g.terrainDefs, atkTid, a.cls.movementType),
    defenderTerrain: terrainMod(g.terrainDefs, defTid, t.cls.movementType),
    defenderCanCounter: manhattan(a.pos, t.pos) <= weaponRange(t.weapon), rng: g.rng,
  });
  a.hp = res.attackerHp; t.hp = res.defenderHp;
  for (const e of res.events) {
    const who = e.attackerId === a.id ? a : t, whom = e.defenderId === a.id ? a : t;
    g.log.push(e.hit
      ? `${who.unit.name} hit ${whom.unit.name} for ${e.damage}${e.crit ? " (crit)" : ""}, HP ${e.defenderHpAfter}`
      : `${who.unit.name} missed ${whom.unit.name}`);
  }
  g.units = g.units.filter((u) => u.hp > 0);
}

export function moveUnit(g: MultiGame, id: string, to: TileVec): void {
  const u = unitById(g, id);
  if (!u) throw new Error(`move references a missing unit: ${id}`);
  if (!reachableFor(g, id).has(tileKey(to))) throw new Error(`tile ${tileKey(to)} is not reachable for ${id}`);
  u.pos = { x: to.x, y: to.y };
}

// Move then optionally attack, then mark the unit as having acted.
export function act(g: MultiGame, id: string, to: TileVec, targetId?: string | null): void {
  moveUnit(g, id, to);
  if (targetId) attack(g, id, targetId);
  g.acted.add(id);
}

function healTile(g: MultiGame, u: GridUnit): void {
  const d = g.terrainDefs[g.map.terrain[u.pos.y][u.pos.x]];
  const heal = d?.heal ?? 0;
  if (heal > 0 && u.hp < u.unit.hp) {
    const gained = Math.min(u.unit.hp, u.hp + heal) - u.hp;
    u.hp += gained;
    if (gained > 0) g.log.push(`${u.unit.name} recovered ${gained} HP on ${d.name}`);
  }
}

export function endPhase(g: MultiGame): void {
  if (g.phase === "enemy") g.turn += 1;
  g.phase = g.phase === "player" ? "enemy" : "player";
  g.acted = new Set();
  for (const u of g.units) if (u.side === g.phase) healTile(g, u);
}

export function status(g: MultiGame): GameStatus {
  const players = g.units.some((u) => u.side === "player");
  const enemies = g.units.some((u) => u.side === "enemy");
  if (!enemies) return "player-won";
  if (!players) return "player-lost";
  return "ongoing";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/grid/multigame.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/grid/multigame.ts src/grid/multigame.test.ts
git commit -m "feat: multi-unit tactical game engine"
```

---

## Task 2: Enemy AI (pure)

**Files:** Create `src/grid/multiai.ts`, `src/grid/multiai.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMultiGame } from "./multigame.ts";
import { decideMultiAction } from "./multiai.ts";

function scenario(enemyX: number, ai = "aggressive"): any {
  const terrainDefs = { plains: { name: "Plains", moveCost: { foot: 1, cav: 1, fly: 1 }, avoid: 0, def: 0 } };
  const map = { id: "m", width: 8, height: 1, terrain: [Array(8).fill("plains")] };
  const mk = (id: string, side: string, x: number, aiKind = "aggressive") => ({
    id, side, pos: { x, y: 0 }, hp: 20, cls: { name: "Inf", movementType: "foot", move: 3 },
    weapon: { name: "Sword", type: "sword", rank: "E", might: 5, hit: 100, crit: 0, weight: 5 },
    unit: { name: id, hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 0, def: 0, res: 0, con: 5 }, ai: aiKind,
  });
  return { id: "s", map, terrainDefs, units: [mk("p1", "player", 0), mk("e1", "enemy", enemyX, ai)] };
}

test("AI attacks in place when a player is already in range", () => {
  const g = createMultiGame(scenario(1), 1); // enemy adjacent to player at x0
  const a = decideMultiAction(g, "e1");
  assert.deepEqual(a.to, { x: 1, y: 0 });
  assert.equal(a.attackTargetId, "p1");
});

test("AI moves adjacent and attacks when a player is reachable", () => {
  const g = createMultiGame(scenario(3), 1); // enemy 3 away, move 3 -> can reach x1 (adjacent to p1 at x0)
  const a = decideMultiAction(g, "e1");
  assert.equal(a.attackTargetId, "p1");
  assert.ok(Math.abs(a.to.x - 0) <= 1); // ends adjacent to the player
});

test("AI steps toward the nearest player when it cannot reach one", () => {
  const g = createMultiGame(scenario(7), 1); // too far to attack this turn
  const a = decideMultiAction(g, "e1");
  assert.equal(a.attackTargetId, null);
  assert.ok(a.to.x < 7); // moved closer
});

test("a stationary unit holds", () => {
  const g = createMultiGame(scenario(5, "stationary"), 1);
  const a = decideMultiAction(g, "e1");
  assert.deepEqual(a.to, { x: 5, y: 0 });
  assert.equal(a.attackTargetId, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/grid/multiai.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/grid/multiai.ts`**

```ts
// A simple deterministic aggressive enemy AI for the multi-unit engine. It reuses the
// engine's reachable tiles, so it respects terrain and blocking. See the tactical play spec.
import type { TileVec } from "./types.ts";
import { type MultiGame, unitById, reachableFor } from "./multigame.ts";
import { weaponRange, manhattan } from "./range.ts";

export function decideMultiAction(g: MultiGame, id: string): { to: TileVec; attackTargetId: string | null } {
  const me = unitById(g, id);
  if (!me) return { to: { x: 0, y: 0 }, attackTargetId: null };
  const foes = g.units.filter((u) => u.side !== me.side);
  if (foes.length === 0) return { to: me.pos, attackTargetId: null };

  // Nearest foe (ties broken by lower HP), from a given tile.
  const nearestFrom = (p: TileVec) => foes.slice().sort((a, b) => manhattan(p, a.pos) - manhattan(p, b.pos) || a.hp - b.hp)[0];

  // Attack from the current tile if a foe is already in range.
  const reach = weaponRange(me.weapon);
  const inRangeNow = foes.filter((f) => manhattan(me.pos, f.pos) <= reach);
  if (inRangeNow.length) {
    const t = inRangeNow.sort((a, b) => manhattan(me.pos, a.pos) - manhattan(me.pos, b.pos) || a.hp - b.hp)[0];
    return { to: me.pos, attackTargetId: t.id };
  }
  if (me.ai === "stationary") return { to: me.pos, attackTargetId: null };

  const reachable = reachableFor(g, id);
  // Prefer a reachable tile from which a foe is in range; closest approach wins.
  let best: { to: TileVec; target: string; dist: number } | null = null;
  for (const key of reachable) {
    const [x, y] = key.split(",").map(Number);
    for (const f of foes) {
      const d = manhattan({ x, y }, f.pos);
      if (d <= reach && (!best || d < best.dist)) best = { to: { x, y }, target: f.id, dist: d };
    }
  }
  if (best) return { to: best.to, attackTargetId: best.target };

  // Otherwise step to the reachable tile closest to the nearest foe.
  const target = nearestFrom(me.pos);
  let step = me.pos;
  let bestDist = manhattan(me.pos, target.pos);
  for (const key of reachable) {
    const [x, y] = key.split(",").map(Number);
    const d = manhattan({ x, y }, target.pos);
    if (d < bestDist) { bestDist = d; step = { x, y }; }
  }
  return { to: step, attackTargetId: null };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/grid/multiai.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/grid/multiai.ts src/grid/multiai.test.ts
git commit -m "feat: aggressive enemy AI for the multi-unit engine"
```

---

## Task 3: Portrait field and example portraits

**Files:** Modify `src/grid/types.ts`, `src/grid/resolve.ts`, `data/units.json`.

- [ ] **Step 1: Add the portrait field to `GridUnit`**

In `src/grid/types.ts`, add to `GridUnit`:

```ts
  portrait?: number; // portrait table index for the map token, if any
```

- [ ] **Step 2: Carry the portrait through resolve**

In `src/grid/resolve.ts`, in `buildUnit`, add `portrait: rawUnit.portrait` to the returned `GridUnit` object.

- [ ] **Step 3: Give the example units portraits**

In `data/units.json`, add a `"portrait": <N>` to the example units (`seth`, `lute`, `gen-soldier`, `gen-soldier-b`, and the flat `eirika-t`, `wyvern-1`), picking numbers that exist under `assets/reference/fe8/portraits/` (files `portrait_001.png` .. `portrait_NNN.png`). Confirm the chosen files exist:

Run: `ls assets/reference/fe8/portraits/ | head` and pick valid indices (for example 1, 2, 3, ...). Use recognizable faces if you know them (Eirika, Seth), otherwise any valid index.

- [ ] **Step 4: Verify resolve carries it**

Run: `node --input-type=module -e "import {loadScenario} from './src/grid/datagen.ts'; const s=await loadScenario('encounters/scenario-01.json'); console.log(s.units.map(u=>u.id+':'+(u.portrait??'none')).join(', '));"`
Expected: each unit shows its portrait number.

- [ ] **Step 5: Commit**

```bash
git add src/grid/types.ts src/grid/resolve.ts data/units.json
git commit -m "feat: optional portrait on units, carried through resolve"
```

---

## Task 4: Playable scenario viewer with portrait tokens

**Files:** Modify `src/game/scenario.ts`, `src/game/scenario.html`.

- [ ] **Step 1: Build a MultiGame and render portraits**

In `scenario.ts`, after resolving the scenario, build a `MultiGame` with
`createMultiGame(sc, seed)`. Replace the static unit rendering with a token renderer:
for each living unit, if it has a `portrait`, draw an `<image href="/assets/reference/fe8/portraits/portrait_<NNN>.png">` clipped to a rounded square with a side-colored
border (blue player, red enemy) and the HP number below or over it; otherwise fall back
to `unitSprite`. Keep the terrain rendering.

- [ ] **Step 2: The play loop (select, move, attack)**

Add interaction over the `MultiGame`:
- Click a player unit that has not acted: select it, show `reachableFor(g, id)` as blue
  tiles and any enemies in attack range (from reachable tiles) highlighted.
- With a unit selected, click a reachable empty tile to set a pending destination (show
  the path or just the chosen tile), then click an adjacent enemy to `act(g, id, dest,
  enemyId)`, or click the destination again (or a Wait control) to `act(g, id, dest)`
  with no attack. Clicking an enemy already in range without moving acts in place.
- After each action, re-render and clear the selection. Update the status line.

Keep it simple: a two click flow (unit, then destination-or-enemy) is acceptable; if the
clicked enemy is in range from the unit's current or chosen tile, attack.

- [ ] **Step 3: End Turn and enemy AI**

Add an End Turn button. On click, `endPhase(g)` to the enemy phase, then for each enemy
unit in turn call `decideMultiAction(g, id)` and `act(g, ...)`, with a short `setTimeout`
delay between units so the player can follow, re-rendering each step. When all enemies
have acted, `endPhase(g)` back to the player and re-render. Guard against acting after
`status(g)` is not "ongoing".

- [ ] **Step 4: Status, win, lose**

Show a status line: phase, turn, and when `status(g)` is "player-won" or "player-lost",
show the result and stop accepting input. Add a Restart control that rebuilds the
MultiGame from the scenario.

- [ ] **Step 5: Keep inspect and forecast**

Retain the unit inspection panel (statblock and skills) for the selected unit, and the
matchup forecast when hovering or previewing an attack (reuse the existing
`computeMatchup` display). These can be shown for the currently selected unit and a
targeted enemy.

- [ ] **Step 6: Verify in the browser**

Run: `node --no-warnings src/server.ts /src/game/scenario.html`, open the scenario, and
confirm: units show as portraits with a side color and HP; selecting a player shows its
range; moving and attacking works and reduces or removes enemies; End Turn runs the
enemy AI (enemies approach and attack); the status shows a win when all enemies are
routed and a loss if all players fall; Restart works. Stop the server.

- [ ] **Step 7: Run the full suite and commit**

Run: `node --test`
Expected: PASS, the full suite including the new `multigame` and `multiai` tests, and
the 1v1 Play Map tests unchanged.

```bash
git add src/game/scenario.ts src/game/scenario.html
git commit -m "feat: playable multi-unit scenario with portrait tokens and enemy AI"
```

---

## Self-review notes (for the implementer)

- Tasks 1 and 2 are pure and can be built in parallel (Task 2 imports Task 1's engine,
  so Task 1 lands first). Task 3 is small and independent. Task 4 (UI) depends on all.
- The 1v1 engine (`game.ts`, `client.ts`) and its tests are not touched: confirm the
  full suite still passes after Task 4.
- Blocking is conservative: every other unit blocks both pathing and ending. Allies not
  blocking pass-through is a later refinement.
- `act` marks a unit acted even if it died to a counter (harmless, it is removed from
  `units`).
- Portraits are ROM derived and gitignored; the `portrait` numbers in `data/units.json`
  are committed, but the images come from Import Assets. A missing image just shows a
  broken token, so pick indices that exist.
- Keep the deterministic forecast and inspection from the previous slice working.
