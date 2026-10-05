# FEArchitect Example Maps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each FE8 chapter to a tile-accurate map PNG and browse them in a new gallery Maps tab.

**Architecture:** A reverse-engineering spike first nails the chapter-record offsets and the exact byte formats of the CLI's extracted blobs. Then pure, tested modules do the work: a PNG encoder on `node:zlib`, a tileset/palette reader, a map compositor, and a chapter-record decoder. A thin runner drives the CLI, composites, and writes `maps/<index>.png` plus `maps.json`. The gallery gets a Maps tab that serves those static files.

**Tech Stack:** TypeScript on Node 24 (no build, no deps), the FEBuilderGBA.CLI for extraction, `node:zlib` for PNG deflation, the Node built-in test runner.

**Prose and code conventions:** No em dashes or en dashes anywhere. Use commas or colons. Comment new code well. Do NOT add Co-Authored-By or any attribution trailer to commits (project owner preference).

**Context:** `tools/assetgen/paths.ts` already exports `GAMES`, `Game`, `cliPath(root)`, `romPath(root, game)`, `gameDir(root, game)`, `referenceDir(root)`, `presentGames(root)`. The existing import runner `tools/assetgen/import.ts` shows the CLI-spawn pattern (`spawnSync`, `runCli`). The gallery (`gallery/server.ts`, `gallery/client.ts`, `gallery/index.html`) already serves static files under `assets/reference/`, strips TS types for `.ts`, and has a tabbed UI with a search box and a zoom pattern on the Animations tab. `assets/reference/` is gitignored.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `tools/assetgen/pngencode.ts` | Pure: RGBA + dimensions to PNG bytes via `node:zlib`. |
| `tools/assetgen/pngencode.test.ts` | Tests for the encoder (round-trip). |
| `tools/assetgen/mapcompose.ts` | Pure: layout + TSA + tiles + palette to RGBA. |
| `tools/assetgen/mapcompose.test.ts` | Tests for the compositor (incl. flips, palette banks). |
| `tools/assetgen/maptiles.ts` | Pure: parse the objtiles, TSA, and palette blobs into the shapes the compositor wants. |
| `tools/assetgen/maptiles.test.ts` | Tests for the blob parsers. |
| `tools/assetgen/mapdata.ts` | Pure: decode a chapter record to geometry + part pointers. |
| `tools/assetgen/mapdata.test.ts` | Tests for the record decode. |
| `tools/assetgen/mapgen.ts` | Runner: CLI calls, compose, encode, write PNGs + `maps.json`. |
| `Generate Maps.cmd` | Double-click launcher for the runner. |
| `gallery/client.ts` | MODIFY: Maps tab renderer. |
| `gallery/index.html` | MODIFY: Maps tab button (+ any small style). |
| `docs/superpowers/notes/fe8-map-format.md` | The spike's documented findings (offsets, formats). |

---

## Task 1: Reverse-engineering spike (chapter record offsets and blob formats)

This task produces knowledge, not shipping code. It is the gate: if the record does
not decode cleanly, STOP and report before building the compositor (per the spec's
risk section). Its output is `docs/superpowers/notes/fe8-map-format.md` with concrete
constants and format notes the later tasks consume.

**Files:**
- Create: `docs/superpowers/notes/fe8-map-format.md`

- [ ] **Step 1: Export chapter settings and one chapter's parts**

Run (from repo root), using Chapter 1 ("01 Ch1 Escape!", index 0x01, record address
`0x008B0924` from `--export-map-settings`):

```bash
CLI=./tools/febuilder-cli/FEBuilderGBA.CLI.exe
ROM=base/FE8_Clean.gba
mkdir -p /tmp/mapspike
"$CLI" --export-map-settings --rom=$ROM --out=/tmp/mapspike/maps.tsv
```

Record every offset column of the chapter 1 row.

- [ ] **Step 2: Decode the chapter / map-config record**

Write a throwaway Node snippet (not committed) that reads the ROM, follows the
record's candidate pointers, and prints structured views, to answer:
- Which record field (or one pointer hop from it) holds the map width and height.
- Which fields point to: the tile layout, the objtiles (tileset graphics), the
  mapchipconfig (TSA), and the palette.

Cross-reference the known FE8U map-config structure: the chapter's map data pointer
leads to a config with width, height, and pointers to tileset graphics, tile
config (TSA), and palette. Confirm widths/heights look sane (single-digit to ~30).

