# FEArchitect Units, Growths, and Skills

Date: 2026-10-14
Status: Approved for planning
Author: Claude (Opus 4.8) with Theo (Technical Game Designer)

## Prose and code conventions

No em dashes or en dashes anywhere in this document or in code and comments. Use
colons or commas instead. Do not add Co-Authored-By or any attribution trailer to
commits (project owner preference, recorded in memory).

## 1. Purpose

Start authoring our own content. A unit becomes a class plus a base statblock plus
growths, computed to a statblock at a level (averaged, or rolled from a seed). Units
carry skills. Several units per side are placed on a scenario map and viewed and
inspected, with a combat forecast between any two. This is the data foundation for
the MCP map and scenario authoring north star. It is read/author and inspect only:
full multi-unit turn play, a unit editor UI, and MCP authoring are later tracks.

## 2. Current model and what changes

Today: `data/units.json` units are flat final stats plus a movement-only `class`;
`data/classes.json` has three classes with only `name`, `movementType`, `move`;
`data/weapons.json` has weapon stats; encounters are strictly 1v1 (`player`,
`enemy`). The grid engine stays 1v1 for play.

This adds, all backward compatible (existing flat-stat units and 1v1 encounters keep
working):

- Rich classes (bases, caps, growths, weapon ranks, class skills), with the existing
  three classes still valid (new fields optional).
- Units that reference a class and carry a base statblock, growths, a level, and
  skills, from which an effective statblock is computed.
- A data-driven skills system with a starter set, applied to statblocks and combat.
- A multi-unit scenario format and a place-and-inspect viewer.

## 3. Success criteria

1. **Classes.** A class may carry `bases`, `caps`, `growths`, `weaponRanks`, and
   `skills`. The existing minimal classes still load.
2. **FE8 class library.** A generator converts the extracted FE8 classes into our
   class format at `assets/reference/fe8/sim-classes.json` (gitignored, ROM derived).
   The single FE8 Pow stat is routed to `mag` when the class has a magic weapon rank
   (anima, light, dark, or staff), otherwise to `str`, with the unused one 0.
   Movement type (foot, cav, fly) is derived from the class move-cost table.
3. **Unit statblock.** `computeStatblock(unit, classDef, opts)` returns the nine sim
   stats (hp, str, mag, skl, spd, lck, def, res, con). Averaged by default:
   `stat = base + floor((unitGrowth + classGrowth) / 100 * (level - baseLevel))`,
   capped at the class cap. Rolled mode rolls each level from a seed (a growth over
   100 gives a guaranteed point plus a roll for the remainder). Passive stat skills
   are then added. A unit with no `bases`/`class` uses its flat stats unchanged.
4. **Skills.** `data/skills.json` defines skills with a typed effect. A unit's
   effective skills are its own plus its class's. The starter set is a `+N` stat
   passive, Vantage, Luna, Sol, and Pavise (section 6). Passives fold into the
   statblock; combat skills apply in the forecast and resolution.
5. **Scenario.** A scenario places several units per side on a map:
   `{ id, map, terrain?, units: [{ unit, weapon, side, at, ai? }] }`. The 1v1
   `{ player, enemy }` form still resolves.
6. **Viewer.** Play Map (or a scenario view) renders every placed unit as a token on
   the map (showcase or real chapter), clicking a unit shows its computed statblock
   and skills, and selecting an attacker and a defender shows the combat forecast
   (reusing the existing preview), with skill effects annotated.
7. Pure logic (stat computation, skill effects, seeding, scenario resolve) is unit
   tested; the full existing suite passes; no new dependency.

## 4. Data shapes

Class (`data/classes.json`, enriched; stat fields optional):

