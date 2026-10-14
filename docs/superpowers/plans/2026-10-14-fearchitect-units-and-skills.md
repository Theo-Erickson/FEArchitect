# FEArchitect Units, Growths, and Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author our own units (class + base statblock + growths + skills), compute their statblocks (averaged or seeded-rolled), give them a starter skills system, place several per side on a scenario map, and view and inspect them with a combat forecast.

**Architecture:** Small pure modules do the work and are each tested on their own: statblock computation, the skills layer, and the FE8 class seeder. Combat gains an optional, defaulted-empty skills input so existing behavior is unchanged. The loader resolves authored units to statblocks and resolves a multi-unit scenario. The Play Map client gains a scenario view that renders placed units, inspects statblocks and skills, and forecasts a matchup. Everything is backward compatible with the current flat-stat units and 1v1 encounters.

**Tech Stack:** TypeScript on Node 24 (no build, no deps), the Node built-in test runner, the existing combat engine (`src/combat.ts`), RNG (`src/rng.ts`), and grid loader (`src/grid/`).

**Prose and code conventions:** No em dashes or en dashes anywhere. Use commas or colons. Comment new code well. Do NOT add Co-Authored-By or any attribution trailer to commits (project owner preference).

**Existing shapes to build on:**
- `src/types.ts`: `UnitDef { name, hp, str, mag, skl, spd, lck, def, res, con }`; `WeaponDef { name, type, rank, might, hit, crit, weight, range? }`; `Combatant { id, unit: UnitDef, weaponId, weapon: WeaponDef }`; `MAGIC_TYPES = ["anima","light","dark"]`; `TerrainMod { avoid, def, res? }`.
- `src/rng.ts`: `makeRng(seed): Rng`, `Rng.next100()` returns 0..99.
- `src/combat.ts`: `isMagic(type)`; `computeMatchup(attacker, defender, defenderTerrain = { avoid: 0, def: 0 })` returns a report including `damage` and hit/crit; `runMonteCarlo(...)`; `resolveExchange({ attacker, defender, attackerHp, defenderHp, attackerTerrain, defenderTerrain, defenderCanCounter, rng })`.
- `src/grid/types.ts`: `MovementType = "foot"|"cav"|"fly"`; `ClassDef { name, movementType, move }`; `GridUnit { id, side, unit, weapon, cls, ai, pos, hp }`; `GridEncounter { id, win, map, terrainDefs, player, enemy }`.
- `src/grid/resolve.ts`: `resolveGridEncounter(rawEnc, rawUnits, rawWeapons, rawTerrain, rawClasses, rawMap)`, `validateClasses`, `resolveMap`.
- `src/grid/datagen.ts`: `loadGridEncounter(encounterPath, paths)`.
- FE8 class library: `assets/reference/fe8/classes.json` entries carry `BaseHP, BasePow, BaseSkl, BaseSpd, BaseDef, BaseRes, BaseCon, BaseMov, MaxHP, MaxPow, MaxSkl, MaxSpd, MaxDef, MaxRes, MaxCon, GrowthHP, GrowthPow, GrowthSkl, GrowthSpd, GrowthDef, GrowthRes, GrowthLck, SwordRank, LanceRank, AxeRank, BowRank, StaffRank, AnimaRank, LightRank, DarkRank, MovCostPointer` (ranks are numbers, 0 means cannot use).
- `tools/assetgen/paths.ts`: `cliPath, romPath, gameDir, presentGames`; `tools/assetgen/mapgen.ts` shows the generator pattern.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `src/types.ts` | MODIFY: extend `Combatant` with optional `skills`; add `Skill`, `StatBlock` types. |
| `src/grid/types.ts` | MODIFY: extend `ClassDef` (bases, caps, growths, weaponRanks, skills); add `UnitAuthor`. |
| `src/grid/statblock.ts` | Create: pure `computeStatblock`. |
| `src/grid/statblock.test.ts` | Tests. |
| `src/grid/skills.ts` | Create: pure skill resolution, passive stat mods, combat effect helpers. |
| `src/grid/skills.test.ts` | Tests. |
| `data/skills.json` | Create: the starter five skills. |
| `src/combat.ts` | MODIFY: optional per-combatant skills in matchup, Monte Carlo, exchange. |
| `src/combat.test.ts` | Tests for skill effects. |
| `tools/assetgen/simclasses.ts` | Create: pure FE8 class to sim class converter. |
| `tools/assetgen/simclasses.test.ts` | Tests. |
| `tools/assetgen/gensimclasses.ts` | Create: generator writing `assets/reference/fe8/sim-classes.json`. |
| `src/grid/resolve.ts` | MODIFY: resolve authored units to statblocks; resolve multi-unit scenarios. |
| `src/grid/resolve.test.ts` | Tests. |
| `src/game/*`, `src/grid/render.ts` | MODIFY: scenario view (render, inspect, forecast). |
| `data/`, `encounters/` | Example classes, units with skills, and a multi-unit scenario. |