- [ ] **Step 3: Extract the parts and confirm their formats**

With the pointers found, run and inspect sizes/first bytes:

```bash
"$CLI" --export-asset --kind=map          --rom=$ROM --addr=<layoutPtr>  --out=/tmp/mapspike/ch1.mar
"$CLI" --export-asset --kind=objtiles     --rom=$ROM --addr=<tilesetPtr> --out=/tmp/mapspike/ch1.objtiles
"$CLI" --export-asset --kind=mapchipconfig --rom=$ROM --addr=<configPtr> --out=/tmp/mapspike/ch1.mapchipconfig
"$CLI" --export-palette                   --rom=$ROM --addr=<palettePtr> --out=/tmp/mapspike/ch1.pal
```

For each blob determine: is it a raw binary payload or a FEBuilder container? If
`--kind=map` yields a `.mar` container rather than raw tile indices, note whether
`--import-asset --kind=map --in=ch1.mar --out=ch1.tmap_raw.bin` produces the raw
`u16` layout (the examples in `--help` show this conversion). Record the resolved
raw format for each of: layout (u16 chip indices, row-major, width x height), TSA
(4 u16 screen entries per chip), tiles (4bpp, 32 bytes per 8x8 tile), palette (15-bit
BGR, 2 bytes per color, 16 colors per bank).

- [ ] **Step 4: Hand-verify a few tiles**

Manually expand the first map chip of the layout through the TSA to four tiles, read
a couple of 4bpp pixels, map through the palette, and confirm the colors are
plausible for that chapter's top-left corner (for example green grass). This proves
the formats before the compositor is built.

- [ ] **Step 5: Write the findings doc**

Create `docs/superpowers/notes/fe8-map-format.md` documenting, as concrete values:
the chapter-record field offsets for width, height, layout pointer, tileset pointer,
config pointer, palette pointer (and any pointer-hop needed); the raw format of each
blob (and the exact CLI commands to produce raw forms); and the bit layout of a TSA
entry (tile number bits, hflip bit, vflip bit, palette bank bits). Include the Ch1
values as a worked example.

- [ ] **Step 6: Go / no-go**

If all offsets and formats resolved and the hand-verify looked right, mark GO in the
doc and commit. If not, STOP and report to the owner with what was found and where it
broke, rather than guessing.

```bash
git add docs/superpowers/notes/fe8-map-format.md
git commit -m "docs: FE8 map format findings (chapter record offsets and blob formats)"
```

---

## Task 2: PNG encoder

Fully specified now (format independent). TDD.

**Files:**
- Create: `tools/assetgen/pngencode.ts`
- Test: `tools/assetgen/pngencode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/assetgen/pngencode.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { encodePng } from "./pngencode.ts";

// Decode just enough of our own PNG to prove the pixels survive: read IHDR, collect
// IDAT, inflate, and strip the per-row filter byte (we only ever write filter 0).
function decode(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let o = 8; let width = 0, height = 0; const idat: Uint8Array[] = [];
  while (o < png.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7]);
    const data = png.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { width = dv.getUint32(o + 8); height = dv.getUint32(o + 12); }
    if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const merged = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let m = 0; for (const d of idat) { merged.set(d, m); m += d.length; }
  const raw = inflateSync(merged);
  const stride = width * 4;
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) raw.copy
    ? raw.copy(rgba, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    : rgba.set(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride), y * stride);
  return { width, height, rgba };
}

test("encodePng round-trips a small RGBA image", () => {
  const width = 2, height = 2;
  const rgba = Uint8Array.from([
    255, 0, 0, 255,   0, 255, 0, 255,
    0, 0, 255, 255,   255, 255, 255, 255,
  ]);
  const png = encodePng(rgba, width, height);
  const back = decode(png);
  assert.equal(back.width, 2);
  assert.equal(back.height, 2);
  assert.deepEqual([...back.rgba], [...rgba]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/assetgen/pngencode.test.ts`
Expected: FAIL, `./pngencode.ts` not found.

- [ ] **Step 3: Implement `tools/assetgen/pngencode.ts`**

```ts
// Minimal PNG encoder: 8-bit RGBA, no interlace, filter type 0 per scanline, image
// data deflated with the Node built-in zlib. No dependencies.
import { deflateSync } from "node:zlib";

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Standard PNG CRC-32 over the chunk type and data.
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type 6 = truecolor with alpha
  // bytes 10..12 stay 0: deflate compression, filter method 0, no interlace.

  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (none) for this row
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw);

  const parts = [SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/assetgen/pngencode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/assetgen/pngencode.ts tools/assetgen/pngencode.test.ts
git commit -m "feat: minimal zero-dependency PNG encoder"
```

