# FEArchitect terrain tiles: design

Date: 2026-11-25
Status: approved design, pending spec review
Branch: `feat/terrain-tiles` (from `feat/tactical-play`; `feat/map-sprites` had not merged)

## Goal

Replace the placeholder SVG terrain (`terrainSprite()` / `TILE_COLORS` in
`src/grid/render.ts`) in the map viewers with real GBA FE8 terrain tiles, and stop the
scenario viewer drawing FE8 chapter maps as grey boxes.

## Findings that shape the design

- The user-supplied fan collection (`Feaws Tileset Collection.zip`, folder `FE 8/`) has 23
  FE8 sheets. Each is 512x512: 32x32 chips of 16x16 pixels.
- **The sheets are in ROM chip order, offset by one.** Sheet position `p` (row-major,
  `p = row*32 + col`) holds ROM chip `p + 1`; ROM chip 0 is not on the sheet. Rebuilding
  chapter maps from the sheets with this rule matches the repo's ROM-rendered chapter PNGs
  for 77 of 79 FE8 chapters (most at 100% of cells, comparing colours at 5 bits per
  channel). The two misses (chapters 15 and 28, tile config `0x081A55B4`) belong to a
  tileset whose sheet does not match; the `Desert.png` sheet has no matching chapter.
- A ROM tile config ends in a terrain lookup with one byte per chip
  (`docs/superpowers/notes/fe8-map-format.md`). Together with the chip-order finding this
  labels every chip on a sheet with its FE8 terrain id, and the 77 matched chapter layouts
  show which chip FE8 itself places next to which terrains.
- FE8 chapter maps already have full ROM-rendered PNGs at
  `assets/reference/fe8/maps/<n>.png`. The 1v1 viewer (`src/game/client.ts`) uses them as
  the board backdrop; the scenario viewer (`src/game/scenario.ts`) does not.
- A spike (side-by-side on `maps/showcase-terrain.json`) confirmed neighbor-aware chip
  choice gives river banks and blended forest edges, where one chip per terrain gives
  hard boxes.

## Decisions (from brainstorming)

1. Tile art comes from the fan sheets, copied into a gitignored folder. Not generated
   from the ROM.
2. Custom maps pick chips by **learned context**: an index mined from the real FE8
   chapters, built once with the ROM.
3. A custom map names its sheet with an optional `"tileset"` field, and the scenario
   viewer gets a dropdown to swap sheets live.

## Components

### 1. Sheet import (step 1 of `tools/assetgen/tilesets.ts`)

`node tools/assetgen/tilesets.ts [zip]` first copies the FE8 sheets into
`assets/tilesets/fe8/`.

- A minimal zip reader (`tools/assetgen/zipread.ts`, pure): reads the end-of-central-directory
  record and the central directory, and returns entries `{ name, method, read() }`, inflating only when read. It
  supports stored (0) and deflate (8) via `node:zlib` `inflateRawSync`, and throws on
  anything else or on encrypted entries.
- Only entries whose name matches `FE 8/<basename>.png` are written. The output name is
  the basename slugged: lowercase, spaces to `-`, only `[a-z0-9-]` kept
  (`Castle Blue.png` -> `castle-blue.png`). Names with `..`, a slash after the folder, or an
  empty slug are skipped. Nothing else in the zip is extracted, and nothing is executed.
- Output: one PNG per sheet. The display name (`Castle Blue`) is recorded by the index
  step from the original basename list, which the import writes to
  `assets/tilesets/fe8/sheets.json` as `[{ "name": "Castle Blue", "file": "castle-blue.png" }]`.

### 2. Chip index (step 2 of `tools/assetgen/tilesets.ts`)

The same command then builds the index (needs `base/FE8_Clean.gba`, the FEBuilder CLI and
the chapter PNGs from `mapgen.ts`). For every FE8 chapter in `assets/reference/fe8/maps.json`:

1. Resolve the chapter's layout and tile-config pointers with `mapdata.ts` and export the
   `.mar` and `.cfg` with the CLI into a temp folder (as `mapgen.ts` does).
2. Decode the chapter PNG and each sheet (a small PNG decoder, `tools/assetgen/pngdecode.ts`,
   handling 8-bit RGBA/RGB/palette, all five filters, non-interlaced only).
