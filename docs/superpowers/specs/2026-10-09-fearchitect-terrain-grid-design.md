# FEArchitect Terrain Grid (sim on real FE8 maps)

Date: 2026-10-09
Status: Approved for planning
Author: Claude (Opus 4.8) with Theo (Technical Game Designer)

## Prose and code conventions

No em dashes or en dashes anywhere in this document or in code and comments. Use
colons or commas instead. Do not add Co-Authored-By or any attribution trailer to
commits (project owner preference, recorded in memory).

## 1. Purpose

Make the Slice B tactical skirmish run on a real FE8 chapter map, with authentic
terrain: forests and mountains give avoid and defense, forts heal, water blocks
ground units, flying units ignore most of it. Terrain stats come straight from the
FE8 ROM. The chapter map image we already render is reused as the backdrop, with the
movement and attack grid drawn on top. This is the next step toward the tactical
side of the authoring north star: real maps the sim understands.

## 2. Toolchain feasibility (decided during brainstorming)

Confirmed against the fireemblem8u decomp (same author as our CLI fork). All terrain
data is fixed-size tables indexed by terrain id, 65 ids (0 to 64), each table 0x41
bytes. FE8U mapped addresses (file offset = addr - 0x08000000):

- Per-tile terrain id: already available. The tileset config blob we export per
  chapter ends in the terrain lookup (`bmmap.c`: `gTilesetTerrainLookup`), and the
  terrain id for a cell is `terrainLookup[(mapValue >> 3) >> 2]`.
- Combat tables (u8 per terrain):
  - Avoid ground `TerrainTable_Avo_Common` 0x0880C479, fly `..._Avo_Fly` 0x0880C53C
  - Def ground `TerrainTable_Def_Common` 0x0880C4BA, fly `..._Def_Fly` 0x0880C57D
  - Res ground `TerrainTable_Res_Common` 0x0880C4FB, fly `..._Res_Fly` 0x0880C5BE
  - Heal amount `TerrainTable_HealAmount` 0x0880C744, heals status
    `TerrainTable_HealsStatus` 0x0880C785
- Name text ids: `gUnknown_0880D374` 0x0880D374 (u16 text id per terrain).
- Move cost tables (u8 per terrain, Normal weather), each 0x41 bytes from 0x0880B808:
  CommonT2 0x0880B808, CommonT1 0x0880B849, Armor 0x0880B88A, Fighter 0x0880B8CB,
  Berserker 0x0880B90C, Brigand 0x0880B94D, Pirate 0x0880B98E, Thief 0x0880B9CF,
  Magic 0x0880BA10, Civilian 0x0880BA51, HorseT1 0x0880BA92, HorseT2 0x0880BAD3,
  AnimalT1 0x0880BB14, AnimalT2 0x0880BB55, Fly 0x0880BB96, DemonKing 0x0880BBD7.
  Rain and Snow variant sets follow; out of scope for v1.

Two small confirmations happen in the first implementation task (low risk, addresses
known): the move-cost value that marks impassable (a sentinel such as a large value),
and resolving a terrain name text id to a string (via the CLI text export, with
canonical GBAFE names as a cosmetic fallback).

Movement-type mapping (FE8 has ~15 move types, the sim has three): foot uses
CommonT1, cav uses HorseT2, fly uses Fly. Documented so it is easy to revise.

No new dependency. The ROM is read directly in the generator (as mapgen already does).

## 3. Success criteria

1. A generator (extending the map pipeline) writes, gitignored under
   `assets/reference/fe8/`:
   - `terrain.json`: all 65 FE8 terrain types, each with `name`, ground and fly
     `avoid`/`def`/`res`, `heal`, `healsStatus`, and `moveCost { foot, cav, fly }`
     (numbers, or null for impassable), sourced from the ROM tables above.
   - `terrain/<index>.json` per chapter: `{ id, width, height, terrainIds }` where
     `terrainIds` is a height by width array of terrain ids.
2. The extracted values match the game (spot-checked: for example forest gives +1
   def and +20 avoid for ground and 0/0 for fliers, a fort heals, sea is impassable
   to foot and cav but not fly).
3. The grid engine runs a skirmish on a real chapter: movement range respects the
   authentic per-tile move costs for the unit's movement type, and a defender on a
   forest or fort tile gets the authentic avoid, defense (and res vs magic) bonus.
   Flying units use the fly tables.
4. Play Map renders a real chapter: the chapter PNG is the backdrop at 16px per tile,
   with the movement/attack highlights and unit tokens drawn over it. Large maps fit
   to the view (scaled, and scrollable if needed).
5. Pure engine and extraction logic is unit tested; the full existing suite passes;
   no new dependency.

## 4. Components

### Component 1: Terrain table extraction (`tools/assetgen/terraindata.ts`, pure)

Pure functions over a ROM buffer: read each terrain table at its documented address
into a typed structure. `extractTerrain(rom)` returns the 65 terrain defs (ground and
fly avoid/def/res, heal, healsStatus, name text id, and the per-move-type costs for
the three mapped tables). A small helper maps raw move-cost bytes to `number | null`
(null for the impassable sentinel). Pure, unit tested with a synthetic ROM slice.

### Component 2: Per-chapter terrain grid

Extend the map parse: from the same config blob mapgen already reads, compute the
terrain id per cell (`terrainLookup[(layoutU16 >> 3) >> 2]`) into a height by width
grid. The terrain lookup is the config region after the TSA (bytes 8192 and on). A
pure `terrainGrid(configBlob, layoutU16s, width, height)` returns `number[][]`,
unit tested.