---

## Task 3: Map compositor

Fully specified now (format independent: it takes already-parsed inputs). TDD.

**Files:**
- Create: `tools/assetgen/mapcompose.ts`
- Test: `tools/assetgen/mapcompose.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/assetgen/mapcompose.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeMap } from "./mapcompose.ts";

// Two 8x8 tiles in 4bpp (32 bytes each). Tile 0: every pixel color index 1.
// Tile 1: left column (x=0) index 2, the rest index 1, so a flip is detectable.
function makeTiles(): Uint8Array {
  const t = new Uint8Array(64);
  for (let i = 0; i < 32; i++) t[i] = 0x11; // tile 0: all nibbles = 1
  for (let row = 0; row < 8; row++) {
    // tile 1 lives at bytes 32..63; byte row*4 holds pixels x0 (low nibble) and x1.
    t[32 + row * 4] = 0x12; // x0 = 2, x1 = 1
    for (let b = 1; b < 4; b++) t[32 + row * 4 + b] = 0x11;
  }
  return t;
}

// Palette bank 0: index1 = red, index2 = green. (RGBA, 16 colors per bank.)
function makePalette(): Uint8Array {
  const p = new Uint8Array(16 * 4);
  p.set([255, 0, 0, 255], 1 * 4);
  p.set([0, 255, 0, 255], 2 * 4);
  return p;
}

test("composeMap builds one chip from four tiles with correct size", () => {
  // One map chip (16x16). TSA: 4 subtiles all tile 0, no flip, bank 0.
  const tsa = Uint16Array.from([0, 0, 0, 0]);
  const layout = Uint16Array.from([0]);
  const out = composeMap({ widthChips: 1, heightChips: 1, layout, tsa, tiles: makeTiles(), palette: makePalette() });
  assert.equal(out.width, 16);
  assert.equal(out.height, 16);
  // top-left pixel is tile 0 index 1 = red
  assert.deepEqual([...out.rgba.subarray(0, 4)], [255, 0, 0, 255]);
});

test("composeMap honors horizontal flip", () => {
  // One chip; top-left subtile = tile 1 (left column green). Without flip, x=0 green.
  // With hflip (bit 10), the green column moves to x=7.
  const palette = makePalette();
  const tiles = makeTiles();
  const noflip = composeMap({ widthChips: 1, heightChips: 1, layout: Uint16Array.from([0]), tsa: Uint16Array.from([1, 0, 0, 0]), tiles, palette });
  assert.deepEqual([...noflip.rgba.subarray(0, 4)], [0, 255, 0, 255]); // x0 green
  const hflip = composeMap({ widthChips: 1, heightChips: 1, layout: Uint16Array.from([0]), tsa: Uint16Array.from([(1 << 10) | 1, 0, 0, 0]), tiles, palette });
  // x0 is now the mirrored right edge: red; x7 is green.
  assert.deepEqual([...hflip.rgba.subarray(0, 4)], [255, 0, 0, 255]);
  const rowStride = 16 * 4;
  assert.deepEqual([...hflip.rgba.subarray(7 * 4, 7 * 4 + 4)], [0, 255, 0, 255]);
  assert.ok(rowStride > 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/assetgen/mapcompose.test.ts`
Expected: FAIL, `./mapcompose.ts` not found.

- [ ] **Step 3: Implement `tools/assetgen/mapcompose.ts`**