3. **Match** the chapter to a sheet: the sheet with the highest share of cells whose
   16x16 pixels equal sheet position `chip - 1` at 5-bit colour. A match needs at least
   50% of cells; otherwise the chapter is skipped.
4. **Mine** the chapter into its sheet's accumulators:
   - The cell's terrain id is the tile-config lookup byte for its chip (as
     `terraingrid.ts` computes it); its sheet position is `chip - 1`.
   - `contexts[key][p] += 1`, where `key = "t,n,e,s,w"` is the cell's terrain id and its
     four neighbours' ids, with `-1` for off-map.
   - `freq[t][p] += 1`.
   Chip 0 cells (no sheet position) are ignored.

Output, all under the gitignored `assets/tilesets/fe8/`:

- `index.json`: `{ "sheets": [{ "name", "file", "data", "chapters": [n...], "terrains": [id...] }] }`
  listing only sheets with at least one matched chapter. `terrains` is the sorted set of
  terrain ids seen in mined cells.
- `<slug>.json` per indexed sheet: `{ "contexts": { key: [[p, count], ...] }, "freq": { t: [[p, count], ...] } }`,
  each list sorted by count descending.

The pure parts (sheet matching score, mining one chapter into accumulators, serialising)
live in `tools/assetgen/tilesetmine.ts` and are unit tested on synthetic layouts, configs
and images. The script prints a per-sheet terrain report (id, name, cell count) used to tune
the terrain mapping below.

### 3. Terrain mapping

Each custom terrain in `data/terrain.json` gains an optional `fe8` array of candidate FE8
terrain ids, in preference order. Values, tuned against the index report:

| Custom terrain | `fe8` |
|---|---|
| plains | `[1]` |
| forest | `[12]` |
| mountain | `[17, 18]` |
| water | `[16, 21, 22]` |
| wall | `[26, 27, 38]` |

These were tuned against the real index. FE8 terrain ids by move cost: 12 Forest, 13 Thicket,
16 River, 17 Mountain, 18 Peak, 21 Sea, 22 Lake, 26/27 Wall, 38 Cliff.

`TerrainDef` gets `fe8?: number[]`. `validateTerrainDefs` accepts it when absent or an
array of integers, and throws otherwise.

For a given sheet, a custom terrain resolves to the first candidate id in that sheet's
`terrains`; if none is present, its tiles are `null` (SVG fallback).

### 4. Chip picker: `src/grid/tiles.ts` (pure, no DOM)

```ts
chooseChips(map: ResolvedMap, defs: Record<string, TerrainDef>,
            sheet: { terrains: number[]; contexts: ...; freq: ... }): (number | null)[][]
```

Each cell's custom terrain is first resolved to an FE8 id (section 3); its neighbours'
ids form the key (`-1` off-map; a neighbour with no FE8 id also counts as `-1`). The cell
then takes the first non-empty candidate list from:

1. `contexts["t,n,e,s,w"]`, the exact context.
2. The same key with every `-1` replaced by `t` (map edges treated as more of the same).
3. The known context for centre `t` with the most neighbour ids equal to the cell's
   neighbours, provided at least two match (ties: higher total count, then key order).
4. `freq[t]`.

No candidates, or no FE8 id for the cell: `null`.

**Variation:** from the chosen list, keep chips whose count is at least half the top
count, and pick one with a deterministic hash of `(x, y)` (the same hash family as
`vary()` in `render.ts`). Same map and sheet always give the same chips.

### 5. Backdrop: `src/game/tilebackdrop.ts` (browser)

- `loadTilesetIndex()`: fetches `/assets/tilesets/fe8/index.json`; resolves to `null` on
  any failure (assets not installed).
- `tileBackdrop(map, defs, sheetName)`: fetches the sheet JSON and image (cached per
  sheet), runs `chooseChips`, draws each non-null chip onto a canvas at 16 px per tile,
  and resolves to `{ href: dataURL, covered: boolean[][] }`. Cached per `(map.id, sheet)`.
