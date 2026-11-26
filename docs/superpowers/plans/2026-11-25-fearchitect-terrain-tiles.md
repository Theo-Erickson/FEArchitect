# Terrain Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw custom maps in the scenario and 1v1 viewers with real FE8 terrain chips from the user's fan tileset sheets, chosen by neighbour context learned from the real FE8 chapters, and give FE8 chapter encounters in the scenario viewer their chapter PNG backdrop.

**Architecture:** A one-time Node tool (`tools/assetgen/tilesets.ts`) copies the `FE 8/*.png` sheets out of the zip and mines the ROM's chapter layouts into a per-sheet context index, all under gitignored `assets/tilesets/fe8/`. A pure picker (`src/grid/tiles.ts`) turns a map plus a sheet index into chip positions; a thin browser module (`src/game/tilebackdrop.ts`) composes those chips onto a canvas and hands the viewers one backdrop image. Anything missing degrades to today's SVG terrain.

**Tech Stack:** TypeScript run directly by Node 24 (type stripping, no build), `node:test` + `node:assert/strict`, `node:zlib`, FEBuilderGBA.CLI (already used by `mapgen.ts`), browser canvas, the dev server at `src/server.ts` (port 5173).

**Spec:** `docs/superpowers/specs/2026-11-25-fearchitect-terrain-tiles-design.md`

**Ground rules for the implementer**

- Work in the worktree `C:\Users\theos\ApplicationFiles\GitHub\repos\FEArchitect-terrain-tiles` on branch `feat/terrain-tiles`. Do not switch branches.
- Run the suite with `node --no-warnings --test` from the worktree root. A single file: `node --no-warnings --test path/to/file.test.ts`.
- Never add `Co-Authored-By` or any AI attribution line to commits.
- Do not edit `unitToken()` or other unit-token code in `src/game/scenario.ts` (a parallel branch, `feat/map-sprites`, owns it).
- The fan zip is untrusted: only PNG entries under `FE 8/` are ever written, and nothing from it is executed.
- `assets/` content other than `assets/tilesets/CREDITS.md` must never be committed.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `tools/assetgen/zipread.ts` | create | Pure zip reader: list entries, inflate one on demand |
| `tools/assetgen/zipread.test.ts` | create | Tests with an in-memory zip |
| `tools/assetgen/pngdecode.ts` | create | Pure PNG decoder (8-bit RGBA/RGB/palette, non-interlaced) |
| `tools/assetgen/pngdecode.test.ts` | create | Round-trips `pngencode.ts` output |
| `tools/assetgen/tilesetfiles.ts` | create | Paths and sheet-name slugging shared by the tool |
| `tools/assetgen/tilesetfiles.test.ts` | create | Slug and unsafe-name tests |
| `tools/assetgen/tilesetmine.ts` | create | Pure: chip keys, chapter-to-sheet match score, context mining, serialising |
| `tools/assetgen/tilesetmine.test.ts` | create | Synthetic sheet/chapter tests |
| `tools/assetgen/tilesets.ts` | create | CLI: import sheets from the zip, then build the index from the ROM |
| `src/grid/types.ts` | modify | `TerrainDef.fe8?`, `ResolvedMap.tileset?` |
| `src/grid/resolve.ts` | modify | Validate `fe8`, pass `tileset` through |
| `src/grid/resolve.test.ts` | modify | Tests for both |
| `data/terrain.json` | modify | `fe8` candidate ids per custom terrain |
| `src/grid/render.ts` | modify | Export `vary`; add `terrainLayer()` |
| `src/grid/render.test.ts` | modify | `terrainLayer` tests |
| `src/grid/tiles.ts` | create | Pure chip picker and chip source coordinates |
| `src/grid/tiles.test.ts` | create | Picker tests |
| `src/game/tilebackdrop.ts` | create | Browser: load index/sheet, compose canvas backdrop, caches |
| `src/game/scenario.ts` | modify | Chapter PNG backdrop, tile backdrop, Tileset dropdown (terrain code only) |
| `src/game/scenario.html` | modify | Tileset dropdown markup |
| `src/game/client.ts` | modify | Tile backdrop for custom maps |
| `src/server.ts` | modify | Serve `assets/tilesets/` |
| `src/server.test.ts` | modify | Test the new root |
| `.gitignore` | modify | Ignore `assets/tilesets/**` except CREDITS.md |
| `assets/tilesets/CREDITS.md` | create | Credits and restore steps (tracked) |
| `hub/catalog.ts` | modify | "Build Tilesets" entry |
| `launchers/Build Tilesets.cmd` | create | Double-click launcher |
| `README.md` | modify | "Terrain tiles" note |

---

### Task 1: Zip reader

**Files:**
- Create: `tools/assetgen/zipread.ts`
- Test: `tools/assetgen/zipread.test.ts`

- [ ] **Step 1: Write the failing test**

`tools/assetgen/zipread.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { readZip } from "./zipread.ts";

// Build a minimal zip in memory. CRCs are left 0: the reader does not check them.
function makeZip(files: { name: string; data: Uint8Array; method: 0 | 8 | 99; flags?: number }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const body = f.method === 8 ? new Uint8Array(deflateRawSync(f.data)) : f.data;
    const lh = new Uint8Array(30 + name.length), lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(6, f.flags ?? 0, true); lv.setUint16(8, f.method, true);
    lv.setUint32(18, body.length, true); lv.setUint32(22, f.data.length, true); lv.setUint16(26, name.length, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(8, f.flags ?? 0, true); cv.setUint16(10, f.method, true);
    cv.setUint32(20, body.length, true); cv.setUint32(24, f.data.length, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true); ch.set(name, 46);
    locals.push(lh, body); centrals.push(ch);
    offset += lh.length + body.length;
  }
  const cdSize = centrals.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, eocd];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let p = 0; for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

test("readZip lists entries and reads stored and deflated data", () => {
  const a = new TextEncoder().encode("hello stored");
  const b = new TextEncoder().encode("hello deflated ".repeat(20));
  const zip = makeZip([
    { name: "FE 8/", data: new Uint8Array(0), method: 0 },
    { name: "FE 8/a.png", data: a, method: 0 },
    { name: "FE 8/b.png", data: b, method: 8 },
  ]);
  const entries = readZip(zip);
  assert.deepEqual(entries.map((e) => e.name), ["FE 8/a.png", "FE 8/b.png"]); // directories skipped
  assert.deepEqual(entries[0].read(), a);
  assert.deepEqual(entries[1].read(), b);
});

test("readZip only inflates an entry when read() is called", () => {
  const zip = makeZip([{ name: "x.bin", data: new Uint8Array([1, 2, 3]), method: 99 }]);
  const [e] = readZip(zip); // listing an unsupported method is fine
  assert.throws(() => e.read(), /unsupported compression method 99/);
});

test("readZip rejects encrypted entries on read and non-zip input", () => {
  const zip = makeZip([{ name: "s.png", data: new Uint8Array([1]), method: 0, flags: 1 }]);
  assert.throws(() => readZip(zip)[0].read(), /encrypted/);
  assert.throws(() => readZip(new Uint8Array(40)), /not a zip/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --no-warnings --test tools/assetgen/zipread.test.ts`
Expected: FAIL, cannot find module `./zipread.ts`.

- [ ] **Step 3: Write the implementation**

`tools/assetgen/zipread.ts`:

```ts
// Minimal zip reader: walks the central directory and inflates one entry on demand.
// Supports stored (0) and deflate (8). Pure apart from node:zlib; no filesystem access,
// so callers decide what (if anything) gets written. Used to pull tileset PNGs out of
// an untrusted archive without extracting anything else.
import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  method: number;
  read(): Uint8Array;
}

const EOCD_SIG = 0x06054b50, CEN_SIG = 0x02014b50, LOC_SIG = 0x04034b50;

export function readZip(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip file (no end of central directory record)");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== CEN_SIG) throw new Error("corrupt zip central directory");
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue; // directory
    out.push({
      name, method,
      read(): Uint8Array {
        if (flags & 1) throw new Error(`encrypted zip entry not supported: ${name}`);
        if (dv.getUint32(local, true) !== LOC_SIG) throw new Error(`corrupt local header: ${name}`);
        const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        const raw = buf.subarray(start, start + csize);
        if (method === 0) return raw.slice();
        if (method === 8) return new Uint8Array(inflateRawSync(raw));
        throw new Error(`unsupported compression method ${method}: ${name}`);
      },
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --no-warnings --test tools/assetgen/zipread.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/assetgen/zipread.ts tools/assetgen/zipread.test.ts
git commit -m "feat: minimal zip reader for tileset import"
```

---

