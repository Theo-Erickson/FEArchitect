# FEArchitect Example Maps

Date: 2026-10-05
Status: Approved for planning
Author: Claude (Opus 4.8) with Theo (Technical Game Designer)

## Prose and code conventions

No em dashes or en dashes anywhere in this document or in code and comments.
Use colons or commas instead. Do not add Co-Authored-By or any attribution
trailer to commits (project owner preference, recorded in memory).

## 1. Purpose

Import real FE8 chapter maps and let them be browsed in the asset gallery, rendered
with their proper tile graphics (a faithful picture of each chapter's map). Today
the gallery shows units, classes, items, portraits, and battle animations, all of
which the CLI hands over pre-packaged. Maps are different: they live as
LZ77-compressed tile graphics plus a tile layout and a tile arrangement (TSA)
config, and the CLI exports those pieces but does not composite them. This
sub-project builds the extraction and compositing pipeline that turns a chapter into
a single map image, and adds a Maps tab to view them.

This is the first of a sequence. It produces the chapter map images (proper tiles)
plus a small index, and nothing else: no unit or enemy placements, no terrain
gameplay data. Those are later tracks (section 9) that build on this foundation.

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
- The one unknown is the exact semantics of the chapter record: which fields are
  the pointers to the tile layout, the tileset, the TSA config, and the palette,
  and where the width and height live. The probe showed the first pointer in
  chapter 0's record does not decode as a clean config struct on the first hop, so
  this decode is a real task with a verification checkpoint (section 8), not a
  given. If it proves intractable, we stop and reassess before building the
  compositor.

Zero new dependencies. Node 24 runs the TypeScript directly. PNG output is written
with a small encoder built on the Node built-in `node:zlib`.

## 3. Success criteria

1. A generation step extracts and composites FE8 chapter maps into
   `assets/reference/fe8/maps/<index>.png`, one image per chapter, plus a
   `assets/reference/fe8/maps.json` index listing each map's chapter index, name,
   width, height, and image filename.
2. The composited image faithfully reproduces the chapter's map as seen in game,
   with the correct tile graphics (verified by eyeballing a few known chapters, for
   example the prologue and Chapter 1, against reference screenshots).
3. The gallery has a Maps tab: pick FE8, see the list of chapters from `maps.json`,
   each with its map image (thumbnail that can be viewed larger, consistent with
   the animation zoom pattern), searchable by chapter name.
4. The compositor and the PNG encoder are pure modules with unit tests that pass
   under `node --test`, using small synthetic inputs (no ROM needed in tests).
5. The full existing suite still passes. No new dependency.
6. Re-running the generation is safe and skips chapters already rendered (resumable,
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

### Component 5: Generation runner and launcher

`tools/assetgen/mapgen.ts`: for each game with a ROM present (FE8 first), run
`--export-map-settings`, decode each chapter with `mapdata`, call `--export-asset`
and `--export-palette` for its parts, composite with `mapcompose`, encode with
`pngencode`, and write `maps/<index>.png`. Write `maps.json` with the index.
Resumable: skip a chapter whose PNG already exists. Print progress and a
made/skipped/failed summary, like the animation pre-cache. A `Generate Maps.cmd`
launcher runs it.

### Component 6: Gallery Maps tab

`gallery/index.html` gains a Maps tab button. `gallery/client.ts` gains a renderer
that fetches `maps.json` (via the existing static route, cached like other tables),
lists each chapter as a card with its name, index, dimensions, and map image, is
searchable by name, and lets an image be viewed larger (reuse the zoom idea from
the animations tab). The gallery server needs no new endpoint: map images and
`maps.json` are static files under `assets/reference/`, already allow-listed.

## 5. Architecture

Extraction and generation live under `tools/assetgen/` next to the existing import
runner and `paths.ts`, reusing `cliPath`, `romPath`, `gameDir`, and `presentGames`.
The gallery changes are confined to `gallery/client.ts` and `gallery/index.html`.
The pure modules (`mapdata`, `mapcompose`, `pngencode`) hold the testable logic;
the runner is the thin IO shell. Generated images and `maps.json` live under
`assets/reference/fe8/`, which is gitignored (derived from a copyrighted ROM).

## 6. Data shapes

`maps.json` (the index):

```
[ { "index": 0, "name": "00 The Fall of Renais", "width": 16, "height": 9,
    "file": "maps/0.png" }, ... ]
```

Chapter names come straight from `--export-map-settings`. Width and height come
from the decoded record. Later tracks grow this record (a terrain layer, a unit
placement array); this sub-project writes only the fields above.

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
- The gallery Maps tab is browser-verified: the images look like the real chapters,
  the list is searchable, and larger view works.
- The full existing suite still passes.

## 9. Out of scope now, planned next (captured from owner intent)

These are explicit future tracks this foundation is built to feed. They are not in
this spec, but the extraction above is shaped so they drop in cleanly later:

- **Unit and enemy placements, then an encounter browser.** Who starts where in a
  chapter, extracted from the chapter event scripts (via `--disasm-event` and
  parsing the unit-load commands), overlaid on the map. From there, every chapter
  grows into a full encounter view: the unit roster with names, classes, and stat
  previews beside the map. `maps.json` grows a placements array; the Maps tab grows
  into an encounter browser. This is the immediate next sub-project after maps.
- **Terrain grid for the tactical sim.** Each FE8 map chip maps to a terrain type,
  and each terrain type carries defense, avoid, and movement cost. A later
  sub-project extracts a per-tile terrain grid from the same chapter data and the
  terrain tables, so the Slice B skirmish can run on a real chapter and a unit on a
  forest tile gets its defense and avoid bonus. `maps.json` grows a terrain layer,
  and the grid data model consumes it.
- **Real overworld map sprites.** The actual little map sprites for classes and
  units, as spritesheets with an index of which sprite is which, to draw at each
  placement in the encounter view. Map sprites have no clean anchor yet (see the
  prior investigation) and get their own spec.
- **FE7 maps.** The FE7 chapter struct differs. A fast follow once FE8 works.
- **Map change overlays** (fog, destroyed walls, mid-chapter changes) and the
  unified ROM asset install remain later tracks.

### North star: authoring, assisted by the MCP

The end intention is editing, not just viewing. Eventually FEArchitect should let
the owner edit a map, and edit a scenario (which units start where, what events fire
on which turn, and which map it plays on), with the MCP as the authoring assistant
("add three archers on the east ridge on turn 3", "make this a defend map"). This
read-only extraction is step 1: it proves we can read maps, placements, and events
faithfully. The write path (the CLI has `--import-asset`, `--import-data`, and
`--compile-event` for map, data, and event write-back) and an MCP authoring surface
are their own large tracks after reading is solid. The data shapes here (a per-chapter
record of map, placements, and later events) are chosen to be the same shapes an
editor and the MCP will read and write, so authoring builds on this rather than
replacing it. We do not build any of the write path now (YAGNI), only keep the read
model editing-friendly.

## 10. Risks

- The chapter record decode (Component 1) is the gating unknown. Mitigation: it is
  the first task, verified against a known chapter before any compositor work. If
  the record does not yield the pointers cleanly, we stop and reassess (the
  fallback is to narrow to a single hardcoded chapter to prove the compositor, or
  to pause the track) rather than guessing.
- Compositor correctness (flips, palette banks, chip size) is detail-heavy but
  deterministic and unit tested, then eyeball-verified against real chapters.
