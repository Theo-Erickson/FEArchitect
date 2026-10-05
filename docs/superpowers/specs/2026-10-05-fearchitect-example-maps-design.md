# FEArchitect Example Maps

Date: 2026-10-05
Status: Approved for planning
Author: Claude (Opus 4.8) with Theo (Technical Game Designer)

## Prose and code conventions

No em dashes or en dashes anywhere in this document or in code and comments.
Use colons or commas instead. Do not add Co-Authored-By or any attribution
trailer to commits (project owner preference, recorded in memory).

## 1. Purpose

Import real FE8 chapter maps and let them be browsed in the asset gallery. Today
the gallery shows units, classes, items, portraits, and battle animations, all of
which the CLI hands over pre-packaged. Maps are different: they live as
LZ77-compressed graphics plus a tile layout and a tile arrangement (TSA) config,
and the CLI exports those pieces but does not composite them. This sub-project
builds the extraction and compositing pipeline that turns a chapter into a single
map image, and adds a Maps tab to view them.

This is the first of a sequence. It produces the chapter map images, overlays each
chapter's unit start positions on them (as portraits with labels, not yet the real
overworld sprites), and writes a small index. It is the foundation the later tracks
build on (see section 9).

## 2. Toolchain feasibility (decided during brainstorming)

Established by probing the CLI and the FE8 ROM:

- `--export-map-settings` enumerates every chapter (79 in FE8U) and dumps each
  chapter's map-settings record (148 bytes) as raw offset columns, including the
  record's own ROM address. This is the enumeration anchor.
- `--export-asset` extracts the decompressed pieces, each needing a ROM address:
  `--kind=map` (the tile layout, a .mar blob), `--kind=objtiles` (the tileset
  graphics, decompressed 4bpp), `--kind=mapchipconfig` (the TSA / chip config).
  `--export-palette` extracts the palette. The example invocations in `--help`
  confirm the argument shapes.
- There is no one-shot "render chapter N to PNG" command, and no image library is
  available, so FEArchitect does the compositing and PNG encoding itself.
- Every ROM address used is read out of the ROM (from the chapter record and the
  pointers it leads to). Nothing is hardcoded per ROM build by hand.
- The one map unknown is the exact semantics of the chapter record: which fields
  are the pointers to the tile layout, the tileset, the TSA config, and the palette,
  and where the width and height live. The probe showed the first pointer in
  chapter 0's record does not decode as a clean config struct on the first hop, so
  this decode is a real task with a verification checkpoint (section 8), not a
  given. If it proves intractable, we stop and reassess before building the
  compositor.
- Unit placements (who starts where in a chapter) are NOT a struct table. They live
  in the chapter event scripts. `--disasm-event --addr=<ptr>` disassembles a
  script, and the unit-load commands carry a character or class id, x and y, and a
  faction (player, enemy, NPC). So placements are reachable by finding the chapter's
  event pointer, disassembling, and parsing the unit-load commands. This is a second
  reverse-engineering task, best-effort across chapters: event scripts vary
  (conditionals, groups, reinforcements), so we prove it on the example chapters and
  generalize where it parses cleanly. The terrain render does not depend on it.

Zero new dependencies. Node 24 runs the TypeScript directly. PNG output is written
with a small encoder built on the Node built-in `node:zlib`.

## 3. Success criteria

1. A generation step extracts and composites FE8 chapter maps into
   `assets/reference/fe8/maps/<index>.png`, one image per chapter, plus a
   `assets/reference/fe8/maps.json` index listing each map's chapter index, name,
   width, height, image filename, and its unit placements (see criterion 4).
2. The composited image faithfully reproduces the chapter's map as seen in game
   (verified by eyeballing a few known chapters, for example the prologue and
   Chapter 1, against reference screenshots). This terrain render is the first
   milestone and is verified before the unit overlay is built.
3. The gallery has a Maps tab: pick FE8, see the list of chapters from `maps.json`,
   each with its map image (thumbnail that can be viewed larger, consistent with
   the animation zoom pattern), searchable by chapter name.
4. Each map shows its units: the unit start positions are overlaid on the map image
   in the gallery, each as the unit's portrait (already extracted) pinned at its
   tile, with a name or class label and a faction color (player, enemy, NPC).
   Placements are extracted from the chapter event scripts, proven on the example
   chapters and applied to every chapter that parses cleanly. A chapter whose script
   does not parse still shows its terrain map, with no overlay.
