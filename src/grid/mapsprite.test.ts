import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { cropFrame, keyOut, remapPalette, greyscale, frameRect, hexToRgb, validateMapping, type PixelBuf } from "./mapsprite.ts";

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
