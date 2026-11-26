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