5. The compositor and the PNG encoder are pure modules with unit tests that pass
   under `node --test`, using small synthetic inputs (no ROM needed in tests). The
   event unit-load parser is pure and unit tested against sample disassembly text.
6. The full existing suite still passes. No new dependency.
7. Re-running the generation is safe and skips chapters already rendered (resumable,
   like the animation pre-cache).

## 4. Components

### Component 1: Chapter record decode (`tools/assetgen/mapdata.ts`)

A pure module that, given a chapter's 148-byte map-settings record (and the ability
to follow pointers into a ROM buffer), returns the map's geometry and the ROM
addresses of its parts:

```
type MapRef = {
  width: number; height: number;
  layoutPtr: number;   // tile layout (.mar source)
  tilesetPtr: number;  // objtiles graphics
  configPtr: number;   // mapchipconfig (TSA)
  palettePtr: number;  // palette
};
```

The field offsets are named constants documented from the decode task. The module
is pure (record bytes plus ROM buffer in, `MapRef` out) so it can be unit tested
with a synthetic record.

### Component 2: Tiles and palette reader

Thin helpers to read the decompressed `objtiles` (4bpp 8x8 tiles), the TSA config
(which 8x8 tiles and palette bank build each map chip, and their flips), and the
palette (GBA 15-bit BGR to RGBA). These parse the blobs the CLI produces. Kept
small and separate from the compositor.

### Component 3: Map compositor (`tools/assetgen/mapcompose.ts`)

A pure function: given the tile layout (a grid of map-chip indices), the tileset
tiles, the TSA config, and the palette, produce an RGBA pixel buffer for the whole
map (each map chip is a 16x16 block built from four 8x8 tiles per the TSA). No IO,
fully unit testable with a tiny synthetic tileset and layout.

### Component 4: PNG encoder (`tools/assetgen/pngencode.ts`)

A pure function: RGBA pixel buffer plus width and height to PNG bytes, using
`node:zlib` deflate for the image data. Minimal (IHDR, IDAT, IEND, filter type 0).
Unit tested by encoding a tiny image and decoding it back (or checking the chunk
structure and CRCs) so we trust the output.

### Component 5: Unit placement extraction (`tools/assetgen/placements.ts`)

A pure parser plus a thin runner step. The runner finds a chapter's event pointer
(from the chapter data) and calls `--disasm-event --addr=<ptr>`. The pure parser
takes the disassembly text and returns the unit placements:

```
type Placement = { charId: number; classId: number; x: number; y: number;
                   faction: "player" | "enemy" | "npc" };
```

It reads the unit-load commands and their coordinate arguments. It is best-effort:
unknown or unparseable constructs are skipped, not guessed. Pure (text in,
placements out) so it is unit tested against sample disassembly.

### Component 6: Generation runner and launcher

`tools/assetgen/mapgen.ts`: for each game with a ROM present (FE8 first), run
`--export-map-settings`, decode each chapter with `mapdata`, call `--export-asset`
and `--export-palette` for its parts, composite with `mapcompose`, encode with
`pngencode`, and write `maps/<index>.png`. Then extract placements with
`placements` and write everything to `maps.json` (index, name, dimensions, image
file, and the placements array per chapter). Resumable: skip a chapter whose PNG
already exists. Print progress and a made/skipped/failed summary, like the animation
pre-cache. A `Generate Maps.cmd` launcher runs it.

### Component 7: Gallery Maps tab

`gallery/index.html` gains a Maps tab button. `gallery/client.ts` gains a renderer
that fetches `maps.json` (via the existing static route, cached like other tables),
lists each chapter as a card with its name, index, and dimensions, is searchable by
name, and shows the map image with its units overlaid: for each placement, the
unit's portrait is absolutely positioned at its tile (pixel position from x and y
times the tile size times the zoom), with a name or class label and a faction
color. The overlay is done in the DOM over the image, not baked into the PNG, so
portraits stay crisp and labels can be interactive, and the terrain PNG stays a
clean reusable asset. The image can be viewed larger (reuse the zoom idea from the
animations tab, scaling the overlay with it). The gallery server needs no new
endpoint: map images and `maps.json` are static files under `assets/reference/`,
already allow-listed.

## 5. Architecture

Extraction and generation live under `tools/assetgen/` next to the existing import
runner and `paths.ts`, reusing `cliPath`, `romPath`, `gameDir`, and `presentGames`.
The gallery changes are confined to `gallery/client.ts` and `gallery/index.html`.
The pure modules (`mapdata`, `mapcompose`, `pngencode`, `placements`) hold the
testable logic; the runner is the thin IO shell. Generated images and `maps.json` live under
`assets/reference/fe8/`, which is gitignored (derived from a copyrighted ROM).

