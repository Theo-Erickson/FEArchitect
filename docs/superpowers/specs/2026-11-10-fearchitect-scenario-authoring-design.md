# FEArchitect MCP Scenario Authoring

Date: 2026-11-10
Status: Approved for planning
Author: Claude (Opus 5.5) with Theo (Technical Game Designer)

## Prose and code conventions

No em dashes or en dashes anywhere in this document or in code and comments. Use
colons or commas instead. Do not add Co-Authored-By or any attribution trailer to
commits (project owner preference, recorded in memory).

## 1. Purpose

Let the MCP author playable scenarios: create and edit authored units (class, level,
bases, growths, skills), place them on any map including the 79 real FE8 chapters,
see the map it is placing on, check balance by simulation, and have the result show up
live in the scenario viewer. This is the first write step toward the north star of
MCP-assisted authoring of FE8 maps and scenarios.

This is sub-project 1 of 2. Sub-project 2, FE8 tile-art map editing (editable chapter
layouts over a tileset, terrain derived from tiles, a Node renderer), gets its own
spec. Maps produced there will be consumed by the placement and validation built here
without change.

## 2. What exists and what changes

Exists and is reused:
- MCP tool manifest `mcp/toolspecs.ts` (shared by the stdio server and the bridge) and
  handlers `mcp/handlers.ts` with `list`, `get`, `preview_encounter`,
  `simulate_skirmish`, `set_unit`, `set_weapon`, `set_encounter`.
- `resolveScenario(enc, units, weapons, terrain, classes, map, skills)` in
  `src/grid/resolve.ts`, accepting `{ units: [{ unit, weapon, side, at, ai }] }`, and
  `resolveMap` reading both ASCII legend maps and FE8 chapter grids (`terrainIds`).
- `computeStatblock` (`src/grid/statblock.ts`) for authored units.
- The multi-unit engine `src/grid/multigame.ts` and AI `src/grid/multiai.ts`.
- The scenario viewer `src/game/scenario.ts` / `scenario.html`, served by
  `src/server.ts`.
- FE8 reference data: `assets/reference/fe8/terrain.json` (65 terrain defs),
  `assets/reference/fe8/terrain/<n>.json` (79 chapter grids),
  `assets/reference/fe8/sim-classes.json` (71 classes),
  `assets/reference/fe8/maps.json` (chapter index, name, size).

Gaps this fixes:
- `set_unit` calls `validateUnit`, which requires flat numeric stats, so it rejects
  authored units such as `seth`.
- `set_encounter` validates any map encounter through `resolveGridEncounter` (1v1), so
  a `units` list cannot be saved, and it ignores `terrain: "fe8"`.
- Nothing validates placements: off map, impassable tile, shared tile, duplicate unit.
- A placement's id is its unit key, so the same unit placed twice collides.
- The MCP cannot read a map's terrain, so it would place units blind.
- The viewer's scenario list is a hardcoded `<option>`.
- The viewer's file selection logic (`fetchScenario`) lives only in the browser, so a
  Node loader would duplicate it.

## 3. Success criteria

1. Through the MCP alone, a scenario can be created on an FE8 chapter (for example
   `fe8-2`) with authored units on both sides, edited with `place_unit` and
   `remove_unit`, described, and simulated.
2. Every write is validated in full before touching disk. An invalid write returns one
   message listing every problem and leaves the file byte for byte unchanged.
3. With the scenario viewer open on a scenario, an MCP write to it is reflected in the
   viewer within about 2 seconds, without a manual refresh.
4. A scenario created by the MCP appears in the viewer's dropdown without editing HTML.
5. The full existing suite still passes. No new dependency. The 1v1 Play Map, the
   editor, and existing encounters behave as before.

## 4. Data shapes

Scenario file, in `encounters/<id>.json`:

```json
{
  "id": "ch2-ambush",
  "map": "fe8-2",
  "terrain": "fe8",
  "notes": "Free text shown in the viewer list.",
  "units": [
    { "id": "seth", "unit": "seth", "weapon": "iron-lance", "side": "player", "at": [1, 5] },
    { "id": "gen-soldier", "unit": "gen-soldier", "weapon": "iron-lance", "side": "enemy", "at": [8, 1], "ai": "aggressive" },
    { "id": "gen-soldier-2", "unit": "gen-soldier", "weapon": "iron-lance", "side": "enemy", "at": [9, 1], "ai": "stationary" }
  ]
}
```

- `map`: a custom map id (file in `maps/`) or `fe8-<n>` for chapter `n`.
- `terrain`: `"fe8"` when the map is a chapter. `set_scenario` sets it automatically
  from the `fe8-` prefix, so authors never need to supply it.
