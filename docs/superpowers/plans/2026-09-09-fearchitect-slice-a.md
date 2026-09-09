# FEArchitect Slice A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tier 1 "1 player vs 1 enemy" math preview: JSON configs, decomp-ported FE8 combat math with 2RN and a seeded Monte Carlo, an integrated browser editor plus preview that saves back to disk, and double-clickable launchers.

**Architecture:** Config JSON is the source of truth. `datagen` validates and resolves it into a `DataBundle`. A pure, DOM-free combat engine computes a deterministic breakdown and a locally-run seeded Monte Carlo. A tiny Node standard-library server serves a browser editor that runs the same engine in-page and saves edits back to the JSON. Double-clickable `.cmd` files launch the editor and a headless preview.

**Tech Stack:** TypeScript run natively by Node 24 (type stripping, no build step, no third party dependencies). Node built-in test runner (`node --test`). Node standard library `http`/`fs` for the server. Plain HTML/CSS/TS for the editor, abstract rendering only.

**Prose and code conventions:** No em dashes or en dashes anywhere. Use colons or commas. Comment new code well. Cite decomp source file and function in comments for every ported formula.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `package.json` | Marks the project as ESM (`"type": "module"`). No dependencies. |
| `src/types.ts` | Shared types: WeaponType, WeaponDef, UnitDef, Combatant, EncounterSpec, DataBundle, and the combat result types. Declarations only. |
| `src/rng.ts` | Seeded PRNG (mulberry32) plus `roll2RN`. Pure, deterministic, replayable. |
| `src/combat.ts` | Ported FE8 combat math: per-side stats, matchup, deterministic breakdown, and the seeded Monte Carlo duel. Pure, no DOM. |
| `src/datagen.ts` | Load and validate config JSON, resolve references into a DataBundle. Fails loudly. |
| `data/weapons.json` | Weapon definitions. |
| `data/units.json` | Unit definitions. |
| `encounters/duel-01.json` | The baseline encounter. |
| `src/format.ts` | Pure text formatting of a preview result, shared by the headless preview. |
| `src/preview.ts` | Headless entry point: load encounter, run math, print. |
| `src/editor/formmodel.ts` | Pure mapping between form values and config objects. Testable without a DOM. |
| `src/editor/index.html` | Editor plus preview page markup and styles. |
| `src/editor/client.ts` | Browser side: build forms, run the engine in-page, render results, call save. |
| `src/server.ts` | Node server: serve the editor, strip TypeScript for the browser, expose a save endpoint. |
| `Open Editor.cmd` | Double-click: start the server, open the browser. |
| `Preview.cmd` | Double-click: run the headless preview, pause. |
| `Test.cmd` | Double-click: run the whole test suite. |
| `README.md` | How to run, and the simulator authority boundary. |

---

## Task 1: Project scaffolding and TypeScript test runner sanity

**Files:**
- Create: `package.json`
- Create: `src/sanity.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "fearchitect",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "description": "FE8 encounter design sandbox: Tier 1 math preview slice."
}
```

- [ ] **Step 2: Write a failing test that proves Node runs TypeScript tests**

Create `src/sanity.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

// This proves Node 24 executes .test.ts files directly with no build step.
test("node runs typescript tests", () => {
  const doubled: number = 2 * 21;
  assert.equal(doubled, 42);
});
```

- [ ] **Step 3: Run the test**

Run: `node --test`
Expected: PASS, 1 test passed. If Node reports it cannot run `.ts`, stop: the machine's Node is older than assumed and the plan's no-build assumption must be revisited.

- [ ] **Step 4: Commit**

```bash
git add package.json src/sanity.test.ts
git commit -m "chore: scaffold ESM project, confirm Node runs TypeScript tests"
```

---

## Task 2: Seeded RNG and 2RN roll

**Files:**
- Create: `src/rng.ts`
- Test: `src/rng.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/rng.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRng, roll2RN } from "./rng.ts";

test("same seed yields the same sequence", () => {
  const a = makeRng(123);
  const b = makeRng(123);
  const seqA = [a.next100(), a.next100(), a.next100(), a.next100()];
  const seqB = [b.next100(), b.next100(), b.next100(), b.next100()];
  assert.deepEqual(seqA, seqB);
});

test("different seeds diverge", () => {
  const a = makeRng(1);
  const b = makeRng(2);
  assert.notDeepEqual(
    [a.next100(), a.next100(), a.next100()],
    [b.next100(), b.next100(), b.next100()],
  );
});

test("next100 stays in 0..99", () => {
  const r = makeRng(999);
  for (let i = 0; i < 5000; i++) {
    const v = r.next100();
    assert.ok(v >= 0 && v <= 99, `value out of range: ${v}`);
  }
});

test("roll2RN with 0 never hits and 100 always hits", () => {
  const r = makeRng(7);
  for (let i = 0; i < 200; i++) {
    assert.equal(roll2RN(0, r), false);
    assert.equal(roll2RN(100, r), true);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/rng.test.ts`
Expected: FAIL, cannot find module `./rng.ts` or exports undefined.

- [ ] **Step 3: Implement `src/rng.ts`**

```ts
// Seeded pseudo random number generator so every playtest is replayable.
// mulberry32: a small, fast, well distributed 32 bit PRNG. The specific
// algorithm does not matter for game fidelity, only that it is seeded and
// deterministic. Fidelity comes from roll2RN below, which mirrors the GBA
// two random number (2RN) hit check.

export interface Rng {
  // Returns an integer in 0..99 inclusive, matching NextRN_100 in the decomp.
  next100(): number;
}

export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  function nextFloat(): number {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next100(): number {
      return Math.floor(nextFloat() * 100);
    },
  };
}

// 2RN hit determination, ported from the GBA behavior used by Roll2RN, which
// is reached via BattleRoll2RN in fireemblem8u/src/bmbattle.c. Two rolls in
// 0..99 are averaged with integer division and compared against the displayed
// hit rate. A displayed rate of 0 never hits, 100 always hits.
export function roll2RN(displayedHit: number, rng: Rng): boolean {
  if (displayedHit <= 0) return false;
  if (displayedHit >= 100) return true;
  const roll = Math.floor((rng.next100() + rng.next100()) / 2);
  return roll < displayedHit;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/rng.test.ts`
Expected: PASS, 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/rng.ts src/rng.test.ts
git commit -m "feat: seeded RNG and 2RN hit roll"
```

---

## Task 3: Shared types

**Files:**
- Create: `src/types.ts`

No test: this file is declarations only. Later tasks that use these types are the real check.

- [ ] **Step 1: Create `src/types.ts`**

```ts
// Shared contracts for the whole slice. Declarations only, no runtime code.

export type WeaponType =
  | "sword" | "lance" | "axe" | "bow"
  | "anima" | "light" | "dark" | "staff";

// The three weapon types that form the melee weapon triangle.
export const TRIANGLE_TYPES: readonly WeaponType[] = ["sword", "lance", "axe"];

// Magic weapon types. In this project the strength / magic split is enabled,
// so magic weapons use the mag stat and target res. Vanilla FE8 uses a single
// pow stat for both, see the note in combat.ts.
export const MAGIC_TYPES: readonly WeaponType[] = ["anima", "light", "dark"];