## 6. Data shapes

`maps.json` (the index, carrying the placement data this and later tracks use):

```
[ { "index": 0, "name": "00 The Fall of Renais", "width": 16, "height": 9,
    "file": "maps/0.png",
    "units": [ { "charId": 1, "classId": 2, "x": 5, "y": 8, "faction": "player" },
               { "charId": 0, "classId": 52, "x": 10, "y": 3, "faction": "enemy" } ] },
  ... ]
```

Chapter names come straight from `--export-map-settings`. Width and height come
from the decoded record. `units` comes from the event-script placement parser, and
is an empty array for a chapter whose script does not parse.

## 7. Prose note on the compositor

A GBAFE map is a grid of 16x16 map chips. Each chip is defined by the TSA config as
four 8x8 tiles (each with a palette bank and optional horizontal or vertical flip)
drawn from the tileset. The tile layout gives, per map cell, which chip to draw.
The compositor walks the layout, expands each chip through the TSA into four tiles,
looks up each tile's 4bpp pixels and palette bank, and writes RGBA. This is
standard, deterministic GBA tile assembly.

## 8. Testing

- `mapdata`: decode a synthetic 148-byte record and assert the returned geometry
  and pointers. Plus the real decode is verified during implementation by rendering
  a known chapter and comparing to a reference screenshot (the checkpoint that
  gates building the rest).
- `mapcompose`: a tiny synthetic tileset (a couple of distinct 8x8 tiles), a small
  TSA, and a 2x2 chip layout produce the expected RGBA, including a flipped tile.
- `pngencode`: encode a small known image, confirm it round-trips (re-decode with
  `zlib.inflateSync` and the known chunk layout) and that CRCs are valid.
- `placements`: parse sample event disassembly text with a few unit-load commands
  (player and enemy, with coordinates) and assert the returned placements, including
  that an unparseable line is skipped rather than guessed.
- The gallery Maps tab is browser-verified: the images look like the real chapters,
  the units sit on the right tiles with correct faction colors and labels, the list
  is searchable, and larger view works.
- The full existing suite still passes.

## 9. Out of scope now, planned next (captured from owner intent)

These are explicit future tracks this foundation is built to feed. They are not in
this spec, but the extraction above is shaped so they drop in cleanly later:

- **Terrain grid for the tactical sim.** Each FE8 map chip maps to a terrain type,
  and each terrain type carries defense, avoid, and movement cost. A later
  sub-project extracts a per-tile terrain grid from the same chapter data and the
  terrain tables, so the Slice B skirmish can run on a real chapter and a unit on a
  forest tile gets its defense and avoid bonus. `maps.json` grows a terrain layer,
  and the grid data model consumes it.
- **Real overworld map sprites.** This sub-project overlays unit positions with
  portraits as the marker. A later track extracts the actual overworld map sprites
  (spritesheets, with an index of which sprite is which) and swaps them in for the
  portraits at each placement, giving the true in-game map look. Map sprites have no
  clean anchor yet (see the prior investigation) and get their own spec.
- **Encounter browser.** Building out every chapter as a full encounter view with
  labels and previews: the unit roster per chapter with names, classes, and stat
  previews beside the map, growing the Maps tab into an encounter browser. The
  placement data from this sub-project is the seed.
- **FE7 maps.** The FE7 chapter struct differs. A fast follow once FE8 works.
- **Map change overlays** (fog, destroyed walls, mid-chapter changes) and the
  unified ROM asset install remain later tracks.

## 10. Risks

- The chapter record decode (Component 1) is the first gating unknown. Mitigation:
  it is the first task, verified against a known chapter before any compositor work.
  If the record does not yield the pointers cleanly, we stop and reassess (the
  fallback is to narrow to a single hardcoded chapter to prove the compositor, or
  to pause the track) rather than guessing.
- Event-script placement parsing (Component 5) is the second gating unknown, and it
  comes after the terrain render is already shippable. Mitigation: it is best-effort
  by design. We prove the parser on the example chapters; chapters that do not parse
  simply show terrain with no overlay, so a messy script never blocks the maps. If
  broad parsing proves unreliable, the overlay ships for the chapters that do parse
  and the rest is a follow-up.
- Compositor correctness (flips, palette banks, chip size) is detail-heavy but
  deterministic and unit tested, then eyeball-verified against real chapters.
