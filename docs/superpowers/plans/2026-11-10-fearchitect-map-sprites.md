# Map Sprites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw scenario-viewer units as real FE8 GBA map sprites (animated idle, red-recolored enemies, greyed acted units), sliced in the browser from user-supplied sprite sheets.

**Architecture:** A pure pixel pipeline (`src/grid/mapsprite.ts`: crop, key out, palette remap, greyscale, mapping validation) is unit-tested on plain RGBA buffers. A thin browser loader (`src/game/mapsprite-loader.ts`) reads sheets into pixel buffers once, then slices frames on demand and caches each as a data URL. The scenario viewer gets a 3-way sprite-mode select and a shared idle timer that swaps `<image>` hrefs without re-rendering.

**Tech Stack:** TypeScript run directly by Node (type stripping), `node:test` + `node:assert/strict`, browser canvas, SVG. No new dependencies. The dev server (`src/server.ts`) serves `.ts` to the browser and serves `/data/*` and `/assets/*`.

**Spec:** `docs/superpowers/specs/2026-11-10-fearchitect-map-sprites-design.md`

**Run the suite:** `node --no-warnings --test` (baseline: 161 tests, all pass).

**Commits:** plain conventional messages, no co-author or attribution trailers.

---

## File structure

| File | Responsibility |
|---|---|
| `src/grid/types.ts` (modify) | `GridUnit.classId` so the viewer can look up a unit's sprite |
| `src/grid/resolve.ts` (modify) | fill `classId` from the unit's `class` |
| `src/grid/mapsprite.ts` (create) | pure pixel pipeline + mapping types + validation |
| `src/grid/mapsprite.test.ts` (create) | unit tests for the above, plus validation of the committed mapping |
| `data/mapsprites.json` (create) | palettes + per-class crop entries (starts empty, filled in Task 6) |
| `.gitignore` (modify) | ignore `assets/mapsprites/*` except `CREDITS.md` |
| `assets/mapsprites/CREDITS.md` (create) | credit for the ripped sheets |
| `src/game/mapsprite-loader.ts` (create) | browser-only: load sheets, slice, cache data URLs |
| `src/game/scenario.ts` (modify) | sprite-mode select, map-sprite token, idle animation |
| `src/game/scenario.html` (modify) | replace the checkbox with the select, pixelated image style |

---

### Task 1: carry the class id on `GridUnit`

**Files:**
- Modify: `src/grid/types.ts:62-74`
- Modify: `src/grid/resolve.ts:98`
- Test: `src/grid/resolve.test.ts`

- [ ] **Step 1: Write the failing test** (append to `src/grid/resolve.test.ts`)

```ts
test("resolveScenario records each unit's class id for sprite lookup", () => {
  const sc = resolveScenario({ id: "s", map: "m", units: [
    { unit: "seth", weapon: "iron-sword", side: "player", at: [0, 0] },
    { unit: "eirika", weapon: "iron-sword", side: "enemy", at: [1, 0] },
  ] }, SC_UNITS, SC_WEAPONS, SC_TERRAIN, SC_CLASSES, SC_MAP, SC_SKILLS);
  assert.equal(sc.units[0].classId, "paladin");
  assert.equal(sc.units[1].classId, "infantry");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --no-warnings --test src/grid/resolve.test.ts`
Expected: FAIL, `undefined !== 'paladin'`.

- [ ] **Step 3: Implement**

In `src/grid/types.ts`, inside `interface GridUnit`, after `cls: ClassDef;` add:

```ts
  classId: string; // key of cls in the class table (map-sprite lookup)
```

In `src/grid/resolve.ts`, in `buildUnit`'s return object, add `classId: rawUnit.class,` right after `cls,`:

```ts
  return { id: ref.unit, side, unit, weapon: weapon as WeaponDef, cls, classId: rawUnit.class, ai, pos: { x: ref.at[0], y: ref.at[1] }, hp: unit.hp, level: rawUnit.level, skills, portrait: rawUnit.portrait };
```