export interface WeaponDef {
  name: string;
  type: WeaponType;
  rank: string;   // "E".."S", not enforced in slice A
  might: number;
  hit: number;
  crit: number;
  weight: number;
}

export interface UnitDef {
  name: string;
  hp: number;
  str: number;
  mag: number;
  skl: number;
  spd: number;
  lck: number;
  def: number;
  res: number;
  con: number;
}

// One resolved fighter: a unit plus the specific weapon it wields.
export interface Combatant {
  id: string;       // the unit key, for display
  unit: UnitDef;
  weaponId: string;
  weapon: WeaponDef;
}

export interface EncounterSpec {
  id: string;
  notes?: string;
  player: { unit: string; weapon: string };
  enemy: { unit: string; weapon: string };
}

// Everything the combat engine needs, with references already resolved.
export interface DataBundle {
  weapons: Record<string, WeaponDef>;
  units: Record<string, UnitDef>;
  encounter: EncounterSpec;
  player: Combatant;
  enemy: Combatant;
}

// What one attacker does to one defender in a single matchup.
export interface Matchup {
  damage: number;         // per hit, floored at 0, no crit
  attackSpeed: number;
  displayedHit: number;   // 0..100
  trueHit: number;        // 0..100, 2RN corrected, rounded to 1 decimal
  displayedCrit: number;  // 0..100
  doubles: boolean;
  hitsToKill: number | null;   // ceil(targetHp / damage), null if damage is 0
  roundsToKill: number | null; // hitsToKill split by doubling, null if cannot kill
}

export interface DeterministicReport {
  playerVsEnemy: Matchup;
  enemyVsPlayer: Matchup;
}

export interface MonteCarloReport {
  seed: number;
  runs: number;
  playerWins: number;
  enemyWins: number;
  stalemates: number;
  playerWinRate: number;   // 0..100
  enemyWinRate: number;    // 0..100
  averageRounds: number;   // over decisive duels
  // deathRoundHistogram[i] = how many duels ended on engagement i (1 based).
  deathRoundHistogram: number[];
}