### Component 3: Generator wiring (`tools/assetgen/mapgen.ts`, and a name step)

mapgen gains: write `assets/reference/fe8/terrain.json` once (from `terraindata`),
and per chapter write `terrain/<index>.json` (from `terrainGrid`). Terrain names are
resolved from the name text ids (CLI text export, or canonical fallback) when
building `terrain.json`. The map PNG generation is unchanged.

### Component 4: Sim data model and loader

- `src/grid/types.ts`: extend `TerrainDef` with `res`, the fly variants, `heal`, and
  `healsStatus`; extend `TerrainMod` (in `src/combat.ts`) with `res`.
- Terrain defs for chapters: the sim loads the FE8 `terrain.json` (keyed by terrain
  id as a string) in addition to the hand-authored `data/terrain.json` used by the
  showcase maps. The loader picks the terrain set the encounter's map needs.
- `src/grid/resolve.ts`: `resolveMap` also accepts the chapter grid format
  (`terrainIds` plus `width`/`height`), producing the same resolved terrain grid of
  ids. The ASCII legend format still works for the showcase maps.

### Component 5: Authentic terrain in movement and combat

- Movement (`src/grid/movement.ts`): already uses `moveCost[movementType]`; it now
  reads authentic costs, with null meaning impassable.
- Combat (`src/combat.ts`): the defender's `TerrainMod` is built from the tile under
  the defender, choosing the fly avoid/def/res variants when the defender's movement
  type is fly, otherwise ground. Res applies to the magic defense path, def to the
  physical path (the code already splits magic vs physical).
- Heal: a unit that ends its turn on a healing tile recovers `heal` HP (capped at
  max HP). This is a small, contained addition to the turn logic.

### Component 6: Play Map renders a real chapter

- `src/grid/render.ts` gains a mode that omits the terrain sprites (the PNG shows
  terrain) while still drawing movement/attack highlights and unit tokens, sized to
  a 16px tile to line up with the chapter PNG.
- `src/game` (the client served by `src/server.ts`): when the encounter's map is a
  chapter, load `/assets/reference/fe8/maps/<index>.png` as the grid backdrop and the
  chapter terrain grid for the engine, and scale the board to fit the view (a zoom or
  fit-to-width control, scroll for very large maps). Showcase maps render as today.
- An example encounter on a real chapter (its own `encounters/*.json`) demonstrates
  terrain mattering.

## 5. Architecture

Extraction lives in `tools/assetgen/` (`terraindata.ts`, plus mapgen wiring),
reusing the ROM read and CLI helpers. The sim changes are confined to `src/grid/`
(types, resolve, movement, render, turn logic), `src/combat.ts` (TerrainMod res and
fly selection), the `src/game` client, and a new example encounter. Generated
`terrain.json` and `terrain/<index>.json` live under `assets/reference/fe8/`
(gitignored, ROM-derived). The hand-authored `data/terrain.json` and `maps/*.json`
stay as the committed showcase set.

## 6. Data shapes

`assets/reference/fe8/terrain.json` (keyed by terrain id):

```
{
  "0":  { "name": "--",     "avoid": 0,  "def": 0, "res": 0,
          "flyAvoid": 0, "flyDef": 0, "flyRes": 0, "heal": 0, "healsStatus": false,
          "moveCost": { "foot": null, "cav": null, "fly": null } },
  "1":  { "name": "Plains", "avoid": 0,  "def": 0, "res": 0, ... ,
          "moveCost": { "foot": 1, "cav": 1, "fly": 1 } },
  "...": { "name": "Forest", "avoid": 20, "def": 1, ... ,
          "moveCost": { "foot": 2, "cav": 3, "fly": 1 } }
}
```

`assets/reference/fe8/terrain/<index>.json`:

```
{ "id": "fe8-ch1", "width": 15, "height": 10,
  "terrainIds": [ [1,1,4,...], ... ] }
```

## 7. Testing

- `terraindata`: extract from a synthetic ROM slice with known bytes at the table
  offsets, assert the parsed defs and the impassable null mapping.
- `terrainGrid`: a synthetic config plus layout yields the expected id grid.
- `resolve`: the chapter grid format resolves to the same terrain grid shape as the
  ASCII format; unknown ids error.
- `movement`: on a small chapter-format grid, range respects authentic costs
  (impassable blocks ground, fly crosses).
- `combat`: a defender on a forest tile gets the authentic avoid and def, a flier on
  the same tile gets the fly values, res applies vs magic.
- Terrain values are spot-checked against the game, and Play Map is browser-verified
  on a real chapter (terrain visibly affects range and forecasts).
- The full existing suite still passes.

## 8. Out of scope now, planned next

- Rain and Snow weather move-cost tables (the data exists; v1 uses Normal).
- Map change overlays (fog of war, destroyed walls, mid-chapter terrain changes).
- Full chapter unit rosters and events (the encounter browser track; this sub-project
  plays a 1v1 or small skirmish on the real terrain, not the whole chapter cast).
- FE7 terrain (its tables differ).
- Richer movement model (FE8's full set of movement types instead of foot/cav/fly).

## 9. Risks

- Move-cost impassable sentinel and name text resolution are the two small unknowns;
  both are confirmed in task 1 against known addresses, with canonical names as a
  cosmetic fallback. Low risk.
- Rendering a large chapter (up to about 30 by 30 tiles) in Play Map: mitigated by
  fit-to-view scaling and scroll, and by reusing the existing PNG rather than drawing
  every terrain tile in SVG.
- Fly-specific terrain bonuses touch the combat terrain path: contained by making the
  terrain lookup movement-type aware and covered by a combat test.