### Task 2: PNG decoder

**Files:**
- Create: `tools/assetgen/pngdecode.ts`
- Test: `tools/assetgen/pngdecode.test.ts`

- [ ] **Step 1: Write the failing test**

`tools/assetgen/pngdecode.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { encodePng } from "./pngencode.ts";
import { decodePng } from "./pngdecode.ts";

test("decodePng round-trips an RGBA image from encodePng", () => {
  const w = 5, h = 3, rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37) & 255;
  const img = decodePng(encodePng(rgba, w, h));
  assert.equal(img.width, w);
  assert.equal(img.height, h);
  assert.deepEqual(img.rgba, rgba);
});

// Hand-built 2x2 RGB PNG whose rows use the Sub (1) and Paeth (4) filters.
function rgbPng(): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8); dv.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length))); return out;
  };
  const ihdr = new Uint8Array(13), iv = new DataView(ihdr.buffer);
  iv.setUint32(0, 2); iv.setUint32(4, 2); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  // Row 0 Sub: pixels (10,20,30) (15,25,35) -> second stored as deltas 5,5,5.
  // Row 1 Paeth: pixels equal to row 0 -> predictor picks the pixel above, deltas 0.
  const raw = Uint8Array.from([1, 10, 20, 30, 5, 5, 5, 4, 0, 0, 0, 0, 0, 0]);
  const sig = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(deflateSync(raw))), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

test("decodePng handles RGB with Sub and Paeth filters", () => {
  const img = decodePng(rgbPng());
  assert.deepEqual([...img.rgba], [10, 20, 30, 255, 15, 25, 35, 255, 10, 20, 30, 255, 15, 25, 35, 255]);
});

test("decodePng rejects non-PNG input", () => {
  assert.throws(() => decodePng(new Uint8Array(16)), /not a PNG/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --no-warnings --test tools/assetgen/pngdecode.test.ts`
Expected: FAIL, cannot find module `./pngdecode.ts`.

- [ ] **Step 3: Write the implementation**

`tools/assetgen/pngdecode.ts`:

```ts
// Minimal PNG decoder for the tileset tool: 8-bit RGBA, RGB or palette images, no
// interlace, all five scanline filters. Returns RGBA. No dependencies.
import { inflateSync } from "node:zlib";

export interface RgbaImage { width: number; height: number; rgba: Uint8Array }

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function decodePng(buf: Uint8Array): RgbaImage {
  if (buf.length < 8 || SIG.some((b, i) => buf[i] !== b)) throw new Error("not a PNG file");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 8, width = 0, height = 0, colorType = -1;
  const idat: Uint8Array[] = [];
  let plte: Uint8Array | null = null, trns: Uint8Array | null = null;
  while (p + 8 <= buf.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      width = dv.getUint32(p + 8); height = dv.getUint32(p + 12);
      if (data[8] !== 8) throw new Error(`unsupported PNG bit depth ${data[8]}`);
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNG not supported");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : 0;
  if (!bpp) throw new Error(`unsupported PNG color type ${colorType}`);
  if (colorType === 3 && !plte) throw new Error("palette PNG without PLTE");
  const joined = new Uint8Array(idat.reduce((a, d) => a + d.length, 0));
  { let o = 0; for (const d of idat) { joined.set(d, o); o += d.length; } }
  const raw = inflateSync(joined);
  const stride = width * bpp, rgba = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (bpp === 4) rgba.set(cur.subarray(x * 4, x * 4 + 4), o);
      else if (bpp === 3) { rgba.set(cur.subarray(x * 3, x * 3 + 3), o); rgba[o + 3] = 255; }
      else {
        const k = cur[x];
        rgba[o] = plte![k * 3]; rgba[o + 1] = plte![k * 3 + 1]; rgba[o + 2] = plte![k * 3 + 2];
        rgba[o + 3] = trns && k < trns.length ? trns[k] : 255;
      }
    }
    prev = cur;
  }
  return { width, height, rgba };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --no-warnings --test tools/assetgen/pngdecode.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/assetgen/pngdecode.ts tools/assetgen/pngdecode.test.ts
git commit -m "feat: minimal PNG decoder for the tileset tool"
```

---

### Task 3: Sheet names and paths

**Files:**
- Create: `tools/assetgen/tilesetfiles.ts`
- Test: `tools/assetgen/tilesetfiles.test.ts`

- [ ] **Step 1: Write the failing test**

`tools/assetgen/tilesetfiles.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sheetFileName, dataFileFor } from "./tilesetfiles.ts";

test("sheetFileName slugs FE 8 sheet entries", () => {
  assert.deepEqual(sheetFileName("FE 8/Castle Blue.png"), { name: "Castle Blue", file: "castle-blue.png" });
  assert.deepEqual(sheetFileName("FE 8/Overworld Regular.png"), { name: "Overworld Regular", file: "overworld-regular.png" });
  assert.deepEqual(sheetFileName("FE 8/PLAINS.PNG"), { name: "PLAINS", file: "plains.png" });
});

test("sheetFileName skips other folders, non-PNGs and unsafe names", () => {
  assert.equal(sheetFileName("FE 7/Fort.png"), null);
  assert.equal(sheetFileName("FE 8/Thumbs.db"), null);
  assert.equal(sheetFileName("FE-Mappy Converter/Game.exe"), null);
  assert.equal(sheetFileName("FE 8/sub/Fort.png"), null);
  assert.equal(sheetFileName("FE 8/..png"), null);
  assert.equal(sheetFileName("FE 8/!!!.png"), null);
  assert.equal(sheetFileName("FE 8\\Fort.png"), null);
});

test("dataFileFor swaps the extension", () => {
  assert.equal(dataFileFor("castle-blue.png"), "castle-blue.json");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --no-warnings --test tools/assetgen/tilesetfiles.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the implementation**

`tools/assetgen/tilesetfiles.ts`:

```ts
// Where the FE8 terrain tileset sheets live and how zip entries map to local files.
// The sheets are fan-ripped art: gitignored, never committed (see CREDITS.md there).

export const TILESET_DIR = "assets/tilesets/fe8"; // repo-relative
export const DEFAULT_ZIP = "Feaws Tileset Collection.zip"; // looked for at the repo root

// "FE 8/Castle Blue.png" -> { name: "Castle Blue", file: "castle-blue.png" }. Anything
// outside the FE 8 folder, nested deeper, not a .png, or that slugs to nothing -> null.
export function sheetFileName(entry: string): { name: string; file: string } | null {
  const m = /^FE 8\/([^/\\]+)\.png$/i.exec(entry);
  if (!m) return null;
  const name = m[1];
  if (name.includes("..")) return null;
  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
  if (!slug) return null;
  return { name, file: `${slug}.png` };
}

export function dataFileFor(file: string): string {
  return file.replace(/\.png$/i, ".json");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --no-warnings --test tools/assetgen/tilesetfiles.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/assetgen/tilesetfiles.ts tools/assetgen/tilesetfiles.test.ts
git commit -m "feat: tileset sheet naming and paths"
```

---

### Task 4: Mining (pure)

Background for the implementer: a sheet is 512x512 = 32x32 chips of 16x16 px. Sheet position `p` (row-major) holds ROM chip `p + 1`. A chapter's layout (from `parseLayout` in `maptiles.ts`) gives each cell a config offset; its chip index is `offset >> 2`, and its terrain id is the tile-config lookup byte for that chip (`terrainGrid` in `terraingrid.ts`).

**Files:**
- Create: `tools/assetgen/tilesetmine.ts`
- Test: `tools/assetgen/tilesetmine.test.ts`

- [ ] **Step 1: Write the failing test**

`tools/assetgen/tilesetmine.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sheetKeys, chipKeyAt, matchScore, newAcc, mineChapter, serialiseSheet, contextKey } from "./tilesetmine.ts";
import type { RgbaImage } from "./pngdecode.ts";

// A 512x512 sheet where chip position p is filled with a colour derived from p.
function sheet(): RgbaImage {
  const w = 512, rgba = new Uint8Array(w * w * 4);
  for (let p = 0; p < 1024; p++) {
    const sx = (p % 32) * 16, sy = Math.floor(p / 32) * 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const o = ((sy + y) * w + sx + x) * 4;
      rgba[o] = (p * 8) & 255; rgba[o + 1] = (p >> 5) * 8; rgba[o + 2] = 40; rgba[o + 3] = 255;
    }
  }
  return { width: w, height: w, rgba };
}