- [ ] **Step 4: Run the whole suite**

Run: `node --no-warnings --test`
Expected: all pass (162). If a test builds a `GridUnit` literal by hand and type-checking is not enforced at runtime, nothing else breaks. Search with `grep -rn "portrait:" src --include=*.ts` and add `classId` to any hand-built `GridUnit` literals in non-test source so the type stays honest.

- [ ] **Step 5: Commit**

```bash
git add src/grid/types.ts src/grid/resolve.ts src/grid/resolve.test.ts
git commit -m "feat: record class id on resolved grid units"
```

---

### Task 2: pure pixel pipeline

**Files:**
- Create: `src/grid/mapsprite.ts`
- Test: `src/grid/mapsprite.test.ts`

- [ ] **Step 1: Write the failing tests** (`src/grid/mapsprite.test.ts`)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cropFrame, keyOut, remapPalette, greyscale, frameRect, hexToRgb, type PixelBuf } from "./mapsprite.ts";

// Build a buffer from rows of "#rrggbb" (or null for transparent).
function buf(rows: (string | null)[][]): PixelBuf {
  const h = rows.length, w = rows[0].length, data = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) => row.forEach((c, x) => {
    const i = (y * w + x) * 4;
    if (c) { const [r, g, b] = hexToRgb(c); data.set([r, g, b, 255], i); }
  }));
  return { width: w, height: h, data };
}
function px(b: PixelBuf, x: number, y: number): number[] { const i = (y * b.width + x) * 4; return Array.from(b.data.slice(i, i + 4)); }

test("hexToRgb parses #rrggbb", () => {
  assert.deepEqual(hexToRgb("#ff8000"), [255, 128, 0]);
  assert.throws(() => hexToRgb("red"));
});

test("cropFrame copies the requested rectangle", () => {
  const sheet = buf([["#000000", "#111111", "#222222"], ["#333333", "#444444", "#555555"]]);
  const c = cropFrame(sheet, 1, 0, 2, 2);
  assert.equal(c.width, 2); assert.equal(c.height, 2);
  assert.deepEqual(px(c, 0, 0), [0x11, 0x11, 0x11, 255]);
  assert.deepEqual(px(c, 1, 1), [0x55, 0x55, 0x55, 255]);
});

test("cropFrame rejects a rectangle outside the sheet", () => {
  const sheet = buf([["#000000", "#000000"]]);
  assert.throws(() => cropFrame(sheet, 1, 0, 2, 1), /outside/);
});

test("keyOut makes background-colored pixels transparent and leaves others", () => {
  const b = keyOut(buf([["#8080ff", "#ff0000"]]), "#8080ff");
  assert.equal(px(b, 0, 0)[3], 0);
  assert.deepEqual(px(b, 1, 0), [255, 0, 0, 255]);
});

test("remapPalette swaps listed colors by index and leaves the rest", () => {
  const b = remapPalette(buf([["#0000ff", "#3030c0", "#f0c8a0"]]), ["#0000ff", "#3030c0"], ["#ff0000", "#c03030"]);
  assert.deepEqual(px(b, 0, 0), [255, 0, 0, 255]);
  assert.deepEqual(px(b, 1, 0), [0xc0, 0x30, 0x30, 255]);
  assert.deepEqual(px(b, 2, 0), [0xf0, 0xc8, 0xa0, 255]); // skin untouched
});

test("remapPalette throws on mismatched palette lengths", () => {
  assert.throws(() => remapPalette(buf([["#000000"]]), ["#000000"], []), /length/);
});

test("remapPalette ignores transparent pixels", () => {
  const b = remapPalette(buf([[null]]), ["#000000"], ["#ff0000"]);
  assert.deepEqual(px(b, 0, 0), [0, 0, 0, 0]);
});