---

## Task 1: Types for classes, authored units, and skills

**Files:** Modify `src/types.ts`, `src/grid/types.ts`.

- [ ] **Step 1: Add shared types in `src/types.ts`**

Add after `UnitDef`:

```ts
// The nine sim stats as a plain record (used for bases, caps, growths, and output).
export type StatBlock = Pick<UnitDef, "hp" | "str" | "mag" | "skl" | "spd" | "lck" | "def" | "res" | "con">;

// A skill definition. statMod skills add flat stats; combat skills apply in battle.
export interface Skill {
  name: string;
  kind: "statMod" | "combat";
  mods?: Partial<StatBlock>;                 // statMod
  trigger?: "defendBelowHalf" | "sklRate";   // combat
  effect?: "strikeFirst" | "ignoreDef" | "lifesteal" | "halveDamage"; // combat
}
```

Extend `Combatant` with an optional resolved skills list (ids plus the defs are
passed where needed; here we keep the resolved `Skill` objects for combat):

```ts
export interface Combatant {
  id: string;
  unit: UnitDef;
  weaponId: string;
  weapon: WeaponDef;
  skills?: Skill[]; // resolved combat-relevant skills; defaults to none
}
```

- [ ] **Step 2: Extend `ClassDef` and add `UnitAuthor` in `src/grid/types.ts`**

```ts
import type { StatBlock } from "../types.ts";

export interface ClassDef {
  name: string;
  movementType: MovementType;
  move: number;
  // Authoring extras (optional so the minimal showcase classes still validate):
  bases?: Partial<StatBlock>;
  caps?: Partial<StatBlock>;
  growths?: Partial<StatBlock>;
  weaponRanks?: Record<string, string>;
  skills?: string[];
}

// An authored unit: a class plus a base statblock, growths, a level, and skills.
export interface UnitAuthor {
  name: string;
  class?: string;
  level?: number;
  baseLevel?: number;
  bases?: Partial<StatBlock>;
  growths?: Partial<StatBlock>;
  skills?: string[];
  // A flat-stat unit (current form) instead carries hp/str/... directly.
}
```

- [ ] **Step 3: Typecheck the project loads**

Run: `node --test src/grid/resolve.test.ts src/combat.test.ts`
Expected: PASS (types compile, existing behavior unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/grid/types.ts
git commit -m "feat: types for authored units, class stats, and skills"
```

---

## Task 2: Statblock computation (pure)

**Files:** Create `src/grid/statblock.ts`, `src/grid/statblock.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStatblock } from "./statblock.ts";

const paladin: any = {
  name: "Paladin", movementType: "cav", move: 8,
  bases: { hp: 23, str: 7, mag: 0, skl: 4, spd: 7, def: 8, res: 3, con: 11 },
  caps:  { hp: 60, str: 25, mag: 25, skl: 26, spd: 24, def: 25, res: 25, con: 25 },
  growths: { hp: 70, str: 25, mag: 0, skl: 30, spd: 18, def: 12, res: 20, lck: 25 },
};
const seth: any = {
  name: "Seth", class: "paladin", level: 1, baseLevel: 1,
  bases: { hp: 30, str: 14, mag: 0, skl: 13, spd: 12, lck: 13, def: 11, res: 8, con: 11 },
  growths: { hp: 50, str: 40, mag: 0, skl: 30, spd: 30, lck: 30, def: 25, res: 25 },
};

test("averaged statblock uses base plus floored combined growth, capped", () => {
  const s = computeStatblock(seth, paladin, { level: 11, mode: "avg" });
  // 10 levels. str: base 14 + floor((40+25)*10/100)=6 -> 20. hp: 30 + floor((50+70)*10/100)=12 -> 42.
  assert.equal(s.str, 20);
  assert.equal(s.hp, 42);
  // spd would be 12 + floor((30+18)*10/100)=4 -> 16, under cap 24.
  assert.equal(s.spd, 16);
});