```
"paladin": {
  "name": "Paladin", "movementType": "cav", "move": 8,
  "bases":   { "hp": 23, "str": 7, "mag": 0, "skl": 4, "spd": 7, "def": 8, "res": 3, "con": 11 },
  "caps":    { "hp": 60, "str": 25, "mag": 25, "skl": 26, "spd": 24, "def": 25, "res": 25, "con": 25 },
  "growths": { "hp": 70, "str": 25, "mag": 0, "skl": 30, "spd": 18, "def": 12, "res": 20, "lck": 25 },
  "weaponRanks": { "sword": "A", "lance": "A" },
  "skills": []
}
```

Unit (`data/units.json`, enriched; flat form still valid):

```
"seth": {
  "name": "Seth", "class": "paladin", "level": 1, "baseLevel": 1,
  "bases":   { "hp": 30, "str": 14, "mag": 0, "skl": 13, "spd": 12, "lck": 13, "def": 11, "res": 8, "con": 11 },
  "growths": { "hp": 50, "str": 40, "mag": 0, "skl": 30, "spd": 30, "lck": 30, "def": 25, "res": 25 },
  "skills": ["sol"]
}
```

A unit's effective base per stat is `unit.bases[stat] ?? classDef.bases[stat] ?? 0`,
so a generic enemy can be defined by class alone.

Skills (`data/skills.json`):

```
"str_plus_2": { "name": "Strength +2", "kind": "statMod", "mods": { "str": 2 } },
"vantage":    { "name": "Vantage", "kind": "combat", "trigger": "defendBelowHalf", "effect": "strikeFirst" },
"luna":       { "name": "Luna",    "kind": "combat", "trigger": "sklRate", "effect": "ignoreDef" },
"sol":        { "name": "Sol",     "kind": "combat", "trigger": "sklRate", "effect": "lifesteal" },
"pavise":     { "name": "Pavise",  "kind": "combat", "trigger": "sklRate", "effect": "halveDamage" }
```

Scenario (`encounters/*.json`, multi-unit; 1v1 form still parses):

```
{ "id": "scenario-01", "map": "showcase-terrain",
  "units": [
    { "unit": "seth", "weapon": "iron-lance", "side": "player", "at": [1, 3] },
    { "unit": "gen-knight", "weapon": "iron-lance", "side": "enemy", "at": [8, 3], "ai": "aggressive" }
  ] }
```

## 5. Stat computation (pure)

`computeStatblock(unit, classDef, { level?, mode?, seed? })`:

- `level` defaults to `unit.level`; `levels = max(0, level - (unit.baseLevel ?? level))`.
- For each of the eight growable stats (hp, str, mag, skl, spd, lck, def, res; con is
  flat): `base = unit.bases[s] ?? classDef.bases[s] ?? 0`;
  `g = (unit.growths[s] ?? 0) + (classDef.growths[s] ?? 0)`.
  - mode `"avg"` (default): `gain = floor(g * levels / 100)`.
  - mode `"rolled"`: for each level, `+ floor(g / 100)` guaranteed, then `+1` if
    `rng() < (g % 100) / 100`, using a seeded RNG (reuse `src/rng.ts`).
  - `stat = min(base + gain, classDef.caps[s] ?? Infinity)`.
- `con = unit.bases.con ?? classDef.bases.con ?? 0`.
- Apply passive `statMod` skills (effective skills) as flat additions, then re-cap.
- Returns a `UnitDef` compatible statblock.

A unit with no `class` and no `bases` returns its existing flat stats unchanged.

## 6. Skills and combat

Effective skills for a unit = `unit.skills` plus `classDef.skills`, resolved against
`data/skills.json`. Kinds:

- `statMod`: flat stat additions, applied during `computeStatblock` (section 5).
- `combat`: a trigger plus an effect, applied in combat:
  - **Vantage** (`defendBelowHalf` / `strikeFirst`): deterministic. In
    `resolveExchange`, if the defender has Vantage and is at or below half HP, the
    defender strikes first.
  - **Luna** (`sklRate` / `ignoreDef`): activates at the attacker's skill percent; on
    activation the hit ignores the defender's terrain and stat defense (or res vs
    magic).
  - **Sol** (`sklRate` / `lifesteal`): on activation the attacker recovers HP equal to
    the damage dealt (capped at max HP).
  - **Pavise** (`sklRate` / `halveDamage`): on activation the defender takes half
    damage (rounded down).