// A chapter image built from the sheet using ROM chips (position = chip - 1).
function chapterFrom(s: RgbaImage, chips: number[][]): RgbaImage {
  const h = chips.length, w = chips[0].length, out = new Uint8Array(w * 16 * h * 16 * 4);
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    const p = chips[cy][cx] - 1, sx = (p % 32) * 16, sy = Math.floor(p / 32) * 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const a = ((sy + y) * 512 + sx + x) * 4, b = ((cy * 16 + y) * w * 16 + cx * 16 + x) * 4;
      out.set(s.rgba.subarray(a, a + 4), b);
    }
  }
  return { width: w * 16, height: h * 16, rgba: out };
}

test("chip keys ignore the low 3 bits of each channel", () => {
  const a: RgbaImage = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4).fill(200) };
  const b: RgbaImage = { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4).fill(203) };
  assert.equal(chipKeyAt(a, 0, 0), chipKeyAt(b, 0, 0));
});

test("matchScore is the share of cells equal to sheet position chip - 1", () => {
  const s = sheet(), keys = sheetKeys(s);
  assert.equal(keys.length, 1024);
  const chips = [[1, 2], [3, 40]];
  const img = chapterFrom(s, chips);
  assert.equal(matchScore(keys, img, chips), 1);
  assert.equal(matchScore(keys, img, [[1, 2], [3, 41]]), 0.75); // one cell claims the wrong chip
  assert.equal(matchScore(keys, img, [[0, 2], [3, 40]]), 0.75); // chip 0 never matches
});

test("contextKey uses -1 off-map", () => {
  const t = [[1, 12], [16, 1]];
  assert.equal(contextKey(t, 0, 0), "1,-1,12,16,-1");
  assert.equal(contextKey(t, 1, 1), "1,12,-1,-1,16");
});

test("mineChapter counts contexts and frequencies by sheet position, skipping chip 0", () => {
  const acc = newAcc();
  const chips = [[5, 6], [0, 5]];
  const terrain = [[1, 12], [1, 1]];
  mineChapter(acc, chips, terrain, 7);
  mineChapter(acc, chips, terrain, 8);
  const out = serialiseSheet(acc);
  assert.deepEqual(acc.chapters, [7, 8]);
  assert.deepEqual([...acc.terrains].sort((a, b) => a - b), [1, 12]);
  assert.deepEqual(out.contexts["1,-1,12,1,-1"], [[4, 2]]); // cell (0,0): chip 5 -> position 4
  assert.deepEqual(out.contexts["12,-1,-1,1,1"], [[5, 2]]);
  assert.equal(out.contexts["1,1,1,-1,-1"], undefined);    // cell (0,1) has chip 0: skipped
  assert.deepEqual(out.freq["1"], [[4, 4]]);
  assert.deepEqual(out.freq["12"], [[5, 2]]);
});