- Placement `id`: optional on input. If missing, it becomes the unit key, and if that
  is already taken in the scenario, the key plus `-2`, `-3`, and so on. Ids are
  assigned at write time and stored, so they stay stable across later edits.
  `buildUnit` uses the placement id as the `GridUnit.id` (falling back to the unit key
  for existing files without ids).
- Placement `ai`: `"aggressive"` (default) or `"stationary"`.

Authored unit (unchanged shape, now accepted by `set_unit`): `{ name, class, level,
baseLevel, bases, growths, skills, portrait }`. Flat units
`{ name, class, hp, str, ... }` remain valid.

## 5. Components

### Component 1: Scenario sources (`src/grid/scenariosrc.ts`, pure)

`scenarioSources(enc)` returns the relative paths a scenario needs: terrain defs file,
map file, and whether FE8 sim classes are merged under custom classes. It encodes the
rule now inline in `fetchScenario`: `terrain: "fe8"` (or a `fe8-` map id) means
`assets/reference/fe8/terrain.json` and `assets/reference/fe8/terrain/<n>.json`,
otherwise `data/terrain.json` and `maps/<map>.json`. Classes are always
`{ ...sim-classes, ...data/classes.json }`. The viewer's `fetchScenario` and the Node
loader both call it, so they cannot drift.

### Component 2: Node project store (`mcp/store.ts`)

`resolveScenarioOnDisk(root, enc)` reads the files named by `scenarioSources` plus
units, weapons, classes, and skills, and returns the `ResolvedScenario`. The store also
holds the shared JSON read and atomic write helpers, `loadClassesAll` (FE8 sim classes
under custom classes), `resolveMapOnDisk`, and `readScenario`. Used by every handler.

### Component 3: Placement checker (`src/grid/scenariocheck.ts`, pure)

`checkScenario(sc: ResolvedScenario): Problem[]` where
`Problem = { level: "error" | "warning", unitId?: string, message: string }`.

Errors:
- A unit position is outside `0..width-1`, `0..height-1`.
- A unit stands on a tile whose move cost for its class movement type is null.
- Two units share a tile (message names both).
- Two placements share an id.
- A side has no units.

Warning:
- The weapon's type is not in the class's `weaponRanks`, when the class defines them.

Resolution failures (unknown unit, weapon, class, skill, map) are thrown by
`resolveScenario` as today and reported as errors by the handlers.

### Component 4: Map and scenario text views (`mcp/describe.ts`, pure)

- `describeMap(map, terrainDefs)`: an ASCII grid with x rulers on top and y rulers on
  the left. Each terrain id present gets one punctuation character from a fixed pool
  (most common terrain `.`, then `,`, `:`, `;` and so on in order of frequency; the
  busiest FE8 chapter has 17 terrain types, the pool has 28). A legend lists, for each character,
  the terrain name, def/avoid, heal, and move cost for foot, cav, and fly (`-` for
  impassable). Also returns width and height.
- `describeScenario(sc, problems)`: the same grid with units overlaid (player units
  `A..Z`, enemy units `a..z` then `0..9`, `@` for overflow or a shared tile, with a key
  mapping marker to unit id),
  a unit table (id, side, unit name, class, level, hp/str/mag/skl/spd/lck/def/res,
  weapon, ai, position), and the problems list.

Text output is the MCP's way to see the map. It is deterministic, which makes it easy
to test.

### Component 5: MCP handlers and tools (`mcp/handlers.ts`, `mcp/scenariohandlers.ts`, `mcp/toolspecs.ts`)

The new scenario tools live in `mcp/scenariohandlers.ts` so `handlers.ts` stays small;
`set_unit`, `list`, and `get` changes stay in `handlers.ts`.

| Tool | Behavior |
|---|---|
| `set_unit(id, fields)` | Merge `fields` into the unit; a `null` value deletes that field. Validate: flat form via `validateUnit`; authored form (has `bases` or `growths`, or no flat `hp`) via `computeStatblock` against the merged custom plus FE8 classes and the skills table (unknown class or skill is an error). Write on success, return `{ unit, stats }`: the merged record and its computed statblock. |
| `set_scenario(id, spec)` | Normalize (set `id`, `terrain` from map prefix, assign placement ids), resolve, run `checkScenario`. Any error: throw with every problem listed. Else write, return `describe_scenario` output and the viewer link `/src/game/scenario.html?s=<id>`. |
| `place_unit(scenario, placement)` | Read scenario, replace the placement with the same `id` or append, then the same path as `set_scenario`. |
| `remove_unit(scenario, id)` | Read scenario, remove the placement (error if absent), then the same path as `set_scenario`. |
| `describe_map(map)` | Resolve the map (`fe8-<n>` or custom) with its terrain defs, return `describeMap`. |
| `describe_scenario(id)` | Resolve and check, return `describeScenario`. Works on scenarios that have problems, so they can be repaired. |
| `simulate_scenario(id, seed?, turnCap?)` | Build a `MultiGame`, let the AI play both sides each phase until a result or `turnCap` (default 50). Return `{ status, turns, survivors: [{ id, side, hp }], log }`. Deterministic for a seed. |
| `list(kind)` | Adds `scenarios` (encounters with a `units` list), `chapters` (`{ id: "fe8-<n>", name, width, height }`), and `skills`. `classes` returns custom plus FE8 sim class ids. |
| `get(kind, id)` | `map` accepts `fe8-<n>`; adds `scenario`, `skill`. `class` falls back to FE8 sim classes. |