export interface PreviewResult {
  encounterId: string;
  deterministic: DeterministicReport;
  monteCarlo: MonteCarloReport;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: shared types for data and combat results"
```

---

## Task 4: Combat stats and matchup math

**Files:**
- Create: `src/combat.ts`
- Test: `src/combat.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/combat.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { attackSpeed, trueHit2RN, weaponTriangle, computeMatchup } from "./combat.ts";
import type { Combatant, UnitDef, WeaponDef } from "./types.ts";

function unit(over: Partial<UnitDef>): UnitDef {
  return { name: "U", hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 0, def: 5, res: 0, con: 5, ...over };
}
function weapon(over: Partial<WeaponDef>): WeaponDef {
  return { name: "W", type: "sword", rank: "E", might: 5, hit: 90, crit: 0, weight: 5, ...over };
}
function fighter(u: UnitDef, w: WeaponDef): Combatant {
  return { id: "x", unit: u, weaponId: "w", weapon: w };
}

test("attack speed subtracts weight over con, floored at 0", () => {
  // weight 10, con 4 -> penalty 6, spd 12 -> AS 6
  assert.equal(attackSpeed(fighter(unit({ spd: 12, con: 4 }), weapon({ weight: 10 }))), 6);
  // weight 5, con 5 -> no penalty, spd 7 -> AS 7
  assert.equal(attackSpeed(fighter(unit({ spd: 7, con: 5 }), weapon({ weight: 5 }))), 7);
  // huge weight cannot push AS below 0
  assert.equal(attackSpeed(fighter(unit({ spd: 3, con: 0 }), weapon({ weight: 99 }))), 0);
});

test("2RN true hit closed form", () => {
  assert.equal(Math.round(trueHit2RN(50)), 50);
  assert.equal(Math.round(trueHit2RN(90)), 98);
  assert.equal(Math.round(trueHit2RN(30)), 18);
  assert.equal(trueHit2RN(0), 0);
  assert.equal(trueHit2RN(100), 100);
});

test("weapon triangle: sword beats axe, loses to lance", () => {
  assert.deepEqual(weaponTriangle("sword", "axe"), { hitBonus: 15, dmgBonus: 1 });
  assert.deepEqual(weaponTriangle("sword", "lance"), { hitBonus: -15, dmgBonus: -1 });
  assert.deepEqual(weaponTriangle("sword", "sword"), { hitBonus: 0, dmgBonus: 0 });
  assert.deepEqual(weaponTriangle("bow", "axe"), { hitBonus: 0, dmgBonus: 0 });
});

test("physical matchup: damage, hit, doubling", () => {
  // attacker: str 9, skl 13, spd 15, lck 12, con 5, iron sword (mt5 hit90 wt5)
  // defender: def 11, spd 9, lck 2, con 13, iron lance (mt7 hit80 wt8)
  const atk = fighter(
    unit({ str: 9, skl: 13, spd: 15, lck: 12, def: 7, con: 5 }),
    weapon({ type: "sword", might: 5, hit: 90, crit: 0, weight: 5 }),
  );
  const def = fighter(
    unit({ str: 12, skl: 8, spd: 9, lck: 2, def: 11, con: 13 }),
    weapon({ type: "lance", might: 7, hit: 80, crit: 0, weight: 8 }),
  );
  const m = computeMatchup(atk, def);
  // triangle sword vs lance: hit -15, dmg -1.
  // attack = 5 (mt) - 1 (tri) + 9 (str) = 13; damage = 13 - 11 (def) = 2
  assert.equal(m.damage, 2);
  // AS attacker = 15 - max(0,5-5)=15 ; AS defender = 9 - max(0,8-13)=9 ; diff 6 -> doubles
  assert.equal(m.attackSpeed, 15);
  assert.equal(m.doubles, true);
  // hit = skl*2(26) + wpnHit(90) + lck/2(6) + tri(-15) = 107
  // avoid def = AS*2(18) + terrain(0) + lck(2) = 20 ; displayed = 107-20=87
  assert.equal(m.displayedHit, 87);
  // damage 2 into hp 20 -> hitsToKill 10, doubles -> roundsToKill 5
  assert.equal(m.hitsToKill, 10);
  assert.equal(m.roundsToKill, 5);
});

test("magic matchup uses mag versus res", () => {
  const atk = fighter(unit({ mag: 10, str: 0, skl: 6, lck: 4, spd: 8, con: 5 }),
    weapon({ type: "anima", might: 6, hit: 85, crit: 0, weight: 5 }));
  const def = fighter(unit({ res: 3, def: 20, spd: 5, lck: 0, con: 8 }),
    weapon({ type: "sword", might: 5, hit: 90, weight: 5 }));
  const m = computeMatchup(atk, def);
  // no triangle for anima vs sword in slice A. attack = 6 + 10 = 16 ; damage = 16 - 3 (res) = 13
  assert.equal(m.damage, 13);
});

test("zero damage yields null kill counts", () => {
  const atk = fighter(unit({ str: 1 }), weapon({ might: 1, type: "sword" }));
  const def = fighter(unit({ def: 50 }), weapon({ type: "sword" }));
  const m = computeMatchup(atk, def);
  assert.equal(m.damage, 0);
  assert.equal(m.hitsToKill, null);
  assert.equal(m.roundsToKill, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/combat.test.ts`
Expected: FAIL, `./combat.ts` exports not found.

- [ ] **Step 3: Implement the stats and matchup part of `src/combat.ts`**

Create `src/combat.ts` with this content (the Monte Carlo duel is added in Task 5, appended to this same file):

```ts
// FE8 combat math. Every formula is ported from fireemblem8u/src/bmbattle.c
// (the ComputeBattleUnit* functions) and include/bmbattle.h. Constants are
// cited inline. The strength / magic split is treated as enabled: magic
// weapons use mag and target res, where vanilla FE8 uses a single pow stat.

import type { Combatant, Matchup, WeaponType } from "./types.ts";
import { MAGIC_TYPES } from "./types.ts";

// include/bmbattle.h: BATTLE_FOLLOWUP_SPEED_THRESHOLD = 4
const FOLLOWUP_THRESHOLD = 4;

export function isMagic(type: WeaponType): boolean {
  return MAGIC_TYPES.includes(type);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

// ComputeBattleUnitSpeed: effWt = weight - conBonus, floored at 0;
// battleSpeed = spd - effWt, floored at 0.
export function attackSpeed(c: Combatant): number {
  const effWt = Math.max(0, c.weapon.weight - c.unit.con);
  return Math.max(0, c.unit.spd - effWt);
}

// The melee weapon triangle. bmbattle.c applies a hit bonus of +/-15 and a
// damage bonus of +/-1. Only sword, lance, axe participate in slice A.
export function weaponTriangle(
  attacker: WeaponType,
  defender: WeaponType,
): { hitBonus: number; dmgBonus: number } {
  const beats: Record<string, WeaponType> = { sword: "axe", axe: "lance", lance: "sword" };
  const losesTo: Record<string, WeaponType> = { sword: "lance", axe: "sword", lance: "axe" };
  if (beats[attacker] === defender) return { hitBonus: 15, dmgBonus: 1 };
  if (losesTo[attacker] === defender) return { hitBonus: -15, dmgBonus: -1 };
  return { hitBonus: 0, dmgBonus: 0 };
}

// The GBA two random number correction, expressed as a closed form. The
// engine rolls the average of two integers in 0..99 (see roll2RN in rng.ts).
// The probability that this average is below a displayed rate d is:
//   d <= 50:  2 * (d/100)^2                       -> as a percent: d*d/50
//   d  > 50:  1 - 2 * ((100-d)/100)^2             -> 100 - (100-d)^2/50
// This matches the widely documented FE true hit curve.
export function trueHit2RN(displayed: number): number {
  const d = clamp(displayed, 0, 100);
  if (d <= 50) return (d * d) / 50;
  return 100 - ((100 - d) * (100 - d)) / 50;
}

// Everything one attacker does to one defender in a single matchup.
export function computeMatchup(attacker: Combatant, defender: Combatant): Matchup {
  const tri = weaponTriangle(attacker.weapon.type, defender.weapon.type);
  const magic = isMagic(attacker.weapon.type);

  // ComputeBattleUnitAttack: might + triangle dmg + power stat (effectiveness later).
  const powerStat = magic ? attacker.unit.mag : attacker.unit.str;
  const attack = attacker.weapon.might + tri.dmgBonus + powerStat;

  // ComputeBattleUnitDefense: res for magic, def otherwise. No terrain in slice A.
  const defenseStat = magic ? defender.unit.res : defender.unit.def;
  const damage = Math.max(0, attack - defenseStat);

  // ComputeBattleUnitHitRate: skl*2 + weapon hit + lck/2 + triangle hit.
  const rawHit =
    attacker.unit.skl * 2 +
    attacker.weapon.hit +
    Math.floor(attacker.unit.lck / 2) +
    tri.hitBonus;

  // ComputeBattleUnitAvoidRate: AS*2 + terrain(0) + lck.
  const defenderAvoid = Math.max(0, attackSpeed(defender) * 2 + defender.unit.lck);

  // ComputeBattleUnitEffectiveHitRate: hit - avoid, clamped 0..100.
  const displayedHit = clamp(rawHit - defenderAvoid, 0, 100);
  const trueHit = Math.round(trueHit2RN(displayedHit) * 10) / 10;

  // ComputeBattleUnitCritRate: weapon crit + skl/2. ComputeBattleUnitDodgeRate: lck.
  const rawCrit = attacker.weapon.crit + Math.floor(attacker.unit.skl / 2);
  const displayedCrit = clamp(rawCrit - defender.unit.lck, 0, 100);

  const as = attackSpeed(attacker);
  const doubles = as - attackSpeed(defender) >= FOLLOWUP_THRESHOLD;

  const hitsToKill = damage > 0 ? Math.ceil(defender.unit.hp / damage) : null;
  const roundsToKill =
    hitsToKill === null ? null : Math.ceil(hitsToKill / (doubles ? 2 : 1));

  return {
    damage,
    attackSpeed: as,
    displayedHit,
    trueHit,
    displayedCrit,
    doubles,
    hitsToKill,
    roundsToKill,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/combat.test.ts`
Expected: PASS, 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/combat.ts src/combat.test.ts
git commit -m "feat: FE8 combat stats and matchup math ported from decomp"
```

---

## Task 5: Deterministic report and seeded Monte Carlo duel

**Files:**
- Modify: `src/combat.ts` (append the duel simulation and report builders)
- Test: `src/duel.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/duel.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeterministic, runMonteCarlo } from "./combat.ts";
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

test("deterministic report computes both directions", () => {
  const player = fighter("p", unit({ str: 10, skl: 10, spd: 12 }), weapon({ type: "sword" }));
  const enemy = fighter("e", unit({ str: 6, skl: 4, spd: 5, def: 4 }), weapon({ type: "axe" }));
  const r = buildDeterministic(player, enemy);
  assert.ok(r.playerVsEnemy.damage > 0);
  assert.ok(r.enemyVsPlayer.damage >= 0);
});

test("monte carlo is deterministic for a fixed seed", () => {
  const player = fighter("p", unit({ hp: 24, str: 10, skl: 12, spd: 14, lck: 8 }), weapon({ type: "sword", hit: 90 }));
  const enemy = fighter("e", unit({ hp: 22, str: 8, skl: 6, spd: 8, def: 5, lck: 2 }), weapon({ type: "axe", hit: 75 }));
  const a = runMonteCarlo(player, enemy, { seed: 42, runs: 500 });
  const b = runMonteCarlo(player, enemy, { seed: 42, runs: 500 });
  assert.deepEqual(a, b);
});

test("overwhelming player wins nearly always", () => {
  const player = fighter("p", unit({ hp: 40, str: 25, skl: 20, spd: 20, lck: 15, def: 15 }), weapon({ type: "sword", hit: 100 }));
  const enemy = fighter("e", unit({ hp: 20, str: 3, skl: 2, spd: 2, def: 2, lck: 0 }), weapon({ type: "axe", hit: 60 }));
  const r = runMonteCarlo(player, enemy, { seed: 1, runs: 1000 });
  assert.ok(r.playerWinRate > 95, `expected >95, got ${r.playerWinRate}`);
  assert.equal(r.playerWins + r.enemyWins + r.stalemates, 1000);
});

test("two units that cannot hurt each other stalemate", () => {
  const player = fighter("p", unit({ str: 1, def: 40 }), weapon({ type: "sword", might: 1 }));
  const enemy = fighter("e", unit({ str: 1, def: 40 }), weapon({ type: "sword", might: 1 }));
  const r = runMonteCarlo(player, enemy, { seed: 5, runs: 100 });
  assert.equal(r.stalemates, 100);
  assert.equal(r.playerWins, 0);
  assert.equal(r.enemyWins, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/duel.test.ts`
Expected: FAIL, `buildDeterministic` / `runMonteCarlo` not exported.

- [ ] **Step 3: Append the duel logic to `src/combat.ts`**

Replace the existing import block at the top of `src/combat.ts` with this merged
block (it keeps `MAGIC_TYPES`, which `isMagic` still needs, and adds the new
report types plus the rng helpers):

```ts
import type {
  Combatant, Matchup, WeaponType,
  DeterministicReport, MonteCarloReport,
} from "./types.ts";
import { MAGIC_TYPES } from "./types.ts";
import { makeRng, roll2RN, type Rng } from "./rng.ts";
```

Then append to the end of `src/combat.ts`:

```ts
export function buildDeterministic(player: Combatant, enemy: Combatant): DeterministicReport {
  return {
    playerVsEnemy: computeMatchup(player, enemy),
    enemyVsPlayer: computeMatchup(enemy, player),
  };
}

// One strike: roll 2RN to hit, then roll crit, and return damage dealt.
function strike(m: Matchup, rng: Rng): number {
  if (!roll2RN(m.displayedHit, rng)) return 0;
  const crit = rng.next100() < m.displayedCrit;
  return crit ? m.damage * 3 : m.damage;
}

// Simulate one full duel. The player initiates each engagement. Within an
// engagement the initiator strikes, the defender counters if alive, then any
// doubler strikes again, matching the GBA follow up order. Returns the 1 based
// engagement number on which someone died, or null for a stalemate.
function simulateDuel(
  pm: Matchup, em: Matchup, playerHp: number, enemyHp: number, rng: Rng, cap: number,
): { winner: "player" | "enemy" | null; rounds: number } {
  let pHp = playerHp;
  let eHp = enemyHp;
  for (let round = 1; round <= cap; round++) {
    eHp -= strike(pm, rng);
    if (eHp <= 0) return { winner: "player", rounds: round };
    pHp -= strike(em, rng);
    if (pHp <= 0) return { winner: "enemy", rounds: round };
    if (pm.doubles) {
      eHp -= strike(pm, rng);
      if (eHp <= 0) return { winner: "player", rounds: round };
    }
    if (em.doubles) {
      pHp -= strike(em, rng);
      if (pHp <= 0) return { winner: "enemy", rounds: round };
    }
  }
  return { winner: null, rounds: cap };
}

export interface MonteCarloOptions {
  seed: number;
  runs: number;
  roundCap?: number; // safety bound so a stalemate cannot loop forever
}

export function runMonteCarlo(
  player: Combatant, enemy: Combatant, opts: MonteCarloOptions,
): MonteCarloReport {
  const roundCap = opts.roundCap ?? 100;
  const pm = computeMatchup(player, enemy);
  const em = computeMatchup(enemy, player);
  const rng = makeRng(opts.seed);

  let playerWins = 0;
  let enemyWins = 0;
  let stalemates = 0;
  let decisiveRoundTotal = 0;
  const deathRoundHistogram: number[] = new Array(roundCap + 1).fill(0);

  for (let i = 0; i < opts.runs; i++) {
    const out = simulateDuel(pm, em, player.unit.hp, enemy.unit.hp, rng, roundCap);
    if (out.winner === "player") playerWins++;
    else if (out.winner === "enemy") enemyWins++;
    else stalemates++;
    if (out.winner !== null) {
      decisiveRoundTotal += out.rounds;
      deathRoundHistogram[out.rounds]++;
    }
  }

  const decisive = playerWins + enemyWins;
  const pct = (n: number) => Math.round((n / opts.runs) * 1000) / 10;
  return {
    seed: opts.seed,
    runs: opts.runs,
    playerWins,
    enemyWins,
    stalemates,
    playerWinRate: pct(playerWins),
    enemyWinRate: pct(enemyWins),
    averageRounds: decisive === 0 ? 0 : Math.round((decisiveRoundTotal / decisive) * 10) / 10,
    deathRoundHistogram,
  };
}
```

Note: remove the now duplicated original import lines for `Combatant, Matchup, WeaponType` so the file has a single import block. The final import section imports the types listed above plus `MAGIC_TYPES` from `./types.ts` and the rng symbols.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/duel.test.ts`
Expected: PASS, 4 tests passed.

- [ ] **Step 5: Run the whole suite to catch import merge mistakes**

Run: `node --test`
Expected: PASS, all tests from Tasks 1, 2, 4, 5 pass.

- [ ] **Step 6: Commit**

```bash
git add src/combat.ts src/duel.test.ts
git commit -m "feat: deterministic report and seeded Monte Carlo duel"
```

---

## Task 6: Config data and datagen

**Files:**
- Create: `data/weapons.json`
- Create: `data/units.json`
- Create: `encounters/duel-01.json`
- Create: `src/datagen.ts`
- Test: `src/datagen.test.ts`

- [ ] **Step 1: Create the config files**

`data/weapons.json`:

```json
{
  "iron-sword": { "name": "Iron Sword", "type": "sword", "rank": "E", "might": 5, "hit": 90, "crit": 0, "weight": 5 },
  "iron-lance": { "name": "Iron Lance", "type": "lance", "rank": "E", "might": 7, "hit": 80, "crit": 0, "weight": 8 }
}
```

`data/units.json`:

```json
{
  "eirika-t": { "name": "Eirika", "hp": 24, "str": 9, "mag": 3, "skl": 13, "spd": 15, "lck": 12, "def": 7, "res": 6, "con": 5 },
  "wyvern-1": { "name": "Wyvern Rider", "hp": 30, "str": 12, "mag": 0, "skl": 8, "spd": 9, "lck": 2, "def": 11, "res": 2, "con": 13 }
}
```

`encounters/duel-01.json`:

```json
{
  "id": "duel-01",
  "notes": "Baseline pipeline proof: Eirika versus a lone Wyvern Rider.",
  "player": { "unit": "eirika-t", "weapon": "iron-sword" },
  "enemy":  { "unit": "wyvern-1", "weapon": "iron-lance" }
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/datagen.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBundle } from "./datagen.ts";

test("loads and resolves the baseline encounter", async () => {
  const bundle = await loadBundle("encounters/duel-01.json");
  assert.equal(bundle.encounter.id, "duel-01");
  assert.equal(bundle.player.unit.name, "Eirika");
  assert.equal(bundle.player.weapon.name, "Iron Sword");
  assert.equal(bundle.enemy.unit.name, "Wyvern Rider");
  assert.equal(bundle.enemy.weapon.type, "lance");
});

test("a missing weapon reference fails loudly", async () => {
  await assert.rejects(
    () => loadBundle("encounters/duel-01.json", {
      unitsPath: "data/units.json",
      weaponsPath: "data/units.json", // wrong file on purpose: no weapon keys
    }),
    /weapon/i,
  );
});

test("a malformed unit fails validation", async () => {
  await assert.rejects(
    () => loadBundle("src/datagen.test.ts"), // not an encounter at all
    /encounter|unit|weapon|json|parse/i,
  );
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test src/datagen.test.ts`
Expected: FAIL, `./datagen.ts` not found.

- [ ] **Step 4: Implement `src/datagen.ts`**

```ts
// Load config JSON, validate it, and resolve references into a DataBundle.
// Validation is intentionally strict and loud: a bad reference or a missing
// field throws with a clear message rather than producing a silent wrong
// bundle. This is the same intent as the .nmm schema layer in later tiers.

import { readFile } from "node:fs/promises";
import type {
  DataBundle, EncounterSpec, UnitDef, WeaponDef, WeaponType, Combatant,
} from "./types.ts";

const WEAPON_TYPES: WeaponType[] =
  ["sword", "lance", "axe", "bow", "anima", "light", "dark", "staff"];

const UNIT_NUMERIC_FIELDS: (keyof UnitDef)[] =
  ["hp", "str", "mag", "skl", "spd", "lck", "def", "res", "con"];

async function readJson(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new Error(`Cannot read config file: ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON in ${path}: ${(e as Error).message}`);
  }
}

function validateWeapon(id: string, w: any): WeaponDef {
  if (!w || typeof w !== "object") throw new Error(`Weapon ${id} is not an object`);
  if (typeof w.name !== "string") throw new Error(`Weapon ${id} missing name`);
  if (!WEAPON_TYPES.includes(w.type)) throw new Error(`Weapon ${id} has invalid type: ${w.type}`);
  for (const f of ["might", "hit", "crit", "weight"]) {
    if (typeof w[f] !== "number") throw new Error(`Weapon ${id} missing numeric ${f}`);
  }
  if (typeof w.rank !== "string") throw new Error(`Weapon ${id} missing rank`);
  return w as WeaponDef;
}

function validateUnit(id: string, u: any): UnitDef {
  if (!u || typeof u !== "object") throw new Error(`Unit ${id} is not an object`);
  if (typeof u.name !== "string") throw new Error(`Unit ${id} missing name`);
  for (const f of UNIT_NUMERIC_FIELDS) {
    if (typeof u[f] !== "number") throw new Error(`Unit ${id} missing numeric ${String(f)}`);
  }
  return u as UnitDef;
}

function validateEncounter(path: string, e: any): EncounterSpec {
  if (!e || typeof e !== "object") throw new Error(`Encounter ${path} is not an object`);
  if (typeof e.id !== "string") throw new Error(`Encounter ${path} missing id`);
  for (const side of ["player", "enemy"] as const) {
    if (!e[side] || typeof e[side].unit !== "string" || typeof e[side].weapon !== "string") {
      throw new Error(`Encounter ${path} ${side} must have string unit and weapon`);
    }
  }
  return e as EncounterSpec;
}

function resolveSide(
  label: string, ref: { unit: string; weapon: string },
  units: Record<string, UnitDef>, weapons: Record<string, WeaponDef>,
): Combatant {
  const unit = units[ref.unit];
  if (!unit) throw new Error(`${label} references unknown unit: ${ref.unit}`);
  const weapon = weapons[ref.weapon];
  if (!weapon) throw new Error(`${label} references unknown weapon: ${ref.weapon}`);
  return { id: ref.unit, unit, weaponId: ref.weapon, weapon };
}

export interface LoadPaths {
  unitsPath?: string;
  weaponsPath?: string;
}

export async function loadBundle(encounterPath: string, paths: LoadPaths = {}): Promise<DataBundle> {
  const unitsPath = paths.unitsPath ?? "data/units.json";
  const weaponsPath = paths.weaponsPath ?? "data/weapons.json";

  const rawUnits = await readJson(unitsPath) as Record<string, any>;
  const rawWeapons = await readJson(weaponsPath) as Record<string, any>;
  const rawEncounter = await readJson(encounterPath);

  const units: Record<string, UnitDef> = {};
  for (const [id, u] of Object.entries(rawUnits)) units[id] = validateUnit(id, u);

  const weapons: Record<string, WeaponDef> = {};
  for (const [id, w] of Object.entries(rawWeapons)) weapons[id] = validateWeapon(id, w);

  const encounter = validateEncounter(encounterPath, rawEncounter);
  const player = resolveSide("player", encounter.player, units, weapons);
  const enemy = resolveSide("enemy", encounter.enemy, units, weapons);

  return { weapons, units, encounter, player, enemy };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test src/datagen.test.ts`
Expected: PASS, 3 tests passed. Run these from the repo root so the relative paths resolve.

- [ ] **Step 6: Commit**

```bash
git add data/ encounters/ src/datagen.ts src/datagen.test.ts
git commit -m "feat: config data and strict datagen loader"
```

---

## Task 7: Headless preview and formatting

**Files:**
- Create: `src/format.ts`
- Create: `src/preview.ts`
- Test: `src/format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/format.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPreview } from "./combatpreview.ts";
import { formatPreview } from "./format.ts";
import { loadBundle } from "./datagen.ts";

test("formatted preview mentions both fighters and key numbers", async () => {
  const bundle = await loadBundle("encounters/duel-01.json");
  const result = buildPreview(bundle, { seed: 42, runs: 500 });
  const text = formatPreview(bundle, result);
  assert.match(text, /Eirika/);
  assert.match(text, /Wyvern Rider/);
  assert.match(text, /win rate/i);
  assert.match(text, /seed/i);
});
```

- [ ] **Step 2: Create the shared preview builder `src/combatpreview.ts`**

This small module ties datagen output to the engine so both the CLI and the browser use one entry point.

```ts
import type { DataBundle, PreviewResult } from "./types.ts";
import { buildDeterministic, runMonteCarlo, type MonteCarloOptions } from "./combat.ts";

export function buildPreview(bundle: DataBundle, mc: MonteCarloOptions): PreviewResult {
  return {
    encounterId: bundle.encounter.id,
    deterministic: buildDeterministic(bundle.player, bundle.enemy),
    monteCarlo: runMonteCarlo(bundle.player, bundle.enemy, mc),
  };
}
```

- [ ] **Step 3: Implement `src/format.ts`**

```ts
// Pure text rendering of a preview result for the headless launcher.
import type { DataBundle, PreviewResult, Matchup } from "./types.ts";

function killLine(m: Matchup): string {
  if (m.roundsToKill === null) return "cannot kill";
  return `${m.hitsToKill} hits, ${m.roundsToKill} rounds to kill`;
}

function matchupBlock(attackerName: string, defenderName: string, m: Matchup): string {
  return [
    `  ${attackerName} vs ${defenderName}:`,
    `    damage ${m.damage} per hit${m.doubles ? " (doubles)" : ""}`,
    `    displayed hit ${m.displayedHit}%, true hit ${m.trueHit}%`,
    `    crit ${m.displayedCrit}%`,
    `    ${killLine(m)}`,
  ].join("\n");
}

export function formatPreview(bundle: DataBundle, r: PreviewResult): string {
  const p = bundle.player.unit.name;
  const e = bundle.enemy.unit.name;
  const mc = r.monteCarlo;
  return [
    `Encounter: ${r.encounterId}`,
    `${p} (${bundle.player.weapon.name}) vs ${e} (${bundle.enemy.weapon.name})`,
    ``,
    `Deterministic breakdown:`,
    matchupBlock(p, e, r.deterministic.playerVsEnemy),
    matchupBlock(e, p, r.deterministic.enemyVsPlayer),
    ``,
    `Monte Carlo (${mc.runs} duels, seed ${mc.seed}):`,
    `  ${p} win rate: ${mc.playerWinRate}%`,
    `  ${e} win rate: ${mc.enemyWinRate}%`,
    `  stalemates: ${mc.stalemates}`,
    `  average rounds to resolve: ${mc.averageRounds}`,
    ``,
    `Note: this is a math preview. It is authoritative for pacing and difficulty`,
    `only, not for engine behavior such as animations, menus, or crashes.`,
  ].join("\n");
}
```

- [ ] **Step 4: Implement `src/preview.ts`**

```ts
// Headless entry point. Loads an encounter, runs the math, prints the result.
// Usage is handled by Preview.cmd, which passes the encounter path.

import { loadBundle } from "./datagen.ts";
import { buildPreview } from "./combatpreview.ts";
import { formatPreview } from "./format.ts";

const encounterArg = process.argv[2] ?? "encounters/duel-01.json";
const seedArg = Number(process.argv[3] ?? 42);
const runsArg = Number(process.argv[4] ?? 1000);

const bundle = await loadBundle(encounterArg);
const result = buildPreview(bundle, { seed: seedArg, runs: runsArg });
console.log(formatPreview(bundle, result));
```

- [ ] **Step 5: Run the test**

Run: `node --test src/format.test.ts`
Expected: PASS, 1 test passed.

- [ ] **Step 6: Run the preview by hand to eyeball it**

Run: `node src/preview.ts`
Expected: printed report showing Eirika vs Wyvern Rider, a deterministic breakdown, and Monte Carlo win rates that favor Eirika (she doubles and hits hard, the Wyvern Rider does little back).

- [ ] **Step 7: Commit**

```bash
git add src/combatpreview.ts src/format.ts src/preview.ts src/format.test.ts
git commit -m "feat: headless preview and shared preview builder"
```

---

## Task 8: The server (serve editor, strip TypeScript, save endpoint)

**Files:**
- Create: `src/server.ts`
- Test: `src/server.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/server.test.ts`. These test the pure helpers, which hold the risky logic (path safety and type stripping), without opening a socket.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toBrowserJs, safeConfigPath } from "./server.ts";

test("toBrowserJs strips TypeScript type syntax", () => {
  const ts = `export const x: number = 1;\nexport function f(a: string): string { return a; }\n`;
  const js = toBrowserJs(ts);
  assert.doesNotMatch(js, /: number/);
  assert.doesNotMatch(js, /: string/);
  assert.match(js, /export const x = 1/);
});

test("safeConfigPath accepts known config files", () => {
  assert.equal(safeConfigPath("data/units.json"), true);
  assert.equal(safeConfigPath("data/weapons.json"), true);
  assert.equal(safeConfigPath("encounters/duel-01.json"), true);
});

test("safeConfigPath rejects traversal and unknown paths", () => {
  assert.equal(safeConfigPath("../secret.txt"), false);
  assert.equal(safeConfigPath("data/../../etc/passwd"), false);
  assert.equal(safeConfigPath("src/server.ts"), false);
});

test("safeConfigPath rejects any path containing a traversal segment", () => {
  // Even though this normalizes onto an allowed file, a raw ".." is refused.
  assert.equal(safeConfigPath("encounters/../data/units.json"), false);
});
```

The final file has four tests: strip, accept, reject traversal, reject any "..".

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/server.test.ts`
Expected: FAIL, `./server.ts` exports not found.

- [ ] **Step 3: Implement `src/server.ts`**

```ts
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

// The only files the save endpoint is allowed to write. Anything else is denied.
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
};

async function serveFile(path: string): Promise<{ body: string; type: string }> {
  const ext = extname(path);
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

      // Only allow reading from these roots.
      const norm = normalize(filePath).replace(/\\/g, "/");
      const allowed =
        norm.startsWith("src/") || norm.startsWith("data/") || norm.startsWith("encounters/");
      if (norm.includes("..") || !allowed) {
        res.writeHead(404); res.end("not found"); return;
      }

      const { body, type } = await serveFile(norm);
      res.writeHead(200, { "content-type": type });
      res.end(body);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`server error: ${(e as Error).message}`);
    }
  });

  server.listen(PORT, () => {
    const target = `http://localhost:${PORT}/`;
    console.log(`FEArchitect editor running at ${target}`);
    console.log("Close this window to stop the editor.");
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/server.test.ts`
Expected: PASS, 4 tests passed. If `stripTypeScriptTypes` is not exported by `node:module` on this Node build, fall back to authoring the browser client as `.js` with JSDoc types (spec section 4 fallback) and change `serveFile` to serve `.ts` reads as is only for `.js` files. Verify Node version first with `node --version`.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/server.test.ts
git commit -m "feat: standard-library server with type stripping and safe save"
```

---

## Task 9: The editor page and client

**Files:**
- Create: `src/editor/formmodel.ts`
- Create: `src/editor/index.html`
- Create: `src/editor/client.ts`
- Test: `src/editor/formmodel.test.ts`

- [ ] **Step 1: Write the failing test for the pure form model**

Create `src/editor/formmodel.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { unitFields, weaponSelectValue, applyUnitField } from "./formmodel.ts";
import type { UnitDef } from "../types.ts";

test("unitFields lists every numeric stat in a stable order", () => {
  const fields = unitFields();
  assert.deepEqual(fields, ["hp", "str", "mag", "skl", "spd", "lck", "def", "res", "con"]);
});

test("applyUnitField updates one stat immutably", () => {
  const u: UnitDef = { name: "E", hp: 24, str: 9, mag: 3, skl: 13, spd: 15, lck: 12, def: 7, res: 6, con: 5 };
  const next = applyUnitField(u, "spd", 20);
  assert.equal(next.spd, 20);
  assert.equal(u.spd, 15); // original unchanged
});

test("weaponSelectValue returns the current weapon id", () => {
  assert.equal(weaponSelectValue("iron-sword"), "iron-sword");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/editor/formmodel.test.ts`
Expected: FAIL, `./formmodel.ts` not found.

- [ ] **Step 3: Implement `src/editor/formmodel.ts`**

```ts
// Pure helpers shared by the browser client, kept out of the DOM so they can be
// tested with the Node test runner.
import type { UnitDef } from "../types.ts";

const FIELDS: (keyof UnitDef)[] = ["hp", "str", "mag", "skl", "spd", "lck", "def", "res", "con"];

export function unitFields(): string[] {
  return FIELDS.map(String);
}

export function applyUnitField(u: UnitDef, field: string, value: number): UnitDef {
  return { ...u, [field]: value };
}

export function weaponSelectValue(weaponId: string): string {
  return weaponId;
}
```

- [ ] **Step 4: Run to verify the model test passes**

Run: `node --test src/editor/formmodel.test.ts`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Create `src/editor/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FEArchitect: 1v1 Preview</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; padding: 1rem; }
    h1 { font-size: 1.1rem; margin: 0 0 0.75rem; }
    .layout { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
    .panel { border: 1px solid #8888; border-radius: 8px; padding: 0.75rem; }
    .side { margin-bottom: 1rem; }
    label { display: flex; justify-content: space-between; gap: 0.5rem; margin: 0.15rem 0; }
    input[type=number] { width: 5rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.25rem 0.75rem; }
    .bars { display: grid; gap: 2px; }
    .bar { background: #4a90d9; height: 12px; }
    .controls { display: flex; gap: 0.5rem; align-items: center; margin: 0.5rem 0; flex-wrap: wrap; }
    .note { font-size: 0.8rem; opacity: 0.8; margin-top: 1rem; }
    button { padding: 0.3rem 0.7rem; }
    .saved { color: #2a2; }
  </style>
</head>
<body>
  <h1>FEArchitect: 1 player vs 1 enemy math preview</h1>
  <div class="layout">
    <div class="panel" id="editor">
      <div class="controls">
        <label>Initiator
          <select id="initiator">
            <option value="player">Player</option>
            <option value="enemy">Enemy</option>
          </select>
        </label>
        <button id="save">Save to disk</button>
        <span id="saveStatus"></span>
      </div>
      <div id="playerForm" class="side"></div>
      <div id="enemyForm" class="side"></div>
    </div>
    <div class="panel" id="results">
      <div class="controls">
        <label>Seed <input type="number" id="seed" value="42" /></label>
        <label>Runs <input type="number" id="runs" value="1000" /></label>
        <button id="reroll">Re-roll seed</button>
      </div>
      <div id="deterministic"></div>
      <div id="montecarlo"></div>
    </div>
  </div>
  <p class="note">
    This is a math preview. It is authoritative for encounter pacing and
    difficulty only, not for engine behavior such as animations, menus, skill
    interactions, or crashes. All math runs locally in your browser.
  </p>
  <script type="module" src="/src/editor/client.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Implement `src/editor/client.ts`**

```ts
// Browser client: fetch the config, build editable forms, run the same combat
// engine in the page, render results, and save edits back through the server.
// The engine modules are shared with Node, served as JavaScript by the server.

import type { DataBundle, UnitDef, WeaponDef, PreviewResult, Matchup } from "../types.ts";
import { buildDeterministic, runMonteCarlo } from "../combat.ts";
import { unitFields, applyUnitField } from "./formmodel.ts";

interface State {
  weapons: Record<string, WeaponDef>;
  units: Record<string, UnitDef>;
  encounter: DataBundle["encounter"];
  // Live, possibly edited copies:
  playerUnit: UnitDef; playerWeapon: string;
  enemyUnit: UnitDef; enemyWeapon: string;
}

let state: State;

async function boot(): Promise<void> {
  const [weapons, units, encounter] = await Promise.all([
    fetch("/data/weapons.json").then((r) => r.json()),
    fetch("/data/units.json").then((r) => r.json()),
    fetch("/encounters/duel-01.json").then((r) => r.json()),
  ]);
  state = {
    weapons, units, encounter,
    playerUnit: structuredClone(units[encounter.player.unit]),
    playerWeapon: encounter.player.weapon,
    enemyUnit: structuredClone(units[encounter.enemy.unit]),
    enemyWeapon: encounter.enemy.weapon,
  };
  renderForms();
  wireControls();
  recompute();
}

function combatant(id: string, unit: UnitDef, weaponId: string) {
  return { id, unit, weaponId, weapon: state.weapons[weaponId] };
}

function renderForms(): void {
  renderSide("playerForm", "Player", state.playerUnit, state.playerWeapon, (u) => (state.playerUnit = u), (w) => (state.playerWeapon = w));
  renderSide("enemyForm", "Enemy", state.enemyUnit, state.enemyWeapon, (u) => (state.enemyUnit = u), (w) => (state.enemyWeapon = w));
}

function renderSide(
  elId: string, label: string, unit: UnitDef, weaponId: string,
  setUnit: (u: UnitDef) => void, setWeapon: (w: string) => void,
): void {
  const host = document.getElementById(elId)!;
  host.innerHTML = `<strong>${label}: ${unit.name}</strong>`;
  const grid = document.createElement("div");
  grid.className = "grid";
  for (const field of unitFields()) {
    const lab = document.createElement("label");
    lab.textContent = field;
    const input = document.createElement("input");
    input.type = "number";
    input.value = String((unit as any)[field]);
    input.addEventListener("input", () => {
      setUnit(applyUnitField(unit, field, Number(input.value)));
      recompute();
    });
    lab.appendChild(input);
    grid.appendChild(lab);
  }
  host.appendChild(grid);

  const wlab = document.createElement("label");
  wlab.textContent = "weapon";
  const select = document.createElement("select");
  for (const [id, w] of Object.entries(state.weapons)) {
    const opt = document.createElement("option");
    opt.value = id; opt.textContent = w.name;
    if (id === weaponId) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => { setWeapon(select.value); recompute(); });
  wlab.appendChild(select);
  host.appendChild(wlab);
}

function currentSides() {
  const player = combatant("player", state.playerUnit, state.playerWeapon);
  const enemy = combatant("enemy", state.enemyUnit, state.enemyWeapon);
  const initiator = (document.getElementById("initiator") as HTMLSelectElement).value;
  return initiator === "enemy"
    ? { first: enemy, second: player, firstLabel: enemy.unit.name, secondLabel: player.unit.name }
    : { first: player, second: enemy, firstLabel: player.unit.name, secondLabel: enemy.unit.name };
}

function matchupHtml(atkName: string, defName: string, m: Matchup): string {
  const kill = m.roundsToKill === null ? "cannot kill" : `${m.hitsToKill} hits / ${m.roundsToKill} rounds`;
  return `<p><strong>${atkName} vs ${defName}</strong><br>
    damage ${m.damage}${m.doubles ? " (doubles)" : ""},
    hit ${m.displayedHit}% (true ${m.trueHit}%),
    crit ${m.displayedCrit}%, ${kill}</p>`;
}

function recompute(): void {
  const { first, second, firstLabel, secondLabel } = currentSides();
  const det = buildDeterministic(first, second);
  document.getElementById("deterministic")!.innerHTML =
    `<h3>Deterministic</h3>` +
    matchupHtml(firstLabel, secondLabel, det.playerVsEnemy) +
    matchupHtml(secondLabel, firstLabel, det.enemyVsPlayer);

  const seed = Number((document.getElementById("seed") as HTMLInputElement).value);
  const runs = Number((document.getElementById("runs") as HTMLInputElement).value);
  const mc = runMonteCarlo(first, second, { seed, runs });
  renderMonteCarlo(firstLabel, secondLabel, mc);
}

function renderMonteCarlo(firstLabel: string, secondLabel: string, mc: PreviewResult["monteCarlo"]): void {
  const host = document.getElementById("montecarlo")!;
  const maxBar = Math.max(1, ...mc.deathRoundHistogram);
  const bars = mc.deathRoundHistogram
    .map((count, round) => count === 0 ? "" :
      `<div title="round ${round}: ${count}"><div class="bar" style="width:${(count / maxBar) * 100}%"></div></div>`)
    .join("");
  host.innerHTML = `<h3>Monte Carlo (${mc.runs} duels, seed ${mc.seed})</h3>
    <p>${firstLabel} win ${mc.playerWinRate}% &middot; ${secondLabel} win ${mc.enemyWinRate}% &middot;
       stalemates ${mc.stalemates} &middot; avg rounds ${mc.averageRounds}</p>
    <div class="bars">${bars}</div>`;
}

function wireControls(): void {
  document.getElementById("initiator")!.addEventListener("change", recompute);
  document.getElementById("seed")!.addEventListener("input", recompute);
  document.getElementById("runs")!.addEventListener("input", recompute);
  document.getElementById("reroll")!.addEventListener("click", () => {
    (document.getElementById("seed") as HTMLInputElement).value = String(Math.floor(Math.random() * 1_000_000));
    recompute();
  });
  document.getElementById("save")!.addEventListener("click", save);
}

async function save(): Promise<void> {
  const status = document.getElementById("saveStatus")!;
  // Write the edited unit stats back into the units table under their ids.
  const units = structuredClone(state.units);
  units[state.encounter.player.unit] = state.playerUnit;
  units[state.encounter.enemy.unit] = state.enemyUnit;
  const encounter = structuredClone(state.encounter);
  encounter.player.weapon = state.playerWeapon;
  encounter.enemy.weapon = state.enemyWeapon;

  const r1 = await fetch("/save", { method: "POST", body: JSON.stringify({ path: "data/units.json", content: units }) });
  const r2 = await fetch("/save", { method: "POST", body: JSON.stringify({ path: `encounters/${encounter.id}.json`, content: encounter }) });
  if (r1.ok && r2.ok) {
    state.units = units; state.encounter = encounter;
    status.textContent = "saved";
    status.className = "saved";
  } else {
    status.textContent = "save failed";
    status.className = "";
  }
}

boot();
```

- [ ] **Step 7: Manual verification of the editor**

Run: `node src/server.ts`
Then in the browser that opens:
- Confirm both unit forms render with all nine stats and a weapon dropdown.
- Change the enemy's Spd and watch the deterministic hit and doubling update immediately.
- Change Runs and Seed and watch the Monte Carlo win rates update.
- Click Save, confirm "saved" appears, then check that `data/units.json` on disk reflects the edited stat.
Stop the server by closing its window or pressing Ctrl C in it.

- [ ] **Step 8: Commit**

```bash
git add src/editor/
git commit -m "feat: browser editor with live preview and save to disk"
```

---

## Task 10: Launchers, README, and final verification

**Files:**
- Create: `Open Editor.cmd`
- Create: `Preview.cmd`
- Create: `Test.cmd`
- Create: `README.md`

- [ ] **Step 1: Create `Open Editor.cmd`**

```bat
@echo off
rem Double-click to launch the FEArchitect editor. Starts the local server,
rem which opens your browser. Close this window to stop the editor.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node src\server.ts
pause
```

- [ ] **Step 2: Create `Preview.cmd`**

```bat
@echo off
rem Double-click to run the headless fight math for the baseline duel.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node src\preview.ts encounters\duel-01.json
echo.
pause
```

- [ ] **Step 3: Create `Test.cmd`**

```bat
@echo off
rem Double-click to run the whole test suite.
cd /d "%~dp0"
node --test
echo.
pause
```

- [ ] **Step 4: Create `README.md`**

```markdown
# FEArchitect

An FE8 encounter design sandbox. This is Slice A: a Tier 1 math preview for a
single player unit versus a single enemy. No ROM, no emulator, no grid.

## Requirements

Node.js 24 or newer (it runs the TypeScript directly, no build step). Check with
`node --version`.

## Use it

- Double-click **Open Editor.cmd** to open the editor in your browser. Edit unit
  stats and weapons on the left, watch the fight math update on the right, and
  click Save to write your changes back into the config files.
- Double-click **Preview.cmd** to print the fight math for the baseline duel
  without opening a browser.
- Double-click **Test.cmd** to run the test suite.

## Where the data lives

- `data/units.json`: unit stats.
- `data/weapons.json`: weapon stats.
- `encounters/duel-01.json`: which units and weapons face off.

You can edit these by hand, but the editor is the easy path and it validates as
it loads.

## What this does and does not tell you

The math preview is authoritative for encounter pacing and difficulty only. It is
not authoritative for engine behavior: animations, menus, skill interactions, and
crashes are decided by a real ROM build, which is a later tier of this project.

## Combat formulas

Ported from the fireemblem8u decomp (`src/bmbattle.c` ComputeBattleUnit
functions and `include/bmbattle.h`), including the two random number (2RN) hit
model and the attack speed difference of 4 needed to double. See comments in
`src/combat.ts` and `src/rng.ts` for the exact citations.
```

- [ ] **Step 5: Full verification pass**

Run: `node --test`
Expected: PASS, every test across all files passes. Record the pass count.

Run: `node src/preview.ts`
Expected: a clean printed report, Eirika favored.

Then double-click `Open Editor.cmd` from Explorer, confirm the browser opens to the editor, make an edit, save, and confirm the JSON on disk changed. This confirms the double-click path works outside a terminal.

- [ ] **Step 6: Commit**

```bash
git add "Open Editor.cmd" Preview.cmd Test.cmd README.md
git commit -m "feat: double-click launchers and project readme"
```

---

## Self-review notes (for the implementer)

- If `node --test` does not discover `.test.ts` files automatically on this Node
  build, pass them explicitly, for example `node --test "src/**/*.test.ts"`, or
  add a `Test.cmd` variant that globs. Confirm discovery early, in Task 1.
- If `stripTypeScriptTypes` is unavailable, switch the browser modules
  (`client.ts`, `formmodel.ts`, and the engine files they import) to `.js` with
  JSDoc types, per the spec fallback. The Node side can still run `.ts`.
- Keep every ported formula's decomp citation intact when editing `combat.ts`.
- The engine files imported by the browser (`combat.ts`, `rng.ts`, `types.ts`,
  `formmodel.ts`) must use `import type` for type-only imports so the browser
  never tries to fetch a types-only module at runtime.
```
