# FEArchitect Slice A: 1v1 Math Preview

Date: 2026-09-09
Status: Approved for planning
Author: Claude (Opus 4.8) with Theo (Technical Game Designer)

## Prose and code conventions

No em dashes or en dashes anywhere in this document or in code and comments.
Use colons or commas instead. This matches the FEArchitect handoff conventions.

## 1. Purpose

FEArchitect is a Fire Emblem: Sacred Stones (FE8) hacking workspace where
encounters, classes, and weapons are defined as text data in git, tooling edits
that data, and results can be evaluated cheaply before any ROM build.

The full project has three evaluation tiers: math preview (Tier 1), browser
playtest simulator (Tier 2), and real ROM build in an emulator (Tier 3). This
spec covers only the first vertical slice, called Slice A, which is Tier 1 with
exactly one player unit and one enemy unit.

Slice A exists to prove the core data pipeline end to end before any larger
tooling is built on top of it. The ROM toolchain (Tier 3) and the tactical
simulator with a grid (Tier 2) are explicitly out of scope for this slice.

## 2. Success criteria

Slice A is done when all of the following are true:

1. A player unit and an enemy unit, each with a weapon, are defined in
   git-tracked JSON config files.
2. Double-clicking a launcher opens a browser editor showing a form for each
   unit on the left and a combat preview on the right.
3. Editing a stat or swapping a weapon in the form and re-running updates the
   preview: displayed hit, 2RN true hit, damage per hit, crit chance, whether
   each side doubles, and rounds to kill.
4. A seeded Monte Carlo runs locally in the browser (no tokens, no network) over
   many duels and reports win rate per side, average rounds, and the death turn
   distribution. The seed is shown and can be re-rolled.
5. Saving in the editor writes the edited values back to the source JSON config
   files on disk.
6. A second double-clickable launcher runs the same fight math headlessly and
   prints the results, leaving its window open so they can be read.
7. Combat formulas are ported from the fireemblem8u decomp, with the source file
   and function cited in code comments, not from memory or wikis.

## 3. Scope decisions and rationale

These were decided during brainstorming.

- **JSON configs now, not CSV plus .nmm schemas.** The handoff's `Tables/*.csv`
  and `.nmm` schema layer exists to match FEBuilder and nightmare ROM offsets,
  which Slice A never touches. For two units that machinery is pure overhead.
  Validation still happens, in TypeScript, failing loudly on bad data. Migration
  to CSV tables happens when unit count grows or when the project heads toward
  the ROM tier.

- **No MCP server in Slice A.** The MCP server is deferred until after this MVP,
  matching the handoff's own ordering where the server arrives after the data
  spine exists. For this slice, Claude edits data through the datagen and
  validation tooling rather than hand-hacking files, and the user's self-serve
  path is the GUI editor plus the save-to-disk button.

- **Combat formulas ported from the decomp.** Correctness of the math is the
  foundation that Tier 2 and Tier 3 both read from, so a subtle constant error
  would poison every future playtest conclusion. The relevant functions are
  pulled from the fireemblem8u source and cited in comments.

- **Integrated editor plus preview in one local web tool.** Editing and
  previewing live in the same page so the tuning loop is instant. This tool is
  also the seed for Tier 2: the grid is added to the same app later rather than
  built fresh.

- **Double-clickable launchers, no CLI typing.** The run surface is `.cmd`
  files, matching the handoff's own `MAKE_HACK_*.cmd` convention.

- **Node.js is the single prerequisite.** Node 24 is present on the target
  machine and runs TypeScript natively via type stripping, so the code is
  authored in TypeScript with no build step and no third party dependencies. The
  launcher starts a tiny local server built on Node's standard library so the
  browser page can save config files in place.

## 4. Architecture

Data flows in one direction at preview time. All writes go back to the JSON
config files, either from the editor's save button or from Claude's tooling.

```
config JSON  ->  datagen (validate + resolve)  ->  DataBundle  ->  combat engine
     ^                                                                   |
     |                                                                   v
 editor save  <-------------------- browser editor + preview <---- results
```

The combat engine is pure functions with no DOM access, so the exact same code
backs the browser editor, the headless launcher, and eventually the Tier 2
simulator.

Node 24 runs TypeScript directly for the server and the headless launcher, so
those have no build step. Browsers cannot import TypeScript, so when the server
serves a module to the browser it strips the TypeScript types on the fly using
Node's standard library type stripping, then sends plain JavaScript. This keeps
the whole project authored in TypeScript with no build step and no third party
dependencies. If a future Node version lacks that capability, the fallback is to
author the browser client as a JavaScript module with JSDoc types.

## 5. Repository layout for Slice A

| Path | Purpose |
|------|---------|
| `data/weapons.json` | Weapon definitions: might, hit, crit, weight, type, rank. |
| `data/units.json` | Unit definitions: HP, Str, Mag, Skl, Spd, Lck, Def, Res, Con, plus which class or template if needed. |
| `encounters/duel-01.json` | The encounter: player unit ref plus weapon, enemy unit ref plus weapon, notes. |
| `src/types.ts` | Shared types: UnitDef, WeaponDef, EncounterSpec, DataBundle, DuelResult. |
| `src/datagen.ts` | Reads and validates config JSON, resolves references into a DataBundle. |
| `src/combat.ts` | Combat math ported from fireemblem8u, plus 2RN and the seeded duel loop. |
| `src/rng.ts` | Seeded pseudo random number generator, so runs are replayable. |
| `src/server.ts` | Tiny Node standard-library server: serves the editor page, exposes a save endpoint. |
| `src/editor/index.html` | The editor plus preview page. Loads the client module. |
| `src/editor/client.ts` | Browser side: renders forms, runs datagen and combat in-page, calls save. |
| `src/preview.ts` | Headless entry: loads an encounter, runs the math, prints results. |
| `Open Editor.cmd` | Double-click: starts the server and opens the browser to the editor. |
| `Preview.cmd` | Double-click: runs `src/preview.ts` and pauses so output is readable. |
| `.gitignore` | Ignores OS cruft and any future build or ROM artifacts. |
| `README.md` | How to use the two launchers, and the simulator authority boundary. |

