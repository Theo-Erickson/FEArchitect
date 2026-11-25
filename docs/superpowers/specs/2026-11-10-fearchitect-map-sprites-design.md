# FEArchitect: GBA map sprites in the scenario viewer

Date: 2026-11-10
Branch: `feat/map-sprites` (off `feat/tactical-play`)

## Goal

Replace the placeholder unit tokens in the playable scenario viewer with real GBAFE
overworld map sprites, sourced from fan-ripped FE8 (Sacred Stones) sheets rather than
extracted from the ROM. Units play the idle "bob" animation, enemies are recolored to the
red team palette, and units that have acted are greyed out, as in the game.

## Decisions

| Question | Decision |
|---|---|
| Sheet source | FE8 (Sacred Stones) original standing sprites from the FEUniverse FE-Repo on GitHub (spriters-resource is behind a bot check); one sheet per class |
| Animation | Animated idle loop (3 frames). No walk frames, no move animation |
| Enemy coloring | Canvas palette remap, blue team palette to red team palette |
| Slicing | In the browser at runtime (canvas), no build step or PNG decoder dependency |

## 1. Assets and mapping data

**Sheets** live in `assets/mapsprites/` (gitignored, never committed, the same policy as
`assets/reference/`). A committed `assets/mapsprites/CREDITS.md` is not possible inside an
ignored folder, so the ignore rule is `assets/mapsprites/*` with `!assets/mapsprites/CREDITS.md`.
CREDITS.md names the ripper(s) and spriters-resource, as the sheets ask.

**Mapping**: committed `data/mapsprites.json`, keyed by FE8 class id (the keys of
`sim-classes.json`):

```json
{
  "palettes": {
    "player": ["#rrggbb", "..."],
    "enemy":  ["#rrggbb", "..."]
  },
  "classes": {
    "<classId>": {
      "sheet": "fe8-map-sprites.png",
      "x": 0, "y": 0, "w": 16, "h": 16,
      "frames": 3, "stride": [0, 16],
      "bg": "#rrggbb"
    }
  }
}
```

- `x, y, w, h`: the crop of idle frame 0. `w`/`h` vary per class (16x16 foot units,
  16x32 or 32x32 mounted, armored and monster units).
- `frames`, `stride`: frame count and the `[dx, dy]` offset from one frame to the next.
- `bg`: the sheet's background color, keyed out to transparent.
- `palettes.player` / `palettes.enemy`: equal-length, index-aligned color lists. Pixel
  colors found in `player` are replaced with the color at the same index in `enemy`.
  Colors not in the list (skin, hair, steel, outlines) are left alone.

Crop coordinates are authored by inspecting the sheets once they are in place. Classes that
are not mapped yet are left out of the file and fall back (see section 3).

## 2. Slicing engine: `src/grid/mapsprite.ts`

Pure functions over a `PixelBuf = { width, height, data: Uint8ClampedArray }` (RGBA), so
they are unit-tested without a DOM:

- `cropFrame(sheet, x, y, w, h): PixelBuf`
- `keyOut(buf, bg): PixelBuf`: pixels exactly matching `bg` become alpha 0.
- `remapPalette(buf, from, to): PixelBuf`: exact RGB match on `from[i]` becomes `to[i]`;
  throws if the lists differ in length.
- `greyscale(buf): PixelBuf`: luminance grey, alpha preserved (the "has acted" look).
- `frameRect(entry, i)`: the crop rectangle for frame `i`, from `x, y` and `stride`.
- `validateMapping(json)`: checks shape, positive sizes, `frames >= 1`, and equal palette
  lengths. Returns a list of problems (empty when valid).

A thin browser loader (`src/game/mapsprite-loader.ts`) loads each sheet once into an
offscreen canvas, runs the pure pipeline (crop, key out, remap if enemy, grey if acted), and
caches the result as a data URL keyed by `classId:side:acted:frame`. A sheet that fails to
load, or a class with no entry, returns `null` from the loader.

## 3. Rendering and animation (`src/game/scenario.ts` / `scenario.html`)

- The "Class sprites" checkbox becomes a 3-way select: **Map sprite** (default), Portrait,
  Class token.
- In map-sprite mode, `unitToken` draws an SVG `<image>` with the cached data URL, scaled
  from native pixels by an integer factor to fit the 48px tile (16px to 48px = 3x), with
  `image-rendering: pixelated`. Sprites taller than wide are bottom-aligned on the tile and
  overflow upward, as in GBAFE. The HP badge stays. The side ring is dropped in this mode,
  since the palette shows the side.
- Fallback chain in map-sprite mode: map sprite, then the class token (`unitSprite`).
  Portrait mode keeps its current behavior.
- Acted units use the greyscale variant instead of `opacity 0.5` in map-sprite mode.
- **Idle animation**: one shared timer cycles the frame index through 0, 1, 2, 1 with a
  GBA-like cadence (a long hold on frame 0, shorter on the others). Each sprite `<image>`
  carries `data-sprite="classId:side:acted"`. On each tick the timer only swaps `href`
  values and does not re-render the SVG. The timer runs only while map-sprite mode is
  active.

## 4. Testing

- Unit tests (`src/grid/mapsprite.test.ts`) on small synthetic buffers: crop bounds,
  key-out alpha, palette remap (mapped colors change, unmapped ones don't, length mismatch
  throws), greyscale preserves alpha, `frameRect` stride math, `validateMapping` on good and
  bad input, and the committed `data/mapsprites.json` validates.
- Browser verification in the scenario viewer: all three modes; player blue and enemy red;
  the idle loop animates; acted units grey; an unmapped class falls back to the class token;
  with the sheets folder absent, map-sprite mode degrades to class tokens without errors.

## Out of scope

Walking frames and move animation; allied (green) palette; the 1v1 Play Map; ROM extraction
of map sprites; FE7 sheets.

## Prerequisite

The FE8 map-sprite sheet PNGs must be placed in `assets/mapsprites/` before the mapping data
can be authored. Either the user downloads them, or Claude downloads them in the browser pane
after confirming each file.