test("greyscale equalizes channels and preserves alpha", () => {
  const b = greyscale(buf([["#ff0000", null]]));
  const [r, g, bl, a] = px(b, 0, 0);
  assert.equal(r, g); assert.equal(g, bl); assert.equal(a, 255);
  assert.equal(px(b, 1, 0)[3], 0);
});

test("pipeline functions do not mutate their input", () => {
  const src = buf([["#0000ff"]]);
  keyOut(src, "#0000ff"); remapPalette(src, ["#0000ff"], ["#ff0000"]); greyscale(src);
  assert.deepEqual(px(src, 0, 0), [0, 0, 255, 255]);
});

test("frameRect steps by stride", () => {
  const e = { sheet: "s.png", x: 10, y: 20, w: 16, h: 16, frames: 3, stride: [0, 16] as [number, number], bg: "#000000" };
  assert.deepEqual(frameRect(e, 0), { x: 10, y: 20, w: 16, h: 16 });
  assert.deepEqual(frameRect(e, 2), { x: 10, y: 52, w: 16, h: 16 });
  assert.throws(() => frameRect(e, 3), /frame/);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --no-warnings --test src/grid/mapsprite.test.ts`
Expected: FAIL, cannot find module `./mapsprite.ts`.

- [ ] **Step 3: Implement** (`src/grid/mapsprite.ts`)

```ts
// GBA map sprites sliced from ripped sheets: a pure RGBA pipeline (crop, key out the
// sheet background, recolor the team palette, grey out acted units) plus the mapping
// format in data/mapsprites.json. No DOM here; the browser loader wraps this.

export interface PixelBuf { width: number; height: number; data: Uint8ClampedArray }

export interface MapSpriteEntry {
  sheet: string;              // file name under /assets/mapsprites/
  x: number; y: number;       // top-left of idle frame 0
  w: number; h: number;       // frame size in sheet pixels
  frames: number;             // idle frame count
  stride: [number, number];   // offset from one frame to the next
  bg: string;                 // sheet background "#rrggbb", keyed to transparent
}

export interface MapSpriteData {
  palettes: { player: string[]; enemy: string[] };
  classes: Record<string, MapSpriteEntry>;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb color: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clone(b: PixelBuf): PixelBuf { return { width: b.width, height: b.height, data: new Uint8ClampedArray(b.data) }; }

export function cropFrame(sheet: PixelBuf, x: number, y: number, w: number, h: number): PixelBuf {
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > sheet.width || y + h > sheet.height) {
    throw new Error(`crop ${x},${y} ${w}x${h} is outside the ${sheet.width}x${sheet.height} sheet`);
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * sheet.width + x) * 4;
    out.set(sheet.data.subarray(from, from + w * 4), row * w * 4);
  }
  return { width: w, height: h, data: out };
}

export function keyOut(b: PixelBuf, bg: string): PixelBuf {
  const [r, g, bl] = hexToRgb(bg), out = clone(b), d = out.data;
  for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === bl) d[i + 3] = 0;
  return out;
}

export function remapPalette(b: PixelBuf, from: string[], to: string[]): PixelBuf {
  if (from.length !== to.length) throw new Error(`palette length mismatch: ${from.length} vs ${to.length}`);
  const map = new Map<number, [number, number, number]>();
  from.forEach((c, i) => { const [r, g, bl] = hexToRgb(c); map.set((r << 16) | (g << 8) | bl, hexToRgb(to[i])); });
  const out = clone(b), d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const hit = map.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (hit) { d[i] = hit[0]; d[i + 1] = hit[1]; d[i + 2] = hit[2]; }
  }
  return out;
}

export function greyscale(b: PixelBuf): PixelBuf {
  const out = clone(b), d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = l;
  }
  return out;
}