The existing `set_encounter` is left for 1v1 encounters; its description is updated to
point multi-unit authors at `set_scenario`.

All writes go through one `writeJsonAtomic` helper: write `<file>.tmp`, then rename
over the target, so the polling viewer never reads a partial file.

Simulating both sides needs no AI change: `decideMultiAction(g, id)` in `multiai.ts`
already targets units of the other side from the acting unit, so the simulator calls
it for every unit of the side whose phase it is, then `act` and `endPhase`.

### Component 6: Scenario list endpoint (`src/server.ts`)

`GET /api/scenarios` returns `[{ id, notes, map }]` for each `encounters/*.json` that
has a `units` array, sorted by id. Read only. The listing logic is a pure function
over file names and parsed contents so it can be unit tested without a server.

### Component 7: Viewer (`src/game/scenario.ts`, `scenario.html`)

- Dropdown built from `/api/scenarios`. Selection is reflected in `?s=<id>`, and a
  `?s=` on load opens that scenario. Default: the first listed.
- Auto reload: while a scenario is open, fetch its file every 1.5 seconds with
  `cache: "no-store"` and compare text with the last loaded text. On a change, resolve
  the new text; if it resolves, restart the game on it and show a short notice
  "Reloaded: scenario changed on disk". In-progress play is discarded (expected while
  authoring). If it fails to resolve, keep the last good scenario on screen and show
  the error in the banner.
- Problems banner above the map, from `checkScenario`, listing errors and warnings.
  Hand-edited scenarios with problems still open.
- `fetchScenario` uses `scenarioSources`.

## 6. Architecture

```
MCP client ──> mcp/server.ts ──> toolspecs ──> handlers
                                              │
            store (Node fs)        ──> scenarioSources ──> resolveScenario ──> checkScenario
                                              │                                   │
                                     describe (text views)           writeJsonAtomic ──> encounters/<id>.json
                                                                                          │
Browser: scenario.ts ── poll file ──> scenarioSources ──> resolveScenario ──> checkScenario ──> render
          └── /api/scenarios (src/server.ts) for the dropdown
```

Pure modules (`scenariosrc`, `scenariocheck`, `describe`) hold the logic; handlers and
the viewer are thin shells over them.

## 7. Error handling

- Validation errors are collected, not thrown at the first one, so one message lists
  every problem, for example `seth at [16,3] is off the 15x10 map` and
  `two units on [4,2]: seth, lute`.
- Unknown references are reported by name and kind.
- Failed writes never touch the target file.
- The viewer never goes blank on a bad file: it keeps the last good scenario and shows
  the error.

## 8. Testing

Node's built-in test runner, as today.

- `scenariocheck`: one test per error and for the warning, plus a clean scenario.
- `scenariosrc`: custom map and FE8 chapter cases.
- `describe`: `describeMap` and `describeScenario` against a small fixture map with
  exact expected text.
- Handlers on a temporary project folder (pattern of `mcp/handlers.test.ts`):
  - authored `set_unit` succeeds; unknown class fails; `null` deletes a field.
  - `set_scenario` writes and assigns ids, with suffixes for duplicate units.
  - `place_unit` appends, then moves an existing id; `remove_unit` removes.
  - a rejected write leaves the file byte for byte unchanged.
  - `simulate_scenario` reaches a result and repeats exactly for the same seed.
  - `list("chapters")`, `list("scenarios")`, `get("map", "fe8-1")`.
- `/api/scenarios` listing function.
- Tool manifest test updated for the new tools.
- Manual: open the viewer on a scenario, `place_unit` through the MCP, see it reload.

## 9. Out of scope now, planned next

- Sub-project 2: FE8 tile-art map editing.
- Turn events, reinforcements, and objectives other than rout.
- Inventories and multiple weapons per unit.
- A unit and scenario editor UI in the browser.
- Writing scenarios or units back into the ROM.

## 10. Risks

- FE8 chapter grids are up to 30 by 31 tiles; the ASCII view stays readable at that
  size, but large legends (many terrain types) are long. Mitigation: legend lists only
  terrain present.
- Polling every 1.5 seconds is cheap for a local server; if it ever matters, an
  `If-Modified-Since` check can replace the text compare.
- Both-sides AI may stall (units that cannot reach each other). `turnCap` bounds it,
  and the result reports `ongoing` at the cap.