test("averaged statblock clamps at the class cap", () => {
  const capped = computeStatblock({ ...seth, growths: { ...seth.growths, str: 999 } }, paladin, { level: 20, mode: "avg" });
  assert.equal(capped.str, 25); // cap
});

test("a flat-stat unit with no class returns its stats unchanged", () => {
  const flat: any = { name: "Eirika", hp: 24, str: 9, mag: 3, skl: 13, spd: 15, lck: 12, def: 7, res: 6, con: 5 };
  assert.deepEqual(computeStatblock(flat, undefined), {
    name: "Eirika", hp: 24, str: 9, mag: 3, skl: 13, spd: 15, lck: 12, def: 7, res: 6, con: 5,
  });
});

test("rolled mode is deterministic per seed and gives a floor plus a chance", () => {
  const a = computeStatblock(seth, paladin, { level: 11, mode: "rolled", seed: 5 });
  const b = computeStatblock(seth, paladin, { level: 11, mode: "rolled", seed: 5 });
  assert.deepEqual(a, b); // same seed, same result
  assert.ok(a.str >= 14); // never below base
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test src/grid/statblock.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/grid/statblock.ts`**

```ts
// Compute a unit's effective statblock from its class, bases, growths, and level.
// Averaged (deterministic) or rolled from a seed. A flat-stat unit (no class, no
// bases) is returned unchanged. See the units/skills spec.
import type { UnitDef, StatBlock } from "../types.ts";
import type { ClassDef } from "./types.ts";
import { makeRng } from "../rng.ts";

const GROWABLE: (keyof StatBlock)[] = ["hp", "str", "mag", "skl", "spd", "lck", "def", "res"];
const ALL: (keyof StatBlock)[] = [...GROWABLE, "con"];

export interface StatOpts { level?: number; mode?: "avg" | "rolled"; seed?: number; }

export function computeStatblock(unit: any, cls: ClassDef | undefined, opts: StatOpts = {}): UnitDef {
  // Flat-stat unit: no class and no authored bases -> return its stats as is.
  if (!cls && !unit.bases) {
    return { name: unit.name, hp: unit.hp, str: unit.str, mag: unit.mag, skl: unit.skl, spd: unit.spd, lck: unit.lck, def: unit.def, res: unit.res, con: unit.con };
  }
  const level = opts.level ?? unit.level ?? 1;
  const baseLevel = unit.baseLevel ?? level;
  const levels = Math.max(0, level - baseLevel);
  const mode = opts.mode ?? "avg";
  const rng = makeRng(opts.seed ?? 0);
  const baseOf = (s: keyof StatBlock) => unit.bases?.[s] ?? cls?.bases?.[s] ?? 0;
  const growthOf = (s: keyof StatBlock) => (unit.growths?.[s] ?? 0) + (cls?.growths?.[s] ?? 0);
  const capOf = (s: keyof StatBlock) => cls?.caps?.[s] ?? Infinity;

  const out: any = { name: unit.name };
  out.con = Math.min(baseOf("con"), capOf("con"));
  for (const s of GROWABLE) {
    let v = baseOf(s);
    const g = growthOf(s);
    if (mode === "avg") {
      v += Math.floor((g * levels) / 100);
    } else {
      for (let i = 0; i < levels; i++) {
        v += Math.floor(g / 100);
        if (rng.next100() < g % 100) v += 1;
      }
    }
    out[s] = Math.min(v, capOf(s));
  }
  return out as UnitDef;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/grid/statblock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/grid/statblock.ts src/grid/statblock.test.ts
git commit -m "feat: unit statblock computation (averaged and seeded-rolled)"
```

---

## Task 3: Skills module (pure)

**Files:** Create `src/grid/skills.ts`, `src/grid/skills.test.ts`, `data/skills.json`.

- [ ] **Step 1: Create `data/skills.json`**

```json
{
  "str_plus_2": { "name": "Strength +2", "kind": "statMod", "mods": { "str": 2 } },
  "vantage":    { "name": "Vantage", "kind": "combat", "trigger": "defendBelowHalf", "effect": "strikeFirst" },
  "luna":       { "name": "Luna",    "kind": "combat", "trigger": "sklRate", "effect": "ignoreDef" },
  "sol":        { "name": "Sol",     "kind": "combat", "trigger": "sklRate", "effect": "lifesteal" },
  "pavise":     { "name": "Pavise",  "kind": "combat", "trigger": "sklRate", "effect": "halveDamage" }
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSkills, passiveStatMods, hasEffect } from "./skills.ts";
import type { Skill } from "../types.ts";

const DEFS: Record<string, Skill> = {
  str_plus_2: { name: "Strength +2", kind: "statMod", mods: { str: 2 } },
  luna: { name: "Luna", kind: "combat", trigger: "sklRate", effect: "ignoreDef" },
};

test("resolveSkills merges unit and class skill ids into defs, ignoring unknowns", () => {
  const got = resolveSkills(["str_plus_2", "nope"], ["luna"], DEFS);
  assert.deepEqual(got.map((s) => s.name), ["Strength +2", "Luna"]);
});

test("passiveStatMods sums statMod skills", () => {
  assert.deepEqual(passiveStatMods([DEFS.str_plus_2, DEFS.luna]), { str: 2 });
});

test("hasEffect finds a combat effect", () => {
  assert.equal(hasEffect([DEFS.luna], "ignoreDef"), true);
  assert.equal(hasEffect([DEFS.luna], "lifesteal"), false);
});
```

- [ ] **Step 3: Implement `src/grid/skills.ts`**

```ts
// Resolve skill ids to definitions and expose small helpers for statblock and combat.
import type { Skill, StatBlock } from "../types.ts";

// Unit skills plus class skills, resolved to defs; unknown ids are dropped.
export function resolveSkills(unitSkills: string[] = [], classSkills: string[] = [], defs: Record<string, Skill>): Skill[] {
  const ids = [...unitSkills, ...classSkills];
  const seen = new Set<string>();
  const out: Skill[] = [];
  for (const id of ids) {
    if (seen.has(id) || !defs[id]) continue;
    seen.add(id);
    out.push(defs[id]);
  }
  return out;
}

// Flat stat additions from statMod skills.
export function passiveStatMods(skills: Skill[]): Partial<StatBlock> {
  const out: Partial<StatBlock> = {};
  for (const s of skills) {
    if (s.kind !== "statMod" || !s.mods) continue;
    for (const [k, v] of Object.entries(s.mods)) out[k as keyof StatBlock] = (out[k as keyof StatBlock] ?? 0) + (v ?? 0);
  }
  return out;
}

export function hasEffect(skills: Skill[] | undefined, effect: Skill["effect"]): boolean {
  return !!skills?.some((s) => s.kind === "combat" && s.effect === effect);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test src/grid/skills.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/grid/skills.ts src/grid/skills.test.ts data/skills.json
git commit -m "feat: data-driven skills module and starter skill set"
```

---

## Task 4: FE8 class seeder (pure) and generator

**Files:** Create `tools/assetgen/simclasses.ts`, `tools/assetgen/simclasses.test.ts`, `tools/assetgen/gensimclasses.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toSimClass, FLY_MOVCOST, HORSE_MOVCOST } from "./simclasses.ts";

const paladin: any = {
  name: "Paladin\u001f", BaseHP: 23, BasePow: 7, BaseSkl: 4, BaseSpd: 7, BaseDef: 8, BaseRes: 3, BaseCon: 11, BaseMov: 8,
  MaxHP: 60, MaxPow: 25, MaxSkl: 26, MaxSpd: 24, MaxDef: 25, MaxRes: 25, MaxCon: 25,
  GrowthHP: 70, GrowthPow: 25, GrowthSkl: 30, GrowthSpd: 18, GrowthDef: 12, GrowthRes: 20, GrowthLck: 25,
  SwordRank: 181, LanceRank: 181, AxeRank: 0, BowRank: 0, StaffRank: 0, AnimaRank: 0, LightRank: 0, DarkRank: 0,
  MovCostPointer: "0x0880BAD3",
};
const mage: any = { ...paladin, name: "Mage", AnimaRank: 1, SwordRank: 0, LanceRank: 0, MovCostPointer: "0x0880B849" };

test("toSimClass routes Pow to str for a physical class, cav movement from the table", () => {
  const c = toSimClass(paladin);
  assert.equal(c.movementType, "cav");
  assert.equal(c.bases.str, 7);
  assert.equal(c.bases.mag, 0);
  assert.equal(c.growths.str, 25);
  assert.equal(c.caps.str, 25);
  assert.equal(c.move, 8);
});

test("toSimClass routes Pow to mag for a magic class", () => {
  const c = toSimClass(mage);
  assert.equal(c.bases.mag, 7);
  assert.equal(c.bases.str, 0);
  assert.equal(c.growths.mag, 25);
  assert.equal(c.growths.str, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/assetgen/simclasses.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `tools/assetgen/simclasses.ts`**

```ts
// Convert an extracted FE8 class record into our sim class format. GBAFE has one Pow
// stat; route it to mag if the class has any magic weapon rank, else str. Movement
// type comes from the class move-cost table pointer. See the units/skills spec.
const clean = (s: string) => String(s).replace(/[\u0000-\u001f]/g, "").trim();

// FE8U move-cost table pointers (from docs/superpowers/notes/fe8-map-format.md work).
export const FLY_MOVCOST = "0x0880BB96";
export const HORSE_T1 = "0x0880BA92";
export const HORSE_T2 = "0x0880BAD3";
export const HORSE_MOVCOST = [HORSE_T1, HORSE_T2];

function movementType(c: any): "foot" | "cav" | "fly" {
  const p = String(c.MovCostPointer ?? "").toUpperCase();
  if (p === FLY_MOVCOST.toUpperCase()) return "fly";
  if (HORSE_MOVCOST.map((h) => h.toUpperCase()).includes(p)) return "cav";
  return "foot";
}

function isMagicClass(c: any): boolean {
  return (c.AnimaRank || 0) > 0 || (c.LightRank || 0) > 0 || (c.DarkRank || 0) > 0 || (c.StaffRank || 0) > 0;
}

export function toSimClass(c: any): any {
  const magic = isMagicClass(c);
  const pow = (physical: number, magical: number) => (magic ? { str: 0, mag: magical } : { str: physical, mag: 0 });
  return {
    name: clean(c.name),
    movementType: movementType(c),
    move: c.BaseMov ?? 5,
    bases: { hp: c.BaseHP, ...pow(c.BasePow, c.BasePow), skl: c.BaseSkl, spd: c.BaseSpd, def: c.BaseDef, res: c.BaseRes, con: c.BaseCon },
    caps: { hp: c.MaxHP, ...pow(c.MaxPow, c.MaxPow), skl: c.MaxSkl, spd: c.MaxSpd, def: c.MaxDef, res: c.MaxRes, con: c.MaxCon },
    growths: { hp: c.GrowthHP, ...pow(c.GrowthPow, c.GrowthPow), skl: c.GrowthSkl, spd: c.GrowthSpd, def: c.GrowthDef, res: c.GrowthRes, lck: c.GrowthLck },
    skills: [],
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/assetgen/simclasses.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the generator `tools/assetgen/gensimclasses.ts`**

```ts
// Write assets/reference/fe8/sim-classes.json from the extracted FE8 classes.
// Gitignored (ROM derived). Run: node tools/assetgen/gensimclasses.ts
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { toSimClass } from "./simclasses.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

async function main(): Promise<void> {
  const src = join(ROOT, "assets/reference/fe8/classes.json");
  if (!existsSync(src)) throw new Error("Run Import Assets first: assets/reference/fe8/classes.json is missing.");
  const classes = JSON.parse(await readFile(src, "utf8"));
  const out: Record<string, any> = {};
  for (const c of classes) {
    const sim = toSimClass(c);
    if (!sim.name) continue;
    const id = sim.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `class-${c.id}`;
    out[id] = sim;
  }
  await writeFile(join(ROOT, "assets/reference/fe8/sim-classes.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${Object.keys(out).length} sim classes.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 6: Run the generator and spot-check**

Run: `node --no-warnings tools/assetgen/gensimclasses.ts`
Expected: writes `assets/reference/fe8/sim-classes.json`. Spot-check a physical and a
magic class route Pow correctly:

```bash
node -e "const c=require('./assets/reference/fe8/sim-classes.json'); const k=Object.keys(c); console.log('count',k.length); const p=c['paladin']; console.log('paladin', p&&p.movementType, p&&p.bases.str, p&&p.bases.mag); const m=c['mage']; console.log('mage', m&&m.bases.mag, m&&m.bases.str);"
```
Expected: a paladin with cav movement and str set, a mage with mag set and str 0.

- [ ] **Step 7: Commit**

```bash
git add tools/assetgen/simclasses.ts tools/assetgen/simclasses.test.ts tools/assetgen/gensimclasses.ts
git commit -m "feat: seed a sim class library from FE8 canon (rank-based Pow routing)"
```

---

## Task 5: Skills in combat

**Files:** Modify `src/combat.ts`, `src/combat.test.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `src/combat.test.ts` (the `fighter` helper exists; extend a fighter with
skills via a spread):

```ts
import type { Skill } from "./types.ts";
const luna: Skill = { name: "Luna", kind: "combat", trigger: "sklRate", effect: "ignoreDef" };
const pavise: Skill = { name: "Pavise", kind: "combat", trigger: "sklRate", effect: "halveDamage" };

test("Luna annotation reports the skl rate and the on-activation damage", () => {
  const atk = { ...fighter(unit({ str: 10, skl: 20 }), weapon({ type: "sword", might: 5 })), skills: [luna] };
  const def = fighter(unit({ def: 8 }), weapon({ type: "sword" }));
  const m = computeMatchup(atk, def);
  // normal damage 15 - 8 = 7; on Luna, ignores def -> 15.
  assert.equal(m.damage, 7);
  assert.ok(m.skillNotes?.some((n: any) => n.skill === "Luna" && n.rate === 20 && n.damage === 15));
});
```

(Extend `computeMatchup` to return a `skillNotes` array on the report when the
attacker has activation skills; keep all other fields unchanged.)

- [ ] **Step 2: Apply skills in `src/combat.ts`**

Add the helpers and thread skills through:

```ts
import { hasEffect } from "./grid/skills.ts";
```

In `computeMatchup`, after computing `damage`, build annotations for the attacker's
activation skills without changing the base numbers:

```ts
  const skillNotes: { skill: string; rate: number; damage?: number; note?: string }[] = [];
  const rate = attacker.unit.skl; // activation like crit, skl%
  if (hasEffect(attacker.skills, "ignoreDef")) {
    const lunaDmg = Math.max(0, attack - 0); // ignores def and terrain def
    skillNotes.push({ skill: "Luna", rate, damage: lunaDmg });
  }
  if (hasEffect(attacker.skills, "lifesteal")) skillNotes.push({ skill: "Sol", rate, note: "recovers HP equal to damage" });
  if (hasEffect(defender.skills, "halveDamage")) skillNotes.push({ skill: "Pavise", rate: defender.unit.skl, damage: Math.floor(damage / 2) });
```

Return `skillNotes` as an added field on the report object. Add `skillNotes?: ...` to
the report type.

In `resolveExchange`, apply the effects when rolled (reuse the exchange `rng`):

- Before building the strike order, if the defender `hasEffect("strikeFirst")` and
  `defenderHp * 2 <= defenderMaxHp`, the defender strikes first. (Pass the defender
  max HP in, or treat the current `defenderHp` passed as full at the start of the
  exchange: use the unit's `hp` stat as max.)
- On each attacker hit, if `hasEffect(attacker.skills, "ignoreDef")` and
  `rng.next100() < attacker.unit.skl`, recompute that hit's damage ignoring defense.
- On each attacker hit, if `hasEffect(attacker.skills, "lifesteal")` and the roll
  succeeds, add the damage dealt back to the attacker HP (capped at max).
- On each incoming hit, if the defender `hasEffect("halveDamage")` and the roll
  succeeds, halve the damage.

Keep every skill behind the optional `skills` field so a combatant without skills
behaves exactly as before. Add focused tests in `src/combat.test.ts` for Vantage
order, Sol healing, and Pavise halving using a fixed seed.

- [ ] **Step 3: Run to verify**

Run: `node --test src/combat.test.ts`
Expected: PASS, including the new skill tests and all prior ones.

- [ ] **Step 4: Commit**

```bash
git add src/combat.ts src/combat.test.ts
git commit -m "feat: skills in combat (Luna, Sol, Pavise, Vantage) as an optional layer"
```

---

## Task 6: Resolve authored units and multi-unit scenarios

**Files:** Modify `src/grid/resolve.ts`, `src/grid/datagen.ts`, `src/grid/resolve.test.ts`.

- [ ] **Step 1: Resolve a unit reference to a computed `UnitDef`**

In `resolve.ts`, add a helper that, given a raw unit, the class defs, and the skill
defs, returns a resolved `UnitDef` (via `computeStatblock`) plus its resolved skills.
Use it wherever `buildUnit` currently reads `units[ref.unit]`. Classes are looked up
from the merged class set (custom `data/classes.json` plus, when present, the FE8
`assets/reference/fe8/sim-classes.json`). Passive skill stat mods are added to the
statblock here.

- [ ] **Step 2: Resolve the multi-unit scenario format**

Add a resolver that accepts either the current `{ player, enemy }` encounter or a
`{ units: [{ unit, weapon, side, at, ai }] }` scenario, producing a list of
`GridUnit`. For the viewer this slice does not require the 1v1 `GridEncounter`
(player/enemy) for scenarios: expose a `ResolvedScenario { id, map, units: GridUnit[] }`
and keep `resolveGridEncounter` for the existing 1v1 play.

- [ ] **Step 3: Tests**

Add to `src/grid/resolve.test.ts`:
- A unit defined by class + bases + growths resolves to the expected computed stats.
- A unit with `skills: ["str_plus_2"]` has the passive folded into its stats.
- A multi-unit scenario resolves to the right number of `GridUnit`s on each side with
  correct positions.
- The existing 1v1 encounter still resolves.

Run: `node --test src/grid/resolve.test.ts`
Expected: PASS.

- [ ] **Step 4: Example content**

Create a couple of authored classes in `data/classes.json` (keep the existing three),
one or two authored units in `data/units.json` with `class` + `bases` + `growths` +
`skills`, and a multi-unit scenario `encounters/scenario-01.json` placing two or three
units per side on `showcase-terrain` (or on `fe8-1` with `"terrain": "fe8"`).

- [ ] **Step 5: Commit**

```bash
git add src/grid/resolve.ts src/grid/datagen.ts src/grid/resolve.test.ts data/classes.json data/units.json encounters/scenario-01.json
git commit -m "feat: resolve authored units to statblocks and multi-unit scenarios"
```

---

## Task 7: Scenario view (place, inspect, forecast)

**Files:** Modify `src/game/client.ts`, `src/game/index.html`, `src/grid/render.ts` as needed.

- [ ] **Step 1: Load a scenario and render all units**

In the client, when the selected encounter is a multi-unit scenario, load it via the
scenario resolver and render every unit as a token (reuse `unitSprite`, color by
side: player blue, enemy red), on the showcase grid or the chapter PNG backdrop (the
chapter path from Task 6 of the terrain slice already works). No movement ranges in
this view.

- [ ] **Step 2: Inspect a unit**

Clicking a unit shows a panel with its name, class, level, computed statblock, and
its skills (name and a short description). Reuse the existing side panel area.

- [ ] **Step 3: Forecast a matchup**

Let the user pick an attacker and a defender (for example click one unit then another)
and show the combat forecast using the existing preview (`computeMatchup` or the
deterministic report), including the `skillNotes` annotations under the forecast.

- [ ] **Step 4: Verify in the browser**

Run: `node --no-warnings src/server.ts /src/game/index.html`, select the scenario,
confirm: all units appear at their tiles, a unit inspects to the right statblock and
skills, and a forecast between two units shows damage/hit and skill annotations
(Luna rate, Sol note, Pavise). Stop the server.

- [ ] **Step 5: Run the full suite and commit**

Run: `node --test`
Expected: PASS, the full suite including statblock, skills, simclasses, combat skill,
and resolve tests.

```bash
git add src/game/client.ts src/game/index.html src/grid/render.ts
git commit -m "feat: scenario view with unit inspection and matchup forecast"
```

---

## Self-review notes (for the implementer)

- Backward compatibility is the throughline: every new field is optional, flat-stat
  units pass through `computeStatblock` unchanged, the combat `skills` input defaults
  empty, and the 1v1 encounter path is untouched. Run the full suite after Tasks 1,
  5, and 6 to confirm nothing regressed.
- Tasks 2, 3, and 4 are independent once Task 1's types land, so they can be built in
  parallel; Task 5 depends on Task 3, Task 6 on Tasks 2, 3 (and the FE8 library from
  Task 4 when a unit uses a seeded class), and Task 7 on Task 6.
- The FE8 `sim-classes.json` is ROM derived and gitignored; the authored example
  classes and units in `data/` are committed (custom, not ROM derived).
- Keep the deterministic `computeMatchup` numbers unchanged: skills are reported as
  annotations there, and only actually applied in the rolled paths (`runMonteCarlo`,
  `resolveExchange`).
- `con` is not a growable stat: it is taken from the base (unit then class), capped.
- The starter skill set is fixed at five; SkillSystems integration and custom skill
  authoring are a later track (see the spec section 9).