export function frameRect(e: MapSpriteEntry, i: number): { x: number; y: number; w: number; h: number } {
  if (i < 0 || i >= e.frames) throw new Error(`frame ${i} out of range (0..${e.frames - 1})`);
  return { x: e.x + e.stride[0] * i, y: e.y + e.stride[1] * i, w: e.w, h: e.h };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --no-warnings --test src/grid/mapsprite.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/grid/mapsprite.ts src/grid/mapsprite.test.ts
git commit -m "feat: pure map-sprite pixel pipeline"
```

---

### Task 3: mapping validation, data file, and asset folder

**Files:**
- Modify: `src/grid/mapsprite.ts` (add `validateMapping`)
- Modify: `src/grid/mapsprite.test.ts`
- Create: `data/mapsprites.json`
- Modify: `.gitignore`
- Create: `assets/mapsprites/CREDITS.md`

- [ ] **Step 1: Write the failing tests** (append to `src/grid/mapsprite.test.ts`; add `validateMapping` to the import line, and add `import { readFileSync } from "node:fs";` at the top)

```ts
const GOOD = {
  palettes: { player: ["#0000ff"], enemy: ["#ff0000"] },
  classes: { cavalier: { sheet: "fe8.png", x: 0, y: 0, w: 16, h: 32, frames: 3, stride: [16, 0], bg: "#a0a0f8" } },
};

test("validateMapping accepts a well-formed mapping", () => {
  assert.deepEqual(validateMapping(GOOD), []);
});

test("validateMapping reports each problem", () => {
  const bad = {
    palettes: { player: ["#0000ff", "#0000aa"], enemy: ["#ff0000"] },
    classes: { knight: { sheet: "", x: 0, y: 0, w: 0, h: 16, frames: 0, stride: [0], bg: "blue" } },
  };
  const problems = validateMapping(bad).join("\n");
  assert.match(problems, /palette/);
  assert.match(problems, /knight.*sheet/);
  assert.match(problems, /knight.*size/);
  assert.match(problems, /knight.*frames/);
  assert.match(problems, /knight.*stride/);
  assert.match(problems, /knight.*bg/);
});

test("validateMapping rejects a non-object", () => {
  assert.ok(validateMapping(null).length > 0);
});

test("the committed data/mapsprites.json is valid", () => {
  const json = JSON.parse(readFileSync(new URL("../../data/mapsprites.json", import.meta.url), "utf8"));
  assert.deepEqual(validateMapping(json), []);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --no-warnings --test src/grid/mapsprite.test.ts`
Expected: FAIL, `validateMapping` is not exported (and the data file is missing).

- [ ] **Step 3: Implement `validateMapping`** (append to `src/grid/mapsprite.ts`)

```ts
const HEX = /^#[0-9a-f]{6}$/i;

// Problems with a parsed data/mapsprites.json; empty when it is usable.
export function validateMapping(json: any): string[] {
  if (!json || typeof json !== "object") return ["mapping must be an object"];
  const p: string[] = [];
  const pal = json.palettes;
  if (!pal || !Array.isArray(pal.player) || !Array.isArray(pal.enemy)) p.push("palettes.player and palettes.enemy must be arrays");
  else {
    if (pal.player.length !== pal.enemy.length) p.push(`palette lengths differ: player ${pal.player.length}, enemy ${pal.enemy.length}`);
    for (const c of [...pal.player, ...pal.enemy]) if (!HEX.test(c)) p.push(`palette color is not #rrggbb: ${c}`);
  }
  if (!json.classes || typeof json.classes !== "object") { p.push("classes must be an object"); return p; }
  for (const [id, e] of Object.entries<any>(json.classes)) {
    if (typeof e?.sheet !== "string" || !e.sheet) p.push(`${id}: sheet must be a file name`);
    if (![e?.x, e?.y].every((n) => Number.isInteger(n) && n >= 0)) p.push(`${id}: x/y must be non-negative integers`);
    if (![e?.w, e?.h].every((n) => Number.isInteger(n) && n > 0)) p.push(`${id}: size w/h must be positive integers`);
    if (!Number.isInteger(e?.frames) || e.frames < 1) p.push(`${id}: frames must be at least 1`);
    if (!Array.isArray(e?.stride) || e.stride.length !== 2 || !e.stride.every(Number.isInteger)) p.push(`${id}: stride must be [dx, dy]`);
    if (typeof e?.bg !== "string" || !HEX.test(e.bg)) p.push(`${id}: bg must be #rrggbb`);
  }
  return p;
}
```

- [ ] **Step 4: Create the data file** (`data/mapsprites.json`, filled in Task 6)

```json
{
  "palettes": { "player": [], "enemy": [] },
  "classes": {}
}
```

- [ ] **Step 5: Ignore the sheets but keep the credits file.** Append to `.gitignore`:

```
# Fan-ripped GBA map-sprite sheets (not committed); only the credits note is tracked
assets/mapsprites/*
!assets/mapsprites/CREDITS.md
```

Note: `assets/reference/` is ignored separately; `assets/mapsprites/` is a sibling, so the negation works.

- [ ] **Step 6: Create `assets/mapsprites/CREDITS.md`**

```markdown
# Map sprite credits

The FE8 (Fire Emblem: The Sacred Stones) map-sprite sheets placed in this folder are fan
rips from The Spriters Resource (https://www.spriters-resource.com/). Credit goes to the
rippers named on each sheet's page. Fire Emblem art is the property of Nintendo /
Intelligent Systems. The sheets are not committed to this repository; only this note is.

Place the sheet PNGs here. Their file names must match the `sheet` fields in
`data/mapsprites.json`.
```

- [ ] **Step 7: Run the suite and check the ignore rule**

Run: `node --no-warnings --test`
Expected: all pass.
Run: `git check-ignore -v assets/mapsprites/example.png; git check-ignore assets/mapsprites/CREDITS.md || echo tracked-ok`
Expected: the first prints the `assets/mapsprites/*` rule; the second prints `tracked-ok`.

- [ ] **Step 8: Commit**

```bash
git add src/grid/mapsprite.ts src/grid/mapsprite.test.ts data/mapsprites.json .gitignore assets/mapsprites/CREDITS.md
git commit -m "feat: map-sprite mapping format, validation and asset folder"
```

---

### Task 4: browser loader

**Files:**
- Create: `src/game/mapsprite-loader.ts`

Browser-only (uses `Image` and canvas), so it has no unit test; Task 7 verifies it in the browser. It must never throw into the viewer: missing data, a missing sheet, or a bad crop all yield `null`, which the viewer treats as "fall back".

- [ ] **Step 1: Implement**

```ts
// Browser side of map sprites: loads data/mapsprites.json and the sheets it names, then
// slices frames on demand through the pure pipeline and caches each as a data URL.
// Every failure returns null so the viewer can fall back to the class token.
import { cropFrame, keyOut, remapPalette, greyscale, frameRect, validateMapping, type MapSpriteData, type PixelBuf } from "../grid/mapsprite.ts";

let data: MapSpriteData | null = null;
const sheets = new Map<string, PixelBuf | null>(); // file name -> pixels, null if it failed
const cache = new Map<string, string | null>();     // classId:side:acted:frame -> data URL

function loadSheet(file: string): Promise<PixelBuf | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      resolve({ width: id.width, height: id.height, data: id.data });
    };
    img.onerror = () => resolve(null);
    img.src = `/assets/mapsprites/${encodeURIComponent(file)}`;
  });
}

function toDataUrl(b: PixelBuf): string {
  const c = document.createElement("canvas");
  c.width = b.width; c.height = b.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.width, b.height), 0, 0);
  return c.toDataURL();
}

// Load the mapping and every sheet it references. Safe to call more than once.
export async function loadMapSprites(): Promise<void> {
  if (data) return;
  try {
    const r = await fetch("/data/mapsprites.json");
    const json = r.ok ? await r.json() : null;
    const problems = validateMapping(json);
    if (problems.length) { console.warn("mapsprites.json:", problems); return; }
    data = json as MapSpriteData;
  } catch { return; }
  const files = [...new Set(Object.values(data.classes).map((e) => e.sheet))];
  await Promise.all(files.map(async (f) => { if (!sheets.has(f)) sheets.set(f, await loadSheet(f)); }));
}

// Idle frame count for a class, or 0 when it has no usable sprite.
export function frameCount(classId: string): number {
  const e = data?.classes[classId];
  return e && sheets.get(e.sheet) ? e.frames : 0;
}

// Native pixel size of a class's frame, or null.
export function frameSize(classId: string): { w: number; h: number } | null {
  const e = data?.classes[classId];
  return e && sheets.get(e.sheet) ? { w: e.w, h: e.h } : null;
}

export function spriteUrl(classId: string, side: "player" | "enemy", acted: boolean, frame: number): string | null {
  const key = `${classId}:${side}:${acted ? 1 : 0}:${frame}`;
  if (cache.has(key)) return cache.get(key)!;
  let url: string | null = null;
  try {
    const e = data?.classes[classId];
    const sheet = e ? sheets.get(e.sheet) : null;
    if (e && sheet) {
      const r = frameRect(e, frame);
      let b = keyOut(cropFrame(sheet, r.x, r.y, r.w, r.h), e.bg);
      if (side === "enemy") b = remapPalette(b, data!.palettes.player, data!.palettes.enemy);
      if (acted) b = greyscale(b);
      url = toDataUrl(b);
    }
  } catch (err) { console.warn(`map sprite ${key}:`, err); }
  cache.set(key, url);
  return url;
}
```

- [ ] **Step 2: Check it parses** (Node strips types; the DOM globals aren't touched at import time)

Run: `node --no-warnings -e "import('./src/game/mapsprite-loader.ts').then(m => console.log(Object.keys(m).sort().join(',')))"`
Expected: `frameCount,frameSize,loadMapSprites,spriteUrl`

- [ ] **Step 3: Commit**

```bash
git add src/game/mapsprite-loader.ts
git commit -m "feat: browser loader that slices and caches map sprites"
```

---

### Task 5: sprite-mode select, map-sprite tokens and idle animation

**Files:**
- Modify: `src/game/scenario.html:40` and its `<style>`
- Modify: `src/game/scenario.ts`

- [ ] **Step 1: Replace the checkbox in `scenario.html`.** Replace line 40:

```html
    <label><input type="checkbox" id="spritemode" /> Class sprites</label>
```

with:

```html
    <label>Sprites
      <select id="spritemode">
        <option value="map" selected>Map sprite</option>
        <option value="portrait">Portrait</option>
        <option value="class">Class token</option>
      </select>
    </label>
```

and add to the `<style>` block:

```css
    image.mapsprite { image-rendering: pixelated; image-rendering: crisp-edges; }
```

- [ ] **Step 2: Imports and state in `scenario.ts`.** Add after the existing imports:

```ts
import { loadMapSprites, spriteUrl, frameCount, frameSize } from "./mapsprite-loader.ts";
```

Replace:

```ts
let spriteMode: "portrait" | "class" = "portrait"; // toggle: portrait face vs class token
```

with:

```ts
type SpriteMode = "map" | "portrait" | "class";
let spriteMode: SpriteMode = "map"; // map sprite, portrait face, or class token
// GBA-like idle bob: frame sequence and how long each step holds (ms).
const IDLE_SEQ = [0, 1, 2, 1];
const IDLE_MS = [520, 70, 520, 70];
let idleStep = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
```

- [ ] **Step 3: Map-sprite branch in `unitToken`.** Insert at the top of `unitToken`, after the `const dim = ...` line:

```ts
  if (spriteMode === "map") {
    const token = mapSpriteToken(u);
    if (token) return token;
  }
```

and add this function directly above `unitToken`:

```ts
// The unit's GBA map sprite, scaled by a whole-number factor to fit the tile width and
// bottom-aligned so tall (mounted/armored) sprites overflow upward. Null to fall back.
function mapSpriteToken(u: GridUnit): string | null {
  const size = frameSize(u.classId);
  const n = frameCount(u.classId);
  if (!size || !n) return null;
  const acted = g.acted.has(u.id);
  const frame = IDLE_SEQ[idleStep] % n;
  const href = spriteUrl(u.classId, u.side, acted, frame);
  if (!href) return null;
  const scale = Math.max(1, Math.floor(TILE / size.w));
  const w = size.w * scale, h = size.h * scale;
  const x = u.pos.x * TILE + (TILE - w) / 2, y = (u.pos.y + 1) * TILE - h;
  const cx = u.pos.x * TILE + TILE / 2, by = (u.pos.y + 1) * TILE - 2;
  return `<g pointer-events="none"><image class="mapsprite" data-sprite="${esc(u.classId)}|${u.side}|${acted ? 1 : 0}" href="${href}" x="${x}" y="${y}" width="${w}" height="${h}"/>` +
    `<rect x="${cx - 11}" y="${by - 13}" width="22" height="13" rx="3" fill="#000b"/>` +
    `<text x="${cx}" y="${by - 3}" font-size="11" fill="#fff" text-anchor="middle" font-family="system-ui" font-weight="700">${u.hp}</text></g>`;
}
```

`pointer-events="none"` keeps clicks on the board's tile math (the click handler uses coordinates, so an overflowing tall sprite must not swallow clicks meant for the tile above).

- [ ] **Step 4: Idle timer.** Add after `mapSpriteToken`:

```ts
// Advance the idle animation by swapping hrefs in place; no full re-render.
function tickIdle(): void {
  idleStep = (idleStep + 1) % IDLE_SEQ.length;
  for (const img of board.querySelectorAll<SVGImageElement>("image.mapsprite")) {
    const [classId, side, acted] = img.dataset.sprite!.split("|");
    const n = frameCount(classId);
    if (!n) continue;
    const href = spriteUrl(classId, side as "player" | "enemy", acted === "1", IDLE_SEQ[idleStep] % n);
    if (href) img.setAttribute("href", href);
  }
  idleTimer = setTimeout(tickIdle, IDLE_MS[idleStep]);
}

function syncIdleTimer(): void {
  if (spriteMode === "map" && !idleTimer) idleTimer = setTimeout(tickIdle, IDLE_MS[idleStep]);
  if (spriteMode !== "map" && idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}
```

- [ ] **Step 5: Wire the select and loading.** Replace the existing `spritemode` listener:

```ts
document.getElementById("spritemode")!.addEventListener("change", (e) => {
  spriteMode = (e.target as HTMLInputElement).checked ? "class" : "portrait";
  render();
});
```

with:

```ts
document.getElementById("spritemode")!.addEventListener("change", (e) => {
  spriteMode = (e.target as HTMLSelectElement).value as SpriteMode;
  syncIdleTimer();
  render();
});
```

and in `boot()`, load the sprites before the first render and start the timer. Replace:

```ts
  scRaw = await fetchScenario(sel2.value);
  start();
}
```

with:

```ts
  [scRaw] = await Promise.all([fetchScenario(sel2.value), loadMapSprites()]);
  start();
  syncIdleTimer();
}
```

- [ ] **Step 6: Update the file header comment** (line 1-3 of `scenario.ts`):

```ts
// Playable scenario: multiple units per side drawn as GBA map sprites (or portraits /
// class tokens). Select a unit, see its move range over terrain, move, and attack an
// enemy in range. End Turn runs the enemy AI. Inspection and the matchup forecast are
// shown in the side panel.
```

- [ ] **Step 7: Run the suite** (the viewer is browser-only, so this guards the shared code)

Run: `node --no-warnings --test`
Expected: all pass.

- [ ] **Step 8: Smoke-check fallback in the browser.** With `data/mapsprites.json` still empty, start the dev server (`.claude/launch.json` / `Play Map.cmd` serves `src/server.ts`), open `/src/game/scenario.html`. Expected: "Map sprite" is selected, every unit shows its class token (fallback), no console errors; switching to Portrait shows portraits; to Class token shows tokens.

- [ ] **Step 9: Commit**

```bash
git add src/game/scenario.ts src/game/scenario.html
git commit -m "feat: map-sprite mode with idle animation in the scenario viewer"
```

---

### Task 6: author the FE8 mapping from the sheets

**Prerequisite:** the FE8 map-sprite sheet PNGs are in `assets/mapsprites/` (the user places them, or Claude downloads them in the browser pane after confirming each file with the user). Stop and ask if the folder has no PNGs.

**Files:**
- Modify: `data/mapsprites.json`

- [ ] **Step 1: Inventory.** List the sheets and their sizes, and the class ids used by the scenarios:

Run: `ls -la assets/mapsprites/`
Run: `node -e "const fs=require('fs');const ids=new Set();for(const f of fs.readdirSync('encounters')){const e=JSON.parse(fs.readFileSync('encounters/'+f));const u=require('./data/units.json');for(const r of e.units??[e.player,e.enemy].filter(Boolean))ids.add(u[r.unit]?.class)}console.log([...ids].join(', '))"`

Map the scenario classes first, then as many other FE8 classes (keys of `assets/reference/fe8/sim-classes.json`) as the sheets cover.

- [ ] **Step 2: Find the background and team palette.** Open each sheet with the Read tool (it renders images). Read the background color from a corner pixel with a throwaway script in the scratchpad that decodes the PNG in the browser pane instead of Node (no PNG decoder dependency): navigate the browser pane to the sheet URL on the dev server and run in `javascript_tool`:

```js
const img = document.querySelector("img"); const c = document.createElement("canvas");
c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
const p = (a, b) => "#" + [...x.getImageData(a, b, 1, 1).data.slice(0, 3)].map(v => v.toString(16).padStart(2, "0")).join("");
p(0, 0)
```

For the team palette, sample the distinct non-background colors of one blue (player) sprite and the same sprite in red if the sheet includes enemy variants; otherwise use the standard GBAFE red ramp matched index-for-index to the blue ramp (darkest to lightest). Record them as `palettes.player` / `palettes.enemy`.

- [ ] **Step 3: Record crops.** For each class, find the idle frame 0 top-left, frame size and stride by zooming the sheet (`computer` `zoom` on the browser pane) and confirming with the `p(x, y)` sampler at the frame edges. Add one entry per class to `classes`.

- [ ] **Step 4: Validate**

Run: `node --no-warnings --test src/grid/mapsprite.test.ts`
Expected: all pass, including "the committed data/mapsprites.json is valid".

- [ ] **Step 5: Commit**

```bash
git add data/mapsprites.json
git commit -m "data: FE8 map-sprite crops and team palettes"
```

---

### Task 7: browser verification

- [ ] **Step 1:** Start the dev server and open `/src/game/scenario.html` in the browser pane. Screenshot.
- [ ] **Step 2:** Check, fixing anything that fails (systematic-debugging first):
  - Map-sprite mode is the default; mapped classes show sprites, crisp (pixelated), bottom-aligned, tall sprites overflowing upward.
  - Player units are blue, enemies red, with skin/hair/steel unchanged.
  - The idle bob animates (two screenshots ~0.6 s apart differ; or read `href` of an `image.mapsprite` twice via `javascript_tool`).
  - Move a unit and Wait: it turns grey.
  - Clicks still select/move/attack, including clicking a tile under a tall sprite's overflow.
  - Portrait and Class token modes still work; switching away stops the timer (no `href` changes).
  - A class missing from the mapping falls back to the class token.
  - Temporarily rename `assets/mapsprites/` away and reload: every unit falls back, no uncaught errors. Rename it back.
- [ ] **Step 3:** `node --no-warnings --test` passes. Commit any fixes with a focused message.