test("serialiseSheet sorts each list by count, then position", () => {
  const acc = newAcc();
  mineChapter(acc, [[3], [2], [2]], [[1], [1], [1]], 1);
  assert.deepEqual(serialiseSheet(acc).freq["1"], [[1, 2], [2, 1]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --no-warnings --test tools/assetgen/tilesetmine.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the implementation**

`tools/assetgen/tilesetmine.ts`:

```ts
// Pure mining for the terrain tileset index. A fan sheet holds ROM chip p + 1 at
// row-major position p (32 per row, 16x16 px each). Chapters are matched to a sheet by
// pixel comparison, then each cell's chip is counted under its terrain context so the
// viewer can pick the chip FE8 itself used next to the same neighbours.
import type { RgbaImage } from "./pngdecode.ts";

export const CHIP = 16, SHEET_COLS = 32, SHEET_CHIPS = 1024;

// A 16x16 block as a string key, comparing colours at 5 bits per channel (the GBA's
// depth), so 8-bit expansion differences between rippers do not matter.
export function chipKeyAt(img: RgbaImage, px: number, py: number): string {
  const codes: number[] = [];
  for (let y = 0; y < CHIP; y++) for (let x = 0; x < CHIP; x++) {
    const o = ((py + y) * img.width + px + x) * 4;
    codes.push(((img.rgba[o] >> 3) << 10) | ((img.rgba[o + 1] >> 3) << 5) | (img.rgba[o + 2] >> 3));
  }
  return String.fromCharCode(...codes);
}

export function sheetKeys(sheet: RgbaImage): string[] {
  const keys: string[] = [];
  for (let p = 0; p < SHEET_CHIPS; p++) keys.push(chipKeyAt(sheet, (p % SHEET_COLS) * CHIP, Math.floor(p / SHEET_COLS) * CHIP));
  return keys;
}

// Share of chapter cells whose pixels equal the sheet chip at position chip - 1.
export function matchScore(keys: string[], chapter: RgbaImage, chips: number[][]): number {
  let hit = 0, n = 0;
  for (let y = 0; y < chips.length; y++) for (let x = 0; x < chips[y].length; x++) {
    n++;
    const p = chips[y][x] - 1;
    if (p >= 0 && p < keys.length && keys[p] === chipKeyAt(chapter, x * CHIP, y * CHIP)) hit++;
  }
  return n ? hit / n : 0;
}

// "t,n,e,s,w": the cell's terrain and its four neighbours', -1 off-map.
export function contextKey(terrain: number[][], x: number, y: number): string {
  const at = (xx: number, yy: number) => (yy < 0 || yy >= terrain.length || xx < 0 || xx >= terrain[yy].length ? -1 : terrain[yy][xx]);
  return [at(x, y), at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)].join(",");
}

export interface SheetAcc {
  contexts: Map<string, Map<number, number>>;
  freq: Map<number, Map<number, number>>;
  chapters: number[];
  terrains: Set<number>;
}

export function newAcc(): SheetAcc {
  return { contexts: new Map(), freq: new Map(), chapters: [], terrains: new Set() };
}

function bump<K>(m: Map<K, Map<number, number>>, k: K, p: number): void {
  let inner = m.get(k);
  if (!inner) { inner = new Map(); m.set(k, inner); }
  inner.set(p, (inner.get(p) ?? 0) + 1);
}

// chips[y][x] = ROM chip index, terrain[y][x] = FE8 terrain id, for one chapter.
export function mineChapter(acc: SheetAcc, chips: number[][], terrain: number[][], chapter: number): void {
  acc.chapters.push(chapter);
  for (let y = 0; y < chips.length; y++) for (let x = 0; x < chips[y].length; x++) {
    const p = chips[y][x] - 1;
    if (p < 0) continue; // ROM chip 0 is not on the sheet
    const t = terrain[y][x];
    acc.terrains.add(t);
    bump(acc.contexts, contextKey(terrain, x, y), p);
    bump(acc.freq, t, p);
  }
}

export type ChipCounts = [number, number][]; // [sheet position, count], count descending

export interface SheetData {
  contexts: Record<string, ChipCounts>;
  freq: Record<string, ChipCounts>;
}

function sorted(m: Map<number, number>): ChipCounts {
  return [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

export function serialiseSheet(acc: SheetAcc): SheetData {
  const contexts: Record<string, ChipCounts> = {};
  for (const k of [...acc.contexts.keys()].sort()) contexts[k] = sorted(acc.contexts.get(k)!);
  const freq: Record<string, ChipCounts> = {};
  for (const t of [...acc.freq.keys()].sort((a, b) => a - b)) freq[String(t)] = sorted(acc.freq.get(t)!);
  return { contexts, freq };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --no-warnings --test tools/assetgen/tilesetmine.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/assetgen/tilesetmine.ts tools/assetgen/tilesetmine.test.ts
git commit -m "feat: pure tileset mining (sheet match, terrain contexts)"
```

---

### Task 5: Tileset tool (import + index), gitignore, credits

**Files:**
- Create: `tools/assetgen/tilesets.ts`
- Create: `assets/tilesets/CREDITS.md`
- Modify: `.gitignore`

This task is I/O glue over Tasks 1-4 and the existing `mapdata.ts`/`maptiles.ts`/`terraingrid.ts`; it is verified by running it, not by unit tests.

- [ ] **Step 1: Gitignore the sheets, keep the credits**

Append to `.gitignore`:

```gitignore
# FE8 terrain tileset sheets (fan-ripped art, see assets/tilesets/CREDITS.md) and the
# ROM-derived chip index: local only
assets/tilesets/**
!assets/tilesets/CREDITS.md
```

Note: `assets/tilesets/**` (not `assets/tilesets/`) is required so the `!` re-include works.

- [ ] **Step 2: Write `assets/tilesets/CREDITS.md`**

```markdown
# Terrain tileset credits

The FE8 (Fire Emblem: The Sacred Stones) terrain chip sheets used by the map viewers
come from **Feaw's Tileset Collection** (folder `FE 8/`), a community rip shared on
FEUniverse. Fire Emblem art is the property of Nintendo / Intelligent Systems. The
sheets are not committed to this repository; only this note is.

Each sheet is 512x512: 32x32 map chips of 16x16 px, in the ROM's own chip order offset
by one (sheet position `p` holds ROM chip `p + 1`). The chip index files next to the
sheets (`index.json`, one `<sheet>.json` each) are mined from the FE8 ROM's chapter
maps and are also local only.

To restore everything:

1. Put `Feaws Tileset Collection.zip` at the repo root (or pass its path).
2. Make sure `base/FE8_Clean.gba`, `tools/febuilder-cli/` and the chapter maps
   (Generate Maps) are in place.
3. Run `node --no-warnings tools/assetgen/tilesets.ts [path/to/zip]`, or double-click
   `launchers/Build Tilesets.cmd`.

Only `FE 8/*.png` entries are copied out of the zip; nothing else in it is extracted
or run.
```

- [ ] **Step 3: Verify the ignore rules**

Run:

```bash
mkdir -p assets/tilesets/fe8 && touch assets/tilesets/fe8/probe.png
git status --porcelain assets/tilesets
git check-ignore -v assets/tilesets/fe8/probe.png
rm assets/tilesets/fe8/probe.png
```

Expected: `git status` lists only `?? assets/tilesets/CREDITS.md`; `check-ignore` names the `.gitignore` rule.

- [ ] **Step 4: Write `tools/assetgen/tilesets.ts`**

```ts
// Build the FE8 terrain tileset assets for the map viewers:
//   1. import: copy FE 8/*.png sheets out of Feaw's Tileset Collection zip into
//      assets/tilesets/fe8/ (skipped when no zip is given or found and sheets exist);
//   2. index: mine every FE8 chapter (ROM layout + tile config, via the CLI) into a
//      per-sheet terrain-context index next to the sheets.
// Run: node --no-warnings tools/assetgen/tilesets.ts [path/to/zip]
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cliPath, romPath, gameDir } from "./paths.ts";
import { decodeChapterMap, makeAssetResolver, CHAPTER_TABLE_ADDR, RECORD_SIZE } from "./mapdata.ts";
import { parseLayout } from "./maptiles.ts";
import { terrainGrid } from "./terraingrid.ts";
import { readZip } from "./zipread.ts";
import { decodePng } from "./pngdecode.ts";
import { sheetFileName, dataFileFor, TILESET_DIR, DEFAULT_ZIP } from "./tilesetfiles.ts";
import { sheetKeys, matchScore, newAcc, mineChapter, serialiseSheet, type SheetAcc } from "./tilesetmine.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const OUT = join(ROOT, TILESET_DIR);
const ROM_BASE = 0x08000000;
const MIN_MATCH = 0.5;

type SheetRef = { name: string; file: string };

async function importSheets(zipPath: string): Promise<SheetRef[]> {
  const entries = readZip(new Uint8Array(await readFile(zipPath)));
  const sheets: SheetRef[] = [];
  await mkdir(OUT, { recursive: true });
  for (const e of entries) {
    const ref = sheetFileName(e.name);
    if (!ref) {
      if (/^FE 8\//i.test(e.name) && /\.png$/i.test(e.name)) console.log(`  skipped unsafe name: ${e.name}`);
      continue;
    }
    await writeFile(join(OUT, ref.file), e.read());
    sheets.push(ref);
  }
  if (sheets.length === 0) throw new Error(`No "FE 8/*.png" sheets found in ${zipPath}`);
  sheets.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(join(OUT, "sheets.json"), JSON.stringify(sheets, null, 2) + "\n", "utf8");
  console.log(`Imported ${sheets.length} sheets into ${TILESET_DIR}/`);
  return sheets;
}

function run(cli: string, args: string[]): void {
  const r = spawnSync(cli, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`CLI exited ${r.status}: ${(r.stderr || r.stdout || "").trim().slice(0, 200)}`);
}

async function buildIndex(sheets: SheetRef[]): Promise<void> {
  const cli = cliPath(ROOT), rom = romPath(ROOT, "fe8");
  const mapsJson = join(gameDir(ROOT, "fe8"), "maps.json");
  if (!existsSync(rom)) throw new Error(`FE8 ROM not found at ${rom}.`);
  if (!existsSync(cli)) throw new Error("FEBuilderGBA.CLI not found. See the README asset gallery section.");
  if (!existsSync(mapsJson)) throw new Error("Chapter maps not found. Run Generate Maps (tools/assetgen/mapgen.ts) first.");

  const romBuf = await readFile(rom);
  const asset = makeAssetResolver(romBuf);
  const loaded = await Promise.all(sheets.map(async (s) => ({ ...s, keys: sheetKeys(decodePng(await readFile(join(OUT, s.file)))) })));
  const accs = new Map<string, SheetAcc>();
  const tmp = join(ROOT, ".tileset-tmp");
  await mkdir(tmp, { recursive: true });
  const chapters: { index: number; name: string }[] = JSON.parse(await readFile(mapsJson, "utf8"));

  for (const ch of chapters) {
    try {
      const recOff = (CHAPTER_TABLE_ADDR - ROM_BASE) + ch.index * RECORD_SIZE;
      const ptrs = decodeChapterMap(romBuf.subarray(recOff, recOff + RECORD_SIZE), asset);
      const hex = (p: number) => `0x${p.toString(16)}`;
      const t = join(tmp, `ch${ch.index}`);
      run(cli, ["--export-asset", "--kind=map", `--rom=${rom}`, `--addr=${hex(ptrs.layoutPtr)}`, `--out=${t}.mar`]);
      run(cli, ["--export-asset", "--kind=mapchipconfig", `--rom=${rom}`, `--addr=${hex(ptrs.tileConfigPtr)}`, `--out=${t}.cfg`]);
      const dims = JSON.parse((await readFile(`${t}.mar.json`, "utf8")).replace(/^\uFEFF/, ""));
      const layout = parseLayout(await readFile(`${t}.mar`), dims.width, dims.height);
      const cfg = await readFile(`${t}.cfg`);
      const chips: number[][] = [];
      for (let y = 0; y < dims.height; y++) chips.push(Array.from({ length: dims.width }, (_, x) => layout[y * dims.width + x] >> 2));
      const terrain = terrainGrid(cfg, layout, dims.width, dims.height);
      const png = decodePng(await readFile(join(gameDir(ROOT, "fe8"), "maps", `${ch.index}.png`)));
      let best = { name: "", score: 0 };
      for (const s of loaded) {
        const score = matchScore(s.keys, png, chips);
        if (score > best.score) best = { name: s.name, score };
      }
      if (best.score < MIN_MATCH) { console.log(`  ${ch.index} ${ch.name}: no matching sheet (best ${(best.score * 100).toFixed(0)}%)`); continue; }
      let acc = accs.get(best.name);
      if (!acc) { acc = newAcc(); accs.set(best.name, acc); }
      mineChapter(acc, chips, terrain, ch.index);
      console.log(`  ${ch.index} ${ch.name}: ${best.name} (${(best.score * 100).toFixed(0)}%)`);
    } catch (e) {
      console.log(`  ${ch.index} ${ch.name} FAILED: ${(e as Error).message}`);
    }
  }
  await rm(tmp, { recursive: true, force: true });

  const terrainDefs = JSON.parse(await readFile(join(gameDir(ROOT, "fe8"), "terrain.json"), "utf8"));
  const index: { name: string; file: string; data: string; chapters: number[]; terrains: number[] }[] = [];
  for (const s of sheets) {
    const acc = accs.get(s.name);
    if (!acc) { console.log(`${s.name}: no chapters matched, not indexed`); continue; }
    const data = dataFileFor(s.file);
    const out = serialiseSheet(acc);
    await writeFile(join(OUT, data), JSON.stringify(out) + "\n", "utf8");
    const terrains = [...acc.terrains].sort((a, b) => a - b);
    index.push({ name: s.name, file: s.file, data, chapters: acc.chapters, terrains });
    const report = terrains.map((t) => `${t} ${terrainDefs[t]?.name ?? "?"} (${out.freq[String(t)].reduce((a, c) => a + c[1], 0)})`).join(", ");
    console.log(`${s.name}: ${acc.chapters.length} chapters; terrains ${report}`);
  }
  await writeFile(join(OUT, "index.json"), JSON.stringify({ sheets: index }, null, 2) + "\n", "utf8");
  console.log(`Indexed ${index.length} of ${sheets.length} sheets into ${TILESET_DIR}/index.json`);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const zip = arg ? resolve(arg) : join(ROOT, DEFAULT_ZIP);
  let sheets: SheetRef[];
  if (existsSync(zip)) sheets = await importSheets(zip);
  else if (arg) throw new Error(`Zip not found: ${zip}`);
  else if (existsSync(join(OUT, "sheets.json"))) sheets = JSON.parse(await readFile(join(OUT, "sheets.json"), "utf8"));
  else throw new Error(`No sheets yet. Pass the path to "${DEFAULT_ZIP}" or put it at the repo root.`);
  await buildIndex(sheets);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 5: Run it against the real zip**

Run (from the worktree root; the zip sits in the map-sprites worktree):

```bash
node --no-warnings tools/assetgen/tilesets.ts "../FEArchitect-map-sprites/Feaws Tileset Collection.zip"
```

Expected: "Imported 23 sheets", one line per chapter with 77 chapters matched to a sheet (chapters 15 and 28 report "no matching sheet"), "Desert: no chapters matched, not indexed", and "Indexed 22 of 23 sheets". Then:

```bash
ls assets/tilesets/fe8 | head; git status --porcelain
```

Expected: PNGs, per-sheet JSON, `index.json`, `sheets.json` present; `git status` shows only `.gitignore`, `assets/tilesets/CREDITS.md`, and `tools/assetgen/tilesets.ts`.

Save the per-sheet terrain report lines printed for "Overworld Regular", "Plains" and "Fort": Task 7 uses them.

- [ ] **Step 6: Commit**

```bash
git add .gitignore assets/tilesets/CREDITS.md tools/assetgen/tilesets.ts
git commit -m "feat: tileset tool that imports fan sheets and mines the FE8 chip index"
```

---

### Task 6: Hub entry and launcher

**Files:**
- Create: `launchers/Build Tilesets.cmd`
- Modify: `hub/catalog.ts` (add an entry after the `maps` tool)

- [ ] **Step 1: Run the catalog test to confirm it is green before the change**

Run: `node --no-warnings --test hub/catalog.test.ts`
Expected: PASS.

- [ ] **Step 2: Add the launcher**

`launchers/Build Tilesets.cmd`:

```bat
@echo off
rem Double-click to build the FE8 terrain tiles for the map viewers. Put
rem "Feaws Tileset Collection.zip" at the repo root first (or drop the zip on this
rem file). Needs the FE8 ROM, the FEBuilder CLI and Generate Maps. Safe to re-run.
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings tools\assetgen\tilesets.ts %1
echo.
pause
```

- [ ] **Step 3: Add the catalog entry**

In `hub/catalog.ts`, directly after the `maps` entry's closing `},`, insert:

```ts
  {
    id: "tilesets", name: "Build Tilesets", group: "Assets",
    summary: "Imports the FE8 terrain tile sheets and learns which tile FE8 puts where.",
    when: "Once, after Generate Maps, with Feaws Tileset Collection.zip at the repo root.",
    script: ["tools/assetgen/tilesets.ts"],
    prereqs: [ROM, CLI, { label: "Chapter maps (run Generate Maps)", path: "assets/reference/fe8/maps.json" }],
    launcher: "launchers/Build Tilesets.cmd",
  },
```

- [ ] **Step 4: Run the catalog test**

Run: `node --no-warnings --test hub/catalog.test.ts`
Expected: PASS (the 1:1 launcher test sees the new launcher and entry).

- [ ] **Step 5: Commit**

```bash
git add "launchers/Build Tilesets.cmd" hub/catalog.ts
git commit -m "feat: Build Tilesets hub entry and launcher"
```

---

### Task 7: Terrain `fe8` ids and map `tileset` field

**Files:**
- Modify: `src/grid/types.ts` (`TerrainDef`, `ResolvedMap`)
- Modify: `src/grid/resolve.ts` (`validateTerrainDefs`, `resolveMap` legend branch)
- Modify: `data/terrain.json`
- Test: `src/grid/resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

Change the import line at the top of `src/grid/resolve.test.ts` to:

```ts
import { resolveMap, resolveScenario, validateTerrainDefs } from "./resolve.ts";
```

and append:

```ts
test("validateTerrainDefs accepts an fe8 id list and rejects a bad one", () => {
  const base = { name: "Plains", avoid: 0, def: 0, moveCost: { foot: 1, cav: 1, fly: 1 } };
  assert.deepEqual(validateTerrainDefs({ plains: { ...base, fe8: [1, 2] } }).plains.fe8, [1, 2]);
  assert.equal(validateTerrainDefs({ plains: base }).plains.fe8, undefined);
  assert.throws(() => validateTerrainDefs({ plains: { ...base, fe8: 1 } }), /fe8/);
  assert.throws(() => validateTerrainDefs({ plains: { ...base, fe8: [1.5] } }), /fe8/);
});

test("resolveMap carries an optional tileset name on legend maps", () => {
  const m = resolveMap({ id: "s", tileset: "Fort", legend: { ".": "1" }, tiles: ["."] }, defs);
  assert.equal(m.tileset, "Fort");
  assert.equal(resolveMap({ id: "s", legend: { ".": "1" }, tiles: ["."] }, defs).tileset, undefined);
  assert.equal(resolveMap({ id: "s", tileset: 3, legend: { ".": "1" }, tiles: ["."] }, defs).tileset, undefined);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --no-warnings --test src/grid/resolve.test.ts`
Expected: the two new tests FAIL (`fe8: 1` does not throw; `m.tileset` is undefined).

- [ ] **Step 3: Implement**

In `src/grid/types.ts`, add to `TerrainDef` after `healsStatus?: boolean;`:

```ts
  // FE8 terrain ids whose map chips can draw this terrain, in preference order. Only
  // custom terrains use it (FE8 chapter terrain is already FE8 ids).
  fe8?: number[];
```

and to `ResolvedMap` after `terrain: string[][];`:

```ts
  tileset?: string;     // preferred FE8 tileset sheet name for custom maps (display only)
```

In `src/grid/resolve.ts` `validateTerrainDefs`, before `out[id] = d as TerrainDef;` add:

```ts
    if (d.fe8 !== undefined && !(Array.isArray(d.fe8) && d.fe8.every((n: unknown) => Number.isInteger(n)))) {
      throw new Error(`Terrain ${id} fe8 must be an array of integer FE8 terrain ids`);
    }
```

In `resolveMap`, replace the legend-branch return

```ts
  return { id: raw.id, width, height: raw.tiles.length, terrain };
```

with

```ts
  const out: ResolvedMap = { id: raw.id, width, height: raw.tiles.length, terrain };
  if (typeof raw.tileset === "string") out.tileset = raw.tileset;
  return out;
```

(`ResolvedMap` is already imported in `resolve.ts`; if not, add it to the existing `import type` from `./types.ts`.)

- [ ] **Step 4: Run to verify they pass**

Run: `node --no-warnings --test src/grid/resolve.test.ts`
Expected: all PASS.

- [ ] **Step 5: Add the `fe8` lists to `data/terrain.json`**

Add an `"fe8"` field to each entry (keep all existing fields):

| id | `fe8` |
|---|---|
| `plains` | `[1]` |
| `forest` | `[12]` |
| `mountain` | `[15, 13]` |
| `water` | `[17, 16]` |
| `wall` | `[4, 22, 38]` |

Tuning rule, using the Task 5 report: every list should have at least one id present in "Overworld Regular" (the default sheet). If the report shows a mountain or water id with far more cells than the listed first choice on that sheet, put it first. Keep ids that appear in the Fort/Castle sheets (4 = Wall) for indoor sheets.

- [ ] **Step 6: Run the full suite**

Run: `node --no-warnings --test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/grid/types.ts src/grid/resolve.ts src/grid/resolve.test.ts data/terrain.json
git commit -m "feat: fe8 terrain ids on custom terrain and tileset field on maps"
```

---

### Task 8: Chip picker (pure)

**Files:**
- Modify: `src/grid/render.ts` (export `vary`)
- Create: `src/grid/tiles.ts`
- Test: `src/grid/tiles.test.ts`

- [ ] **Step 1: Export `vary`**

In `src/grid/render.ts` change `function vary(` to `export function vary(`.

- [ ] **Step 2: Write the failing test**

`src/grid/tiles.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fe8IdFor, chooseChips, chipSource, type SheetData } from "./tiles.ts";
import type { ResolvedMap, TerrainDef } from "./types.ts";

const def = (fe8?: number[]): TerrainDef => ({ name: "t", avoid: 0, def: 0, moveCost: { foot: 1, cav: 1, fly: 1 }, fe8 });
const defs: Record<string, TerrainDef> = { plains: def([1]), forest: def([12]), water: def([17, 16]), odd: def() };
const map = (rows: string[][]): ResolvedMap => ({ id: "m", width: rows[0].length, height: rows.length, terrain: rows });

test("fe8IdFor picks the first candidate the sheet has", () => {
  assert.equal(fe8IdFor(defs.water, [1, 16]), 16);
  assert.equal(fe8IdFor(defs.water, [1, 16, 17]), 17);
  assert.equal(fe8IdFor(defs.odd, [1]), null);
  assert.equal(fe8IdFor(undefined, [1]), null);
});

test("chipSource maps a sheet position to pixel coords", () => {
  assert.deepEqual(chipSource(0), { sx: 0, sy: 0 });
  assert.deepEqual(chipSource(33), { sx: 16, sy: 16 });
});

test("exact context wins", () => {
  const sheet: SheetData = { terrains: [1, 12], contexts: { "1,-1,12,-1,-1": [[7, 3]], "1,1,1,1,1": [[8, 9]] }, freq: { "1": [[9, 99]] } };
  assert.deepEqual(chooseChips(map([["plains", "forest"]]), defs, sheet)[0][0], 7);
});

test("edges count as the same terrain when the exact key is unknown", () => {
  const sheet: SheetData = { terrains: [1], contexts: { "1,1,1,1,1": [[8, 2]] }, freq: { "1": [[9, 99]] } };
  assert.deepEqual(chooseChips(map([["plains"]]), defs, sheet), [[8]]);
});

test("best partial context needs at least two matching neighbours, else frequency", () => {
  // cell (1,1) of a 3x3 plains field with forest to the east: key 1,1,12,1,1.
  const rows = [["plains", "plains", "plains"], ["plains", "plains", "forest"], ["plains", "plains", "plains"]];
  const partial: SheetData = { terrains: [1, 12], contexts: { "1,1,16,1,1": [[5, 4]], "1,12,12,12,12": [[6, 50]] }, freq: { "1": [[9, 1]], "12": [[3, 1]] } };
  assert.equal(chooseChips(map(rows), defs, partial)[1][1], 5); // n, s, w match (3); "1,12,12,12,12" only e (1)
  const two: SheetData = { terrains: [1, 12], contexts: { "1,12,12,12,1": [[6, 50]] }, freq: { "1": [[9, 1]], "12": [[3, 1]] } };
  assert.equal(chooseChips(map(rows), defs, two)[1][1], 6); // e and w match: 2 is enough
  const none: SheetData = { terrains: [1, 12], contexts: { "1,12,1,12,12": [[6, 50]] }, freq: { "1": [[9, 1]], "12": [[3, 1]] } };
  assert.equal(chooseChips(map(rows), defs, none)[1][1], 9); // no neighbour matches: falls to frequency
});

test("null when the terrain has no fe8 id on this sheet or no chips at all", () => {
  const sheet: SheetData = { terrains: [1], contexts: {}, freq: {} };
  assert.deepEqual(chooseChips(map([["plains", "odd", "water"]]), defs, sheet), [[null, null, null]]);
});

test("variation keeps chips with at least half the top count and is deterministic", () => {
  const rows = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => "plains"));
  const sheet: SheetData = { terrains: [1], contexts: {}, freq: { "1": [[1, 10], [2, 5], [3, 4]] } };
  const a = chooseChips(map(rows), defs, sheet), b = chooseChips(map(rows), defs, sheet);
  assert.deepEqual(a, b);
  const seen = new Set(a.flat());
  assert.ok(seen.has(1) && seen.has(2));
  assert.ok(!seen.has(3)); // 4 < 10 / 2
});
```

The centre cell (1,1) has key `1,1,12,1,1` (n, e, s, w). A partial context scores one point per neighbour equal in the same position.

- [ ] **Step 3: Run to verify it fails**

Run: `node --no-warnings --test src/grid/tiles.test.ts`
Expected: FAIL, cannot find module `./tiles.ts`.

- [ ] **Step 4: Write the implementation**

`src/grid/tiles.ts`:

```ts
// Pick an FE8 map chip for every tile of a custom map from a mined sheet index (see
// tools/assetgen/tilesetmine.ts). Pure and deterministic: the same map and sheet always
// give the same chips. Positions are sheet positions (ROM chip - 1); null means "no
// chip, keep the SVG placeholder for this tile".
import type { ResolvedMap, TerrainDef } from "./types.ts";
import { vary } from "./render.ts";

export type ChipCounts = [number, number][]; // [sheet position, count], count descending

export interface SheetData {
  terrains: number[];                  // FE8 terrain ids with mined chips on this sheet
  contexts: Record<string, ChipCounts>; // "t,n,e,s,w" (-1 = off-map) -> chips
  freq: Record<string, ChipCounts>;     // terrain id -> chips
}

const CHIP = 16, SHEET_COLS = 32, MIN_PARTIAL = 2;

export function chipSource(p: number): { sx: number; sy: number } {
  return { sx: (p % SHEET_COLS) * CHIP, sy: Math.floor(p / SHEET_COLS) * CHIP };
}

export function fe8IdFor(def: TerrainDef | undefined, terrains: number[]): number | null {
  for (const id of def?.fe8 ?? []) if (terrains.includes(id)) return id;
  return null;
}

// Among chips with at least half the top count, pick one by a coordinate hash.
function pick(list: ChipCounts, x: number, y: number): number {
  const top = list[0][1];
  const keep = list.filter(([, c]) => c * 2 >= top);
  return keep[Math.floor(vary(x, y, 17) * keep.length) % keep.length][0];
}

export function chooseChips(map: ResolvedMap, defs: Record<string, TerrainDef>, sheet: SheetData): (number | null)[][] {
  const ids = map.terrain.map((row) => row.map((t) => fe8IdFor(defs[t], sheet.terrains)));
  const at = (x: number, y: number) => (y < 0 || y >= map.height || x < 0 || x >= map.width ? -1 : ids[y][x] ?? -1);
  // Contexts grouped by centre terrain, for the partial-match step.
  const byCentre = new Map<number, { nb: number[]; list: ChipCounts; total: number; key: string }[]>();
  for (const [key, list] of Object.entries(sheet.contexts)) {
    const [t, ...nb] = key.split(",").map(Number);
    const arr = byCentre.get(t) ?? [];
    arr.push({ nb, list, total: list.reduce((a, c) => a + c[1], 0), key });
    byCentre.set(t, arr);
  }

  return ids.map((row, y) => row.map((t, x) => {
    if (t == null) return null;
    const nb = [at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)];
    let list = sheet.contexts[[t, ...nb].join(",")];
    if (!list?.length) list = sheet.contexts[[t, ...nb.map((v) => (v === -1 ? t : v))].join(",")];
    if (!list?.length) {
      let best: { score: number; total: number; key: string; list: ChipCounts } | null = null;
      for (const c of byCentre.get(t) ?? []) {
        const score = c.nb.reduce((a, v, i) => a + (v === nb[i] ? 1 : 0), 0);
        if (score < MIN_PARTIAL || !c.list.length) continue;
        if (!best || score > best.score || (score === best.score && (c.total > best.total || (c.total === best.total && c.key < best.key)))) {
          best = { score, total: c.total, key: c.key, list: c.list };
        }
      }
      list = best?.list ?? sheet.freq[String(t)];
    }
    return list?.length ? pick(list, x, y) : null;
  }));
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --no-warnings --test src/grid/tiles.test.ts src/grid/render.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/grid/render.ts src/grid/tiles.ts src/grid/tiles.test.ts
git commit -m "feat: pure context-aware terrain chip picker"
```

---

### Task 9: `terrainLayer()` SVG builder

**Files:**
- Modify: `src/grid/render.ts`
- Test: `src/grid/render.test.ts`

- [ ] **Step 1: Write the failing test**

Change the import in `src/grid/render.test.ts` to:

```ts
import { terrainSprite, unitSprite, TILE_COLORS, terrainLayer } from "./render.ts";
```

and append:

```ts
test("terrainLayer without a backdrop draws a coloured rect per tile", () => {
  const svg = terrainLayer([["plains", "water"]], 48, null);
  assert.equal((svg.match(/<rect /g) ?? []).length, 2);
  assert.match(svg, new RegExp(TILE_COLORS.water));
  assert.doesNotMatch(svg, /<image/);
});

test("terrainLayer with a backdrop draws the image once and placeholders only where uncovered", () => {
  const svg = terrainLayer([["plains", "water"]], 48, { href: "data:image/png;base64,AA", covered: [[true, false]] });
  assert.equal((svg.match(/<image /g) ?? []).length, 1);
  assert.match(svg, /width="96" height="48"/);
  assert.match(svg, /image-rendering:pixelated/);
  assert.equal((svg.match(/<rect /g) ?? []).length, 1); // only the uncovered water tile
  assert.match(svg, new RegExp(`x="48" y="0" width="48" height="48" fill="${TILE_COLORS.water}"`));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --no-warnings --test src/grid/render.test.ts`
Expected: FAIL, `terrainLayer` is not exported.

- [ ] **Step 3: Implement**

Append to `src/grid/render.ts`:

```ts
// The board's terrain: an optional chip backdrop image (one <image> for the whole
// map), plus today's coloured rect and SVG motif for every tile the backdrop does not
// cover. With no backdrop this is exactly the placeholder look.
export function terrainLayer(
  terrain: string[][], tile: number, backdrop: { href: string; covered: boolean[][] } | null,
): string {
  const h = terrain.length, w = terrain[0]?.length ?? 0;
  let svg = backdrop
    ? `<image href="${backdrop.href}" x="0" y="0" width="${w * tile}" height="${h * tile}" preserveAspectRatio="none" style="image-rendering:pixelated" pointer-events="none"/>`
    : "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (backdrop?.covered[y]?.[x]) continue;
      const id = terrain[y][x], px = x * tile, py = y * tile;
      svg += `<rect x="${px}" y="${py}" width="${tile}" height="${tile}" fill="${TILE_COLORS[id] ?? "#c9cfd6"}" stroke="#00000022"/>`;
      svg += terrainSprite(id, px, py, tile, x, y);
    }
  }
  return svg;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --no-warnings --test src/grid/render.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/grid/render.ts src/grid/render.test.ts
git commit -m "feat: terrainLayer builder with optional chip backdrop"
```

---

### Task 10: Serve `assets/tilesets/`

**Files:**
- Modify: `src/server.ts` (`staticAllowed`)
- Test: `src/server.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/server.test.ts`:

```ts
test("staticAllowed serves the terrain tileset folder", () => {
  assert.equal(staticAllowed("assets/tilesets/fe8/index.json"), true);
  assert.equal(staticAllowed("assets/tilesets/fe8/plains.png"), true);
  assert.equal(staticAllowed("assets/tilesets/../../base/FE8_Clean.gba"), false);
  assert.equal(staticAllowed("assets/other/x.png"), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --no-warnings --test src/server.test.ts`
Expected: the new test FAILS on the first assertion.

- [ ] **Step 3: Implement**

In `src/server.ts` `staticAllowed`, change the roots array to:

```ts
  return ["src/", "data/", "encounters/", "maps/", "assets/reference/", "assets/tilesets/"].some((root) => norm.startsWith(root));
```

(When `feat/map-sprites` merges, this line conflicts with its `"assets/mapsprites/"` addition; keep both roots.)

Also check how the server sends content types: if it maps by extension and lacks `.png`, add `".png": "image/png"` next to the existing entries. Run `grep -n "png\|content-type\|Content-Type" src/server.ts` to confirm; the FE8 chapter PNGs are already served from `assets/reference/`, so `.png` is very likely present.

- [ ] **Step 4: Run to verify it passes**

Run: `node --no-warnings --test src/server.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/server.test.ts
git commit -m "feat: serve terrain tilesets from the dev server"
```

---

### Task 11: Browser backdrop module

**Files:**
- Create: `src/game/tilebackdrop.ts`

Browser-only glue (canvas, Image, fetch) over the tested `chooseChips`/`chipSource`; verified in the browser in Task 14.

- [ ] **Step 1: Write the module**

`src/game/tilebackdrop.ts`:

```ts
// Browser glue for real terrain tiles: loads the tileset index and a sheet, runs the
// pure chip picker, and composes the chosen chips onto a canvas at 16 px per tile.
// Every failure resolves to null so the viewers keep their SVG terrain.
import { chooseChips, chipSource, type SheetData } from "../grid/tiles.ts";
import type { ResolvedMap, TerrainDef } from "../grid/types.ts";

export interface SheetInfo { name: string; file: string; data: string; chapters: number[]; terrains: number[] }
export interface Backdrop { href: string; covered: boolean[][] }

export const DEFAULT_SHEET = "Overworld Regular";
const BASE = "/assets/tilesets/fe8/";
const CHIP = 16;

let indexP: Promise<SheetInfo[] | null> | null = null;

export function loadTilesetIndex(): Promise<SheetInfo[] | null> {
  indexP ??= fetch(BASE + "index.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (Array.isArray(j?.sheets) && j.sheets.length ? (j.sheets as SheetInfo[]) : null))
    .catch(() => null);
  return indexP;
}

// The wanted sheet if indexed, else the default, else the first one.
export function pickSheet(sheets: SheetInfo[], wanted?: string): SheetInfo | null {
  return sheets.find((s) => s.name === wanted) ?? sheets.find((s) => s.name === DEFAULT_SHEET) ?? sheets[0] ?? null;
}

const sheetCache = new Map<string, Promise<{ data: SheetData; img: HTMLImageElement } | null>>();

function loadSheet(info: SheetInfo): Promise<{ data: SheetData; img: HTMLImageElement } | null> {
  let p = sheetCache.get(info.name);
  if (!p) {
    p = Promise.all([
      fetch(BASE + info.data).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText)))),
      new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = BASE + info.file; }),
    ])
      .then(([j, img]) => ({ data: { terrains: info.terrains, contexts: j.contexts ?? {}, freq: j.freq ?? {} }, img }))
      .catch(() => null);
    sheetCache.set(info.name, p);
  }
  return p;
}

const backdropCache = new Map<string, Promise<Backdrop | null>>();

export function tileBackdrop(map: ResolvedMap, defs: Record<string, TerrainDef>, info: SheetInfo): Promise<Backdrop | null> {
  const key = `${map.id}|${info.name}`;
  let p = backdropCache.get(key);
  if (!p) {
    p = loadSheet(info).then((sheet) => {
      if (!sheet) return null;
      const chips = chooseChips(map, defs, sheet.data);
      const canvas = document.createElement("canvas");
      canvas.width = map.width * CHIP; canvas.height = map.height * CHIP;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = false;
      const covered = chips.map((row, y) => row.map((p, x) => {
        if (p == null) return false;
        const { sx, sy } = chipSource(p);
        ctx.drawImage(sheet.img, sx, sy, CHIP, CHIP, x * CHIP, y * CHIP, CHIP, CHIP);
        return true;
      }));
      if (!covered.some((row) => row.some(Boolean))) return null;
      return { href: canvas.toDataURL("image/png"), covered };
    }).catch(() => null);
    backdropCache.set(key, p);
  }
  return p;
}
```

- [ ] **Step 2: Type-strip sanity check**

Run: `node --no-warnings -e "import('node:module').then(m=>m.stripTypeScriptTypes(require('node:fs').readFileSync('src/game/tilebackdrop.ts','utf8'),{mode:'strip'})).then(()=>console.log('ok'))"`
Expected: `ok` (no unsupported TypeScript syntax such as enums or parameter properties).

- [ ] **Step 3: Commit**

```bash
git add src/game/tilebackdrop.ts
git commit -m "feat: browser terrain backdrop composer"
```

---

### Task 12: Scenario viewer

**Files:**
- Modify: `src/game/scenario.html` (controls row)
- Modify: `src/game/scenario.ts` (imports, globals, `fetchScenario`, terrain part of `render()`, boot, new control). Do not touch `unitToken()`.

- [ ] **Step 1: Add the dropdown markup**

In `src/game/scenario.html`, directly after the `Class sprites` label line, add:

```html
    <label id="tilesetlabel" hidden>Tileset <select id="tileset"></select></label>
```

- [ ] **Step 2: Imports and globals**

In `src/game/scenario.ts` change the render import to:

```ts
import { unitSprite, terrainLayer } from "../grid/render.ts";
```

(`terrainSprite` and `TILE_COLORS` are no longer used here once Step 4 lands; if any other line in the file still uses them, keep them in the import.) Add:

```ts
import { loadTilesetIndex, pickSheet, tileBackdrop, type SheetInfo, type Backdrop } from "./tilebackdrop.ts";
```

After `let spriteMode ...` add:

```ts
let chapterPng = "";                    // FE8 chapter encounters: the ROM-rendered map image
let sheets: SheetInfo[] | null = null;  // indexed terrain tilesets, null when not installed
let tilesetName = "";                   // "" = placeholder SVG terrain
let backdrop: Backdrop | null = null;   // composed chips for the current map and sheet
let backdropToken = 0;                  // ignores stale backdrop loads
const tilesetSel = document.getElementById("tileset") as HTMLSelectElement;
const tilesetLabel = document.getElementById("tilesetlabel")!;
```

- [ ] **Step 3: Remember the chapter image in `fetchScenario`**

In `fetchScenario`, right after `const mapId = ...`, add:

```ts
  chapterPng = fe8 ? `/assets/reference/fe8/maps/${mapId}.png` : "";
```

- [ ] **Step 4: Terrain part of `render()`**

Replace the terrain double loop at the top of `render()`:

```ts
  for (let y = 0; y < g.map.height; y++) {
    for (let x = 0; x < g.map.width; x++) {
      const id = g.map.terrain[y][x], px = x * TILE, py = y * TILE;
      svg += `<rect x="${px}" y="${py}" width="${TILE}" height="${TILE}" fill="${TILE_COLORS[id] ?? "#c9cfd6"}" stroke="#00000022"/>`;
      svg += terrainSprite(id, px, py, TILE, x, y);
    }
  }
```

with:

```ts
  svg += chapterPng
    ? `<image href="${chapterPng}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" style="image-rendering:pixelated" pointer-events="none"/>`
    : terrainLayer(g.map.terrain, TILE, backdrop);
```

- [ ] **Step 5: Backdrop refresh and dropdown sync**

Add above `function start()`:

```ts
// Show the Tileset picker for custom maps when tilesets are installed, and select the
// map's own sheet (or the default).
function syncTilesetControl(): void {
  const show = !!sheets && !chapterPng;
  tilesetLabel.hidden = !show;
  if (!show) { tilesetName = ""; return; }
  tilesetName = pickSheet(sheets!, scRaw.map.tileset)?.name ?? "";
  tilesetSel.value = tilesetName;
}

async function refreshBackdrop(): Promise<void> {
  const token = ++backdropToken;
  backdrop = null;
  const info = sheets && !chapterPng && tilesetName ? sheets.find((s) => s.name === tilesetName) : undefined;
  if (!info) return;
  const b = await tileBackdrop(scRaw.map, scRaw.terrainDefs, info);
  if (token !== backdropToken) return; // a newer map or sheet was chosen meanwhile
  backdrop = b;
  render();
}
```

Replace `boot()` with:

```ts
async function boot(): Promise<void> {
  const sel2 = document.getElementById("enc") as HTMLSelectElement;
  sel2.addEventListener("change", async () => {
    scRaw = await fetchScenario(sel2.value);
    syncTilesetControl(); start(); void refreshBackdrop();
  });
  scRaw = await fetchScenario(sel2.value);
  sheets = await loadTilesetIndex();
  if (sheets) {
    tilesetSel.innerHTML = `<option value="">Placeholder (SVG)</option>` +
      sheets.map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");
  }
  syncTilesetControl();
  start();
  void refreshBackdrop();
}

tilesetSel.addEventListener("change", () => { tilesetName = tilesetSel.value; render(); void refreshBackdrop(); });
```

(`esc` already exists in `scenario.ts`. `render()` right after a change shows the placeholder until the new backdrop resolves; `refreshBackdrop` re-renders when it does.)

- [ ] **Step 6: Run the suite**

Run: `node --no-warnings --test`
Expected: all PASS (no test imports `scenario.ts`; this guards the shared modules).

- [ ] **Step 7: Commit**

```bash
git add src/game/scenario.ts src/game/scenario.html
git commit -m "feat: real terrain tiles and chapter backdrop in the scenario viewer"
```

---

### Task 13: 1v1 viewer

**Files:**
- Modify: `src/game/client.ts` (imports, `render()` terrain branch, `boot()`/`restart()`)

- [ ] **Step 1: Imports and global**

Change the render import to:

```ts
import { unitSprite, terrainLayer } from "../grid/render.ts";
```

(keep `terrainSprite`/`TILE_COLORS` only if still used elsewhere in the file after Step 2). Add:

```ts
import { loadTilesetIndex, pickSheet, tileBackdrop, type Backdrop } from "./tilebackdrop.ts";
```

After `let chapterPng = "";` add:

```ts
let backdrop: Backdrop | null = null; // composed terrain chips for custom maps
let backdropToken = 0;
```

- [ ] **Step 2: Terrain branch of `render()`**

Replace the `else { ... }` branch of `if (isChapter)` (the per-tile loop that draws rect, `terrainSprite` and reach) with:

```ts
  } else {
    svg += terrainLayer(g.enc.map.terrain, TILE, backdrop);
    for (const key of reach) {
      const [x, y] = key.split(",").map(Number);
      svg += `<rect x="${x * TILE}" y="${y * TILE}" width="${TILE}" height="${TILE}" fill="#2b6cff40" stroke="#2b6cffcc" stroke-width="1.5"/>`;
    }
  }
```

- [ ] **Step 3: Load the backdrop**

Add above `async function boot()`:

```ts
async function refreshBackdrop(): Promise<void> {
  const token = ++backdropToken;
  backdrop = null;
  if (isChapter) return;
  const sheets = await loadTilesetIndex();
  const info = sheets ? pickSheet(sheets, g.enc.map.tileset) : null;
  const b = info ? await tileBackdrop(g.enc.map, g.enc.terrainDefs, info) : null;
  if (token !== backdropToken) return;
  backdrop = b;
  if (b) render();
}
```

In `boot()`, after `render();` add `void refreshBackdrop();`. In `restart()`, after `render();` add `void refreshBackdrop();`.

Because `render()` re-runs while a preview animation may be active, `refreshBackdrop` only calls `render()` once the backdrop arrives; if that ever interrupts the preview slide during testing, guard it with `if (b && !busy) render();`.

- [ ] **Step 4: Run the suite**

Run: `node --no-warnings --test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/client.ts
git commit -m "feat: real terrain tiles in the 1v1 viewer for custom maps"
```

---

### Task 14: README and browser check

**Files:**
- Modify: `README.md` (end of the "FE asset gallery" section, before `## How it's built`)

- [ ] **Step 1: README note**

Insert before `## How it's built`:

```markdown
### Terrain tiles

The map viewers draw custom maps with real FE8 terrain tiles when they are installed,
and fall back to the simple drawn terrain otherwise. One-time setup, after Generate
Maps: put `Feaws Tileset Collection.zip` at the repo root and double-click
**Build Tilesets.cmd** (or run `node --no-warnings tools/assetgen/tilesets.ts path/to/zip`).
It copies only the `FE 8/*.png` sheets into `assets/tilesets/fe8/` (gitignored; see
`assets/tilesets/CREDITS.md`) and learns from the real FE8 chapters which tile goes
next to which terrain. In the scenario viewer, the Tileset dropdown swaps sheets; a map
can pick its own with `"tileset": "Fort"` in its JSON.
```

- [ ] **Step 2: Full suite**

Run: `node --no-warnings --test`
Expected: all PASS. Record the pass count.

- [ ] **Step 3: Browser check**

Start the dev server (`node --no-warnings src/server.ts`, port 5173; or the Play Scenario launcher's command) and open `http://localhost:5173/src/game/scenario.html`:

1. Scenario 01 (custom `showcase-terrain`): terrain is FE8 chips, not flat colours; forest, mountain and river read correctly; units and highlights draw on top; no console errors.
2. Tileset dropdown is visible, lists the indexed sheets with "Overworld Regular" selected; switching to "Fort" and "Plains" redraws; "Placeholder (SVG)" restores the old look.
3. FE8 chapter backdrop: create an uncommitted `encounters/zz-fe8-check.json` copying `encounters/scenario-01.json` with `"map": "fe8-1"` and `"terrain": "fe8"` (move unit positions onto passable chapter 1 tiles if resolve complains), add a temporary `<option>` for it in the page via devtools or by editing the select's value in the console (`document.getElementById('enc').value` plus dispatching `change`), confirm the chapter PNG appears and the Tileset picker hides, then delete the temp file.
4. Open `http://localhost:5173/src/game/index.html` with the showcase encounter: chips draw; reach highlights and the slide animation still work.
5. Rename `assets/tilesets/fe8/index.json` temporarily and reload both pages: the old SVG terrain shows, the picker is hidden, no uncaught errors. Restore the file.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: terrain tiles setup in the README"
```

---

## Self-review notes

- Spec coverage: import (Tasks 1, 3, 5), PNG decode (2), mining + index (4, 5), terrain mapping (7), picker (8), backdrop (9, 11), scenario viewer incl. FE8 chapter backdrop and dropdown (12), 1v1 viewer (13), map `tileset` field (7), server root (10), gitignore + credits (5), README (14), hub launcher (6, required by `hub/catalog.test.ts`), tests and browser check (each task, 14).
- Deviation from the spec, recorded there too: import and index run from one command (`tilesets.ts`) so there is a single hub entry; the partial-context step requires at least two matching neighbours before falling back to frequency.