```ts
// Composite a GBAFE map into an RGBA buffer. A map is a grid of 16x16 map chips.
// Each chip is four 8x8 tiles (a 2x2 arrangement) described by the TSA: four u16
// screen entries per chip, each giving a tile number (bits 0..9), a horizontal flip
// (bit 10), a vertical flip (bit 11), and a palette bank (bits 12..15). Tiles are
// 4bpp (32 bytes per tile, two pixels per byte, low nibble first). The palette is
// RGBA with 16 colors per bank.

export type ComposeInput = {
  widthChips: number;
  heightChips: number;
  layout: Uint16Array;  // widthChips*heightChips chip indices, row major
  tsa: Uint16Array;     // 4 entries per chip: tsa[chip*4 + subtile]
  tiles: Uint8Array;    // 4bpp tile data, 32 bytes per 8x8 tile
  palette: Uint8Array;  // RGBA, 16 colors (64 bytes) per bank
};

export function composeMap(input: ComposeInput): { width: number; height: number; rgba: Uint8Array } {
  const { widthChips, heightChips, layout, tsa, tiles, palette } = input;
  const width = widthChips * 16;
  const height = heightChips * 16;
  const rgba = new Uint8Array(width * height * 4);

  for (let cy = 0; cy < heightChips; cy++) {
    for (let cx = 0; cx < widthChips; cx++) {
      const chip = layout[cy * widthChips + cx];
      for (let sub = 0; sub < 4; sub++) {
        const sx = sub & 1;       // 0 or 1 across
        const sy = (sub >> 1) & 1; // 0 or 1 down
        const entry = tsa[chip * 4 + sub] ?? 0;
        const tileNum = entry & 0x3ff;
        const hflip = (entry >> 10) & 1;
        const vflip = (entry >> 11) & 1;
        const bank = (entry >> 12) & 0xf;
        const tileBase = tileNum * 32;
        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            const srcx = hflip ? 7 - px : px;
            const srcy = vflip ? 7 - py : py;
            const byte = tiles[tileBase + srcy * 4 + (srcx >> 1)] ?? 0;
            const nib = (srcx & 1) ? (byte >> 4) : (byte & 0xf);
            const color = (bank * 16 + nib) * 4;
            const destx = cx * 16 + sx * 8 + px;
            const desty = cy * 16 + sy * 8 + py;
            const d = (desty * width + destx) * 4;
            rgba[d] = palette[color] ?? 0;
            rgba[d + 1] = palette[color + 1] ?? 0;
            rgba[d + 2] = palette[color + 2] ?? 0;
            rgba[d + 3] = palette[color + 3] ?? 255;
          }
        }
      }
    }
  }
  return { width, height, rgba };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/assetgen/mapcompose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/assetgen/mapcompose.ts tools/assetgen/mapcompose.test.ts
git commit -m "feat: GBAFE map compositor (layout + TSA + tiles + palette to RGBA)"
```

---

## Task 4: Blob parsers (objtiles, TSA, palette)

Uses the raw formats documented in Task 1's findings doc. The parsers turn the CLI
blobs into the exact shapes `composeMap` wants. If Task 1 found that a blob needs a
`--import-asset` conversion to reach raw form, the runner (Task 6) performs that
conversion and this module parses the raw result.

**Files:**
- Create: `tools/assetgen/maptiles.ts`
- Test: `tools/assetgen/maptiles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/assetgen/maptiles.test.ts`. The tile and TSA parsers are pass-through
shapes (the raw blobs already match), so the test that carries real logic is the
palette conversion (GBA 15-bit BGR to RGBA):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePalette, parseLayout } from "./maptiles.ts";

test("parsePalette converts 15-bit BGR to RGBA, 5-bit channels scaled to 8-bit", () => {
  // GBA color is 0bBBBBBGGGGGRRRRR. White = 0x7FFF, pure red = 0x001F.
  const blob = new Uint8Array(4);
  new DataView(blob.buffer).setUint16(0, 0x7fff, true); // white
  new DataView(blob.buffer).setUint16(2, 0x001f, true); // red
  const rgba = parsePalette(blob);
  assert.deepEqual([...rgba.subarray(0, 4)], [255, 255, 255, 255]);
  assert.deepEqual([...rgba.subarray(4, 8)], [255, 0, 0, 255]);
});