## 6. Data shapes

Illustrative, not final. Field names may shift slightly during implementation to
match the decomp's stat model.

```jsonc
// data/weapons.json
{
  "iron-sword":  { "name": "Iron Sword",  "type": "sword", "rank": "E", "might": 5, "hit": 90, "crit": 0, "weight": 5 },
  "iron-lance":  { "name": "Iron Lance",  "type": "lance", "rank": "E", "might": 7, "hit": 80, "crit": 0, "weight": 8 }
}
```

```jsonc
// data/units.json
{
  "eirika-t": { "name": "Eirika", "hp": 24, "str": 9, "mag": 3, "skl": 13, "spd": 15, "lck": 12, "def": 7, "res": 6, "con": 5 },
  "wyvern-1": { "name": "Wyvern Rider", "hp": 30, "str": 12, "mag": 0, "skl": 8, "spd": 9, "lck": 2, "def": 11, "res": 2, "con": 13 }
}
```

```jsonc
// encounters/duel-01.json
{
  "id": "duel-01",
  "notes": "Baseline pipeline proof: Eirika versus a lone Wyvern Rider.",
  "player": { "unit": "eirika-t", "weapon": "iron-sword" },
  "enemy":  { "unit": "wyvern-1", "weapon": "iron-lance" }
}
```

## 7. Combat model

The initiator is the player by default. The duel assumes both units are in range
of each other, since there is no grid in Slice A.

Derived values, all to be confirmed against the decomp and cited in comments:

- Attack Speed = Spd minus max(0, weapon weight minus Con).
- Attack = Str for physical weapons, Mag for magic weapons, plus weapon might,
  plus any weapon triangle damage bonus.
- Damage = Attack minus the defender's Def for physical, or Res for magic.
- Hit and Avoid and displayed Hit, Crit and crit avoid, using the decomp
  constants for the skill, luck, and weapon triangle contributions.
- Doubling when the attacker's Attack Speed exceeds the defender's by the decomp
  threshold, expected to be 4 but confirmed from source.
- 2RN true hit: the real probability from averaging two rolls, ported exactly.

The duel resolves as a sequence of attacks: initiator attacks, defender counters
if still alive, doublers attack again, repeat until one unit reaches 0 HP or a
safety round cap is hit.

Two outputs:

1. **Deterministic breakdown**, per side: displayed hit, true 2RN hit, damage per
   hit, crit chance, doubles yes or no, rounds to kill under average outcomes.
2. **Seeded Monte Carlo**: run N duels, default around 1000, using the seeded RNG
   with 2RN, and report win rate per side, average rounds, and the distribution
   of which round the loser died. The seed is displayed and re-rollable. This
   runs entirely on the user's machine.

## 8. The editor

A single local page.

- Left: a form per unit with numeric fields for each stat, a dropdown to pick the
  unit's weapon, and a control to choose which side initiates. Editing a value
  re-runs datagen and combat in-page immediately.
- Right: the two result panels from section 7, with the seed shown and a re-roll
  button for the Monte Carlo.
- A Save button posts the current values to the server's save endpoint, which
  writes them back into the source JSON files. Save is an explicit action, not
  automatic, so experimentation does not overwrite the config until intended.

Rendering is deliberately plain: numbers, simple bars for the death turn
distribution, no sprites. Fidelity is scaled to the question, which here is
numeric.

## 9. How the user runs it

- Double-click `Open Editor.cmd`: the launcher starts the Node server and opens
  the default browser to the editor page. No terminal, no typing.
- Double-click `Preview.cmd`: runs the headless math for `duel-01` and prints the
  results, then pauses so the window stays open.

Node.js is the only thing the user installs, once.

## 10. Testing

- Unit tests for the combat engine, run headlessly via Node's built-in test
  runner, no dependencies. Each ported formula gets at least one test with a
  hand-checked expected value derived from the decomp, including a case that
  exercises doubling, a weapon triangle case, and a 2RN conversion case at a
  known displayed hit.
- The seeded RNG has a test proving the same seed yields the same duel sequence,
  since replayability is a stated requirement.
- datagen has a test that malformed config, for example a missing weapon
  reference, fails loudly rather than producing a silent wrong DataBundle.

## 11. Out of scope for Slice A

- Any grid, movement, terrain, or positioning. That is Tier 2.
- Effectiveness bonuses, healing or vulnerary use mid duel, staves, and status.
- The MCP server. Deferred until after this MVP.
- The ROM toolchain, the Skill System, animations, and the emulator. That is
  Tier 3.
- CSV tables and .nmm schemas. Introduced when unit count grows.

## 12. Authority boundary to record in the tool

Per the handoff assumption, the simulator and math preview are authoritative for
encounter shape, pacing, and difficulty only. The real build is authoritative for
engine behavior: animations, menus, skill interactions, crashes, and freespace. A
short note stating this belongs visible in the tool so a math preview result is
never mistaken for engine truth.