- Viewers draw the backdrop as one `<image>` scaled to the board with
  `image-rendering: pixelated`. Cells not covered keep today's `TILE_COLORS` fill and
  `terrainSprite()` art, drawn on top of the backdrop only for those cells.
- Until the backdrop resolves, or if assets are missing, the board renders exactly as
  today. When it resolves the viewer re-renders once.

### 6. Viewers

**Scenario viewer** (`src/game/scenario.ts`, `scenario.html`):

- FE8 chapter encounters (`"terrain": "fe8"`) draw `assets/reference/fe8/maps/<n>.png`
  as the backdrop, as the 1v1 viewer does, instead of grey rects.
- Custom maps use the tile backdrop.
- New control next to "Class sprites": `<select id="tileset">` with "Placeholder (SVG)"
  plus each indexed sheet name. Its initial value is the map's `tileset` if indexed, else
  "Overworld Regular" (the sheet with the most mined chapters), else placeholder. Hidden
  for FE8 chapter encounters and when the index is missing.
- Changes are limited to the terrain part of `render()`, boot, and wiring the new
  control. The unit token code (`unitToken`) is not touched, to stay clear of
  `feat/map-sprites`.

**1v1 viewer** (`src/game/client.ts`): custom maps use the tile backdrop with the map's
`tileset` or the default. No picker.

### 7. Map format

Custom map JSON (legend format) may carry `"tileset": "<sheet name>"`. `ResolvedMap`
gains `tileset?: string`, copied by `resolveMap` when it is a string. The game logic
ignores it. The shipped maps under `maps/` stay as they are (default sheet).

### 8. Server and repo hygiene

- `src/server.ts` `staticAllowed` adds `assets/tilesets/`, with a test in
  `src/server.test.ts`. `feat/map-sprites` edits the same line (`assets/mapsprites/`);
  the merge conflict is a one-line union.
- `.gitignore`: `assets/tilesets/**` and `!assets/tilesets/CREDITS.md`.
- `assets/tilesets/CREDITS.md` (tracked): credits Feaw's Tileset Collection as the source,
  notes the art belongs to Nintendo / Intelligent Systems and is not committed, and gives
  the restore command. A hub entry "Build Tilesets" with `launchers/Build Tilesets.cmd`
  runs it (the zip defaults to `Feaws Tileset Collection.zip` at the repo root; import
  is skipped when no zip is found but sheets are already imported).
- README: a short "Terrain tiles" note with the same command.

## Error handling

- Import: missing zip, a non-zip file, or no `FE 8/*.png` entries are clear errors;
  unsafe names are skipped with a log line.
- Index: missing ROM, CLI, chapter PNGs or imported sheets fail with a message naming the
  missing piece and the command that produces it. A chapter that fails to export or
  match is logged and skipped, like `mapgen.ts`.
- Browser: every tileset fetch failure degrades to the SVG art, never an exception
  surfaced to the user. A map `tileset` naming an unknown sheet falls back to the
  default.

## Testing

- `zipread.test.ts`: stored and deflated entries from an in-memory zip built in the test;
  rejects unsupported methods.
- Import name filter: slugging and skipping unsafe names.
- `pngdecode.test.ts`: round-trips images produced by the existing `pngencode.ts`.
- `tilesetmine.test.ts`: match score on a synthetic sheet/chapter, context and frequency
  counts, edge `-1` keys, chip 0 ignored.
- `tiles.test.ts`: each fallback step, the `null` cases, variation determinism and the
  half-of-top threshold, terrain candidate resolution.
- `resolve.test.ts`: `fe8` validation and `tileset` passthrough.
- `server.test.ts`: `assets/tilesets/` is served and `..` still refused.
- Full suite: `node --no-warnings --test`.
- Browser: `/src/game/scenario.html` on a custom map (tiles visible, dropdown swaps
  sheets, placeholder option restores SVG) and on an FE8 chapter encounter (chapter PNG
  backdrop), plus the 1v1 viewer on a custom map.

## Out of scope

- Map authoring with raw chip indices (the future authoring track can reuse the index).
- Animated water and other palette or tile animations.
- FE6/FE7 sheets.
- Chip-to-chip seam matching beyond terrain neighbours (for example wave-function
  collapse).