test("parseLayout reads row-major u16 chip indices for the given size", () => {
  const blob = new Uint8Array(8);
  const dv = new DataView(blob.buffer);
  dv.setUint16(0, 5, true); dv.setUint16(2, 6, true);
  dv.setUint16(4, 7, true); dv.setUint16(6, 8, true);
  const layout = parseLayout(blob, 2, 2);
  assert.deepEqual([...layout], [5, 6, 7, 8]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/assetgen/maptiles.test.ts`
Expected: FAIL, `./maptiles.ts` not found.

- [ ] **Step 3: Implement `tools/assetgen/maptiles.ts`**

The 5-bit to 8-bit scale uses `(v << 3) | (v >> 2)` so 0x1f maps to 255.

```ts
// Parse the raw blobs the CLI produces into the shapes the compositor wants. The
// exact raw forms are documented in docs/superpowers/notes/fe8-map-format.md.

// GBA palette: 2 bytes per color, little-endian, 0bBBBBBGGGGGRRRRR. Returns RGBA
// (4 bytes per color), fully opaque.
export function parsePalette(blob: Uint8Array): Uint8Array {
  const count = Math.floor(blob.length / 2);
  const out = new Uint8Array(count * 4);
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const to8 = (v: number) => (v << 3) | (v >> 2);
  for (let i = 0; i < count; i++) {
    const c = dv.getUint16(i * 2, true);
    out[i * 4] = to8(c & 0x1f);
    out[i * 4 + 1] = to8((c >> 5) & 0x1f);
    out[i * 4 + 2] = to8((c >> 10) & 0x1f);
    out[i * 4 + 3] = 255;
  }
  return out;
}

// Tile layout: row-major u16 map-chip indices, width*height of them.
export function parseLayout(blob: Uint8Array, width: number, height: number): Uint16Array {
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const out = new Uint16Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = dv.getUint16(i * 2, true);
  return out;
}

// TSA: raw u16 screen entries (4 per map chip). The compositor indexes it directly.
export function parseTsa(blob: Uint8Array): Uint16Array {
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const out = new Uint16Array(Math.floor(blob.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = dv.getUint16(i * 2, true);
  return out;
}
```

NOTE for the implementer: if Task 1's findings show the layout blob carries its own
width/height header (common for `.tmap_raw`), adjust `parseLayout` to skip that
header and expose a `readLayoutHeader(blob)` that returns `{width, height, body}`,
and update the test accordingly. Follow the documented format exactly.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/assetgen/maptiles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/assetgen/maptiles.ts tools/assetgen/maptiles.test.ts
git commit -m "feat: map blob parsers (palette, layout, TSA)"
```

---

## Task 5: Chapter record decode

Uses the field offsets documented in Task 1. Fill the constants from the findings
doc. The test uses a synthetic record built with those same offsets.

**Files:**
- Create: `tools/assetgen/mapdata.ts`
- Test: `tools/assetgen/mapdata.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/assetgen/mapdata.test.ts`. Build a synthetic ROM buffer and a record
whose fields sit at the documented offsets, and assert the decode. Replace the
offset literals below with the ones Task 1 documented (keep the test and the module
in sync):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeMapRef } from "./mapdata.ts";

test("decodeMapRef reads geometry and part pointers from a chapter record", () => {
  // Offsets here MUST match the constants in mapdata.ts (from the findings doc).
  const rom = new Uint8Array(0x100);
  // Place a config at ROM 0x08000040 with width/height and part pointers.
  // (Shape per findings doc; this is an illustrative synthetic record.)
  const record = new Uint8Array(148);
  const rdv = new DataView(record.buffer);
  rdv.setUint32(0x00, 0x08000040, true); // pointer to map config (example)
  const cdv = new DataView(rom.buffer);
  cdv.setUint8(0x40, 16);  // width
  cdv.setUint8(0x41, 9);   // height
  cdv.setUint32(0x44, 0x08000080, true); // layoutPtr
  cdv.setUint32(0x48, 0x080000a0, true); // tilesetPtr
  cdv.setUint32(0x4c, 0x080000c0, true); // configPtr
  cdv.setUint32(0x50, 0x080000e0, true); // palettePtr
  const ref = decodeMapRef(record, rom);
  assert.deepEqual(ref, {
    width: 16, height: 9,
    layoutPtr: 0x08000080, tilesetPtr: 0x080000a0,
    configPtr: 0x080000c0, palettePtr: 0x080000e0,
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/assetgen/mapdata.test.ts`
Expected: FAIL, `./mapdata.ts` not found.

- [ ] **Step 3: Implement `tools/assetgen/mapdata.ts`**

Use the offsets from the findings doc as named constants. The illustrative version
below follows the synthetic test above; the implementer sets the real offsets and
pointer hops from Task 1.

```ts
// Decode a chapter's 148-byte map-settings record into geometry and the ROM
// addresses of its parts. Field offsets are documented in
// docs/superpowers/notes/fe8-map-format.md and set as constants here.
const ROM_BASE = 0x08000000;

// Offsets confirmed by the Task 1 spike. CONFIG_PTR is where the record points to
// the map config; the remaining offsets are within that config.
const RECORD_CONFIG_PTR = 0x00;
const CFG_WIDTH = 0x00;
const CFG_HEIGHT = 0x01;
const CFG_LAYOUT_PTR = 0x04;
const CFG_TILESET_PTR = 0x08;
const CFG_TSA_PTR = 0x0c;
const CFG_PALETTE_PTR = 0x10;

export type MapRef = {
  width: number; height: number;
  layoutPtr: number; tilesetPtr: number; configPtr: number; palettePtr: number;
};

export function decodeMapRef(record: Uint8Array, rom: Uint8Array): MapRef {
  const rdv = new DataView(record.buffer, record.byteOffset, record.byteLength);
  const cfgPtr = rdv.getUint32(RECORD_CONFIG_PTR, true);
  const c = cfgPtr - ROM_BASE;
  const cdv = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
  return {
    width: cdv.getUint8(c + CFG_WIDTH),
    height: cdv.getUint8(c + CFG_HEIGHT),
    layoutPtr: cdv.getUint32(c + CFG_LAYOUT_PTR, true),
    tilesetPtr: cdv.getUint32(c + CFG_TILESET_PTR, true),
    configPtr: cdv.getUint32(c + CFG_TSA_PTR, true),
    palettePtr: cdv.getUint32(c + CFG_PALETTE_PTR, true),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/assetgen/mapdata.test.ts`
Expected: PASS. Adjust the offsets in both files until they match the findings doc
and the test reflects a record shaped like the real one.

- [ ] **Step 5: Commit**

```bash
git add tools/assetgen/mapdata.ts tools/assetgen/mapdata.test.ts
git commit -m "feat: FE8 chapter record decode to map geometry and part pointers"
```

---

## Task 6: Generation runner and launcher, render real maps

Drives the CLI per chapter, composites, encodes, writes PNGs and `maps.json`. This
is the integration checkpoint: real chapters must render correctly.

**Files:**
- Create: `tools/assetgen/mapgen.ts`
- Create: `Generate Maps.cmd`

- [ ] **Step 1: Implement `tools/assetgen/mapgen.ts`**

Mirror the structure of `import.ts` (spawn the CLI, write under `gameDir`). Pseudocode
made concrete; the implementer wires the exact CLI arg lists and any `--import-asset`
raw conversion the findings doc requires.

```ts
// Generate tile-accurate chapter map PNGs plus a maps.json index, for each game
// whose ROM is present (FE8 first). Resumable: skip a chapter whose PNG exists.
// Run: node tools/assetgen/mapgen.ts
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, type Game, cliPath, romPath, gameDir, presentGames } from "./paths.ts";
import { decodeMapRef } from "./mapdata.ts";
import { parsePalette, parseLayout, parseTsa } from "./maptiles.ts";
import { composeMap } from "./mapcompose.ts";
import { encodePng } from "./pngencode.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

function run(cli: string, args: string[]): void {
  const r = spawnSync(cli, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`CLI exited ${r.status}: ${(r.stderr || r.stdout || "").trim()}`);
}

// Export all chapter records as a parsed list: [{ index, name, record: Uint8Array }].
// The runner calls --export-map-settings, then reads each chapter's record bytes
// from the ROM at the Address column (the findings doc confirms the record layout).
async function chapterRecords(cli: string, rom: string, romBuf: Uint8Array): Promise<{ index: number; name: string; record: Uint8Array }[]> {
  const tsv = join(ROOT, ".raw-mapsettings.tsv");
  run(cli, [`--export-map-settings`, `--rom=${rom}`, `--out=${tsv}`]);
  const lines = (await readFile(tsv, "utf8")).split(/\r?\n/).filter(Boolean);
  const rows = lines.slice(1); // drop header
  const out: { index: number; name: string; record: Uint8Array }[] = [];
  for (const line of rows) {
    const cols = line.split("\t");
    const index = parseInt(cols[0], 16);
    const name = cols[1];
    const addr = parseInt(cols[2], 16) - 0x08000000;
    if (!Number.isFinite(addr) || addr < 0) continue;
    out.push({ index, name, record: romBuf.subarray(addr, addr + 148) });
  }
  return out;
}

async function genGame(game: Game): Promise<void> {
  const cli = cliPath(ROOT);
  const rom = romPath(ROOT, game);
  const romBuf = await readFile(rom);
  const mapsDir = join(gameDir(ROOT, game), "maps");
  await mkdir(mapsDir, { recursive: true });
  const index: { index: number; name: string; width: number; height: number; file: string }[] = [];
  let made = 0, skipped = 0, failed = 0;

  for (const ch of await chapterRecords(cli, rom, romBuf)) {
    const pngPath = join(mapsDir, `${ch.index}.png`);
    const file = `maps/${ch.index}.png`;
    try {
      const ref = decodeMapRef(ch.record, romBuf);
      index.push({ index: ch.index, name: ch.name, width: ref.width * 16, height: ref.height * 16, file });
      if (existsSync(pngPath)) { skipped++; continue; }
      // Extract parts to temp files, then parse. Use the exact CLI kinds/conversions
      // from the findings doc (objtiles/mapchipconfig are raw; layout may need an
      // --import-asset pass to reach raw u16 indices).
      const tmp = join(ROOT, `.raw-map-${game}-${ch.index}`);
      run(cli, [`--export-asset`, `--kind=objtiles`, `--rom=${rom}`, `--addr=0x${ref.tilesetPtr.toString(16)}`, `--out=${tmp}.objtiles`]);
      run(cli, [`--export-asset`, `--kind=mapchipconfig`, `--rom=${rom}`, `--addr=0x${ref.configPtr.toString(16)}`, `--out=${tmp}.cfg`]);
      run(cli, [`--export-asset`, `--kind=map`, `--rom=${rom}`, `--addr=0x${ref.layoutPtr.toString(16)}`, `--out=${tmp}.mar`]);
      run(cli, [`--export-palette`, `--rom=${rom}`, `--addr=0x${ref.palettePtr.toString(16)}`, `--out=${tmp}.pal`]);
      const tiles = await readFile(`${tmp}.objtiles`);
      const tsa = parseTsa(await readFile(`${tmp}.cfg`));
      const layout = parseLayout(await readFile(`${tmp}.mar`), ref.width, ref.height);
      const palette = parsePalette(await readFile(`${tmp}.pal`));
      const img = composeMap({ widthChips: ref.width, heightChips: ref.height, layout, tsa, tiles, palette });
      await writeFile(pngPath, encodePng(img.rgba, img.width, img.height));
      made++;
      console.log(`  ${game}: ${ch.index} ${ch.name} rendered ${img.width}x${img.height}`);
    } catch (e) {
      failed++;
      console.log(`  ${game}: ${ch.index} ${ch.name} FAILED: ${(e as Error).message}`);
    }
  }
  await writeFile(join(gameDir(ROOT, game), "maps.json"), JSON.stringify(index, null, 2) + "\n", "utf8");
  console.log(`  ${game}: done. ${made} made, ${skipped} cached, ${failed} failed, ${index.length} chapters indexed.`);
}

async function main(): Promise<void> {
  if (!existsSync(cliPath(ROOT))) throw new Error(`FEBuilderGBA.CLI not found. See the README asset gallery section.`);
  const games = presentGames(ROOT).filter((g) => existsSync(join(gameDir(ROOT, g), "classes.json")));
  if (games.length === 0) throw new Error(`No imported game found. Run Import Assets.cmd first (one of: ${GAMES.join(", ")}).`);
  // FE8 first; FE7 chapter struct differs and is a later track, so only do games we
  // have decode offsets for. For now restrict to fe8.
  for (const game of games.filter((g) => g === "fe8")) await genGame(game);
  console.log("All done. Open the gallery Maps tab.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 2: Create `Generate Maps.cmd`**

```bat
@echo off
rem Double-click to render FE8 chapter maps into the gallery cache.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings tools\assetgen\mapgen.ts
echo.
pause
```

- [ ] **Step 3: Run it and verify a real chapter**

Run: `node --no-warnings tools/assetgen/mapgen.ts`
Expected: PNGs written under `assets/reference/fe8/maps/`, `maps.json` created, a
made/failed summary with most chapters made and few or zero failed.

Then open `assets/reference/fe8/maps/1.png` (Chapter 1) and compare to a reference
screenshot of that chapter. The tiles, colors, and proportions must match. If the
image is garbled, the format decode is wrong: return to the findings doc and the
parsers before proceeding. This is the integration gate.

- [ ] **Step 4: Commit**

```bash
git add tools/assetgen/mapgen.ts "Generate Maps.cmd"
git commit -m "feat: chapter map generation runner and launcher"
```

---

## Task 7: Gallery Maps tab

**Files:**
- Modify: `gallery/index.html`
- Modify: `gallery/client.ts`

- [ ] **Step 1: Add the Maps tab button and tab type**

In `gallery/index.html`, add a button to the `#tabs` span after the Animations one:

```html
      <button data-tab="maps">Maps</button>
```

In `gallery/client.ts`, widen the tab type:

```ts
let tab: "units" | "classes" | "items" | "anims" | "maps" = "units";
```

- [ ] **Step 2: Route the Maps tab in `render`**

In `render`, add an early dispatch next to the anims one:

```ts
  if (tab === "maps") return renderMaps();
```

- [ ] **Step 3: Add `renderMaps`**

Add to `gallery/client.ts` (reuses `game`, `view`, `search`, `esc`). It fetches
`maps.json` through the static route, filters by name, and shows each chapter with
its image and a zoom control like the Animations tab.

```ts
type MapRow = { index: number; name: string; width: number; height: number; file: string };
let mapScale = 1;

async function renderMaps(): Promise<void> {
  let maps: MapRow[] = [];
  try { maps = await fetch(`/assets/reference/${game}/maps.json`).then((r) => r.json()); }
  catch { maps = []; }
  const q = search.value.trim().toLowerCase();
  const shown = q ? maps.filter((m) => m.name.toLowerCase().includes(q)) : maps;
  if (maps.length === 0) {
    view.innerHTML = `<p class="note">No maps imported for ${esc(game.toUpperCase())}. Run Generate Maps.cmd.</p>`;
    return;
  }
  view.innerHTML = `
    <div class="anim">
      <label>Zoom <input id="mzoom" type="range" min="1" max="4" step="0.5" value="${mapScale}"></label>
      <span id="mzoomval" class="note">${mapScale}x</span>
    </div>
    <div class="grid" id="mapgrid" style="--anim-scale:${mapScale}">${shown.map((m) =>
      `<div class="card">
        <div><strong>${esc(m.name)}</strong> <span class="note">#${m.index} ${m.width}x${m.height}</span></div>
        <img class="map-img" src="/assets/reference/${game}/${esc(m.file)}" alt="" loading="lazy">
      </div>`).join("")}</div>`;
  (document.getElementById("mzoom") as HTMLInputElement).addEventListener("input", (e) => {
    mapScale = Number((e.target as HTMLInputElement).value);
    (document.getElementById("mapgrid") as HTMLElement).style.setProperty("--anim-scale", String(mapScale));
    document.getElementById("mzoomval")!.textContent = `${mapScale}x`;
  });
}
```

Add a style in `gallery/index.html` after the `.anim-sec` rule:

```css
    .map-img { image-rendering: pixelated; max-width: calc(240px * var(--anim-scale, 1)); height: auto; display: block; margin-top: 4px; background: #0001; }
```

- [ ] **Step 4: Verify in the browser**

Run: `node --no-warnings gallery/server.ts`
Open the Maps tab on FE8. Confirm the chapter maps render correctly, the list is
searchable by chapter name, and Zoom enlarges the images. Stop the server.

- [ ] **Step 5: Run the full suite and commit**

Run: `node --test`
Expected: PASS, the full suite including the new pngencode, mapcompose, maptiles, and
mapdata tests and all prior tests.

```bash
git add gallery/client.ts gallery/index.html
git commit -m "feat: gallery Maps tab for chapter map images"
```

- [ ] **Step 6: README note**

Add to the gallery section of `README.md`:

```markdown
- Double-click **Generate Maps.cmd** to render FE8 chapter maps into the gallery,
  then see them under the Maps tab. Images are cached under `assets/reference/` and
  are gitignored.
```

```bash
git add README.md
git commit -m "docs: document the Generate Maps launcher and Maps tab"
```

---

## Self-review notes (for the implementer)

- Task 1 is a true gate. Do not build Tasks 4 to 7 against guessed offsets or
  formats. If the spike cannot resolve the record or the blob formats, STOP and
  report, per the spec's risk section.
- Tasks 2 and 3 (PNG encoder, compositor) are format independent and fully specified;
  they can proceed in parallel with the spike if desired.
- `mapdata.ts` (Task 5) and `maptiles.ts` (Task 4) carry illustrative offsets and
  format assumptions. The implementer MUST replace them with the findings-doc values
  and keep each test in sync with its module.
- `maps.json` writes pixel width and height (chips times 16), matching the PNG.
- FE7 is intentionally excluded in `mapgen.ts` (its chapter struct differs); it is a
  later track.
- The compositor assumes the standard GBA screen-entry bit layout (tile 0..9, hflip
  10, vflip 11, bank 12..15). Task 1 confirms this for FE8 map TSA; if it differs,
  update `composeMap` and its test together.