Combat integration is a tested layer over `src/combat.ts`:

- Activation skills roll at `skl%` like crit, in `runMonteCarlo` and in the grid's
  `resolveExchange` (rolled). The deterministic `computeMatchup` is not blended: it
  reports each active skill with its activation rate and its on-activation effect as
  annotations (for example "Luna 14%: ignores 11 def", "Sol 14%: +dmg HP"), so the
  forecast stays readable.
- Skills are passed to the combat functions as a small typed list on each combatant,
  defaulting empty so all existing callers and tests are unaffected.

## 7. Components

1. `src/grid/types.ts` and `src/types.ts`: extend `ClassDef` (bases, caps, growths,
   weaponRanks, skills) and add `UnitAuthor` (class, level, baseLevel, bases, growths,
   skills) and `Skill` types. All new fields optional.
2. `src/grid/statblock.ts` (pure): `computeStatblock`. Tested.
3. `src/grid/skills.ts` (pure): load and resolve skills, compute passive stat mods,
   and the combat helpers (activation, Luna/Sol/Pavise/Vantage effects). Tested.
4. `src/combat.ts`: accept optional per-combatant skills; apply combat skills in
   `computeMatchup` (annotations), `runMonteCarlo`, and `resolveExchange`. Tested.
5. `tools/assetgen/simclasses.ts` (pure) and a generator step: convert FE8 classes to
   our class format with the Pow routing and movement derivation. Tested.
6. `src/grid/resolve.ts` and `datagen.ts`: resolve a unit to its computed statblock
   (merging class and FE8 library), and resolve the multi-unit scenario format.
7. `src/game` and `src/grid/render.ts`: a scenario view that renders all placed units,
   inspects a unit's statblock and skills, and forecasts a selected matchup.
8. Example content: a few authored classes, units (with skills), and a multi-unit
   scenario, committed under `data/` and `encounters/` (custom, not ROM derived).

## 8. Testing

- `computeStatblock`: averaged and rolled results on a known class and unit, cap
  clamping, flat-stat passthrough, generic (class only) units.
- `skills`: passive stat mods fold in; Luna ignores def; Sol heals on activation;
  Pavise halves; Vantage flips strike order; activation respects skl%.
- `simclasses`: Pow routes to mag for a magic class and str otherwise; movement type
  derived correctly; caps and growths carried.
- `resolve`: multi-unit scenario resolves to placed units with computed statblocks;
  the 1v1 form still resolves.
- The viewer is browser verified: units appear on the map, statblocks and skills
  inspect correctly, and a forecast shows skill annotations.
- The full existing suite passes.

## 9. Out of scope now, planned next

- **SkillSystems integration and custom skill authoring.** Grow the skills library
  toward the SkillSystems hack's set and let skills be authored freely. The data-driven
  skill model here is built to extend into that.
- Full N-vs-N turn play (the engine stays 1v1 for play this slice; the viewer is
  static placement plus inspection plus forecast).
- A unit and scenario editor UI, and MCP-driven authoring (the north star).
- Promotion, supports, weapon-rank effects on combat, and item inventories beyond a
  single equipped weapon.

## 10. Risks

- Scope: this slice is broad (model, computation, seeding, skills, scenario, viewer).
  Mitigation: each component is a small pure module landed and tested on its own, the
  starter skill set is fixed at five, and the viewer reuses the existing combat
  preview rather than a new engine.
- Combat skill integration touches the well-tested `src/combat.ts`. Mitigation: skills
  are an optional, defaulted-empty input, so existing behavior and tests are unchanged,
  and each skill has its own test.
- str/mag seeding is a judgment mapping (GBAFE has one Pow). Mitigation: the
  rank-based rule is documented and easy to revise; custom classes set str/mag
  directly.
