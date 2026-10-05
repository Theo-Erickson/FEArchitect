import { test } from "node:test";
import assert from "node:assert/strict";
import { composeMap } from "./mapcompose.ts";

// Two 8x8 tiles in 4bpp (32 bytes each). Tile 0: every pixel color index 1.
// Tile 1: x=0 column color index 2, the rest index 1, so a flip is detectable.
function makeTiles(): Uint8Array {
  const t = new Uint8Array(64);
  for (let i = 0; i < 32; i++) t[i] = 0x11; // tile 0: all nibbles 1
  for (let row = 0; row < 8; row++) {
    t[32 + row * 4] = 0x12; // tile 1: x0 = 2, x1 = 1
    for (let b = 1; b < 4; b++) t[32 + row * 4 + b] = 0x11;
  }
  return t;
}

// Palette bank 0: index1 red, index2 green.
function makePalette(): Uint8Array {
  const p = new Uint8Array(16 * 4);
  p.set([255, 0, 0, 255], 1 * 4);
  p.set([0, 255, 0, 255], 2 * 4);
  return p;
}

test("composeMap builds one 16x16 chip from four tiles at a TSA offset", () => {
  // layout cell -> TSA offset 0; TSA at offset 0..3 all tile 0, no flip, bank 0.
  const tsa = Uint16Array.from([0, 0, 0, 0]);
  const out = composeMap({ widthChips: 1, heightChips: 1, layout: Uint16Array.from([0]), tsa, tiles: makeTiles(), palette: makePalette() });
  assert.equal(out.width, 16);
  assert.equal(out.height, 16);
  assert.deepEqual([...out.rgba.subarray(0, 4)], [255, 0, 0, 255]); // tile 0 -> red
});

test("composeMap indexes the TSA by the cell's offset and honors hflip", () => {
  const tiles = makeTiles();
  const palette = makePalette();
  // Two chips worth of TSA: offset 0 uses tile 1 (green left column) top-left.
  const tsa = Uint16Array.from([1, 0, 0, 0, /* offset 4 unused */ 0, 0, 0, 0]);
  const noflip = composeMap({ widthChips: 1, heightChips: 1, layout: Uint16Array.from([0]), tsa, tiles, palette });
  assert.deepEqual([...noflip.rgba.subarray(0, 4)], [0, 255, 0, 255]); // x0 green

  const tsaFlip = Uint16Array.from([(1 << 10) | 1, 0, 0, 0]);
  const hflip = composeMap({ widthChips: 1, heightChips: 1, layout: Uint16Array.from([0]), tsa: tsaFlip, tiles, palette });
  assert.deepEqual([...hflip.rgba.subarray(0, 4)], [255, 0, 0, 255]);       // x0 now red
  assert.deepEqual([...hflip.rgba.subarray(7 * 4, 7 * 4 + 4)], [0, 255, 0, 255]); // x7 green
});

test("composeMap uses the palette bank from the TSA entry", () => {
  const tiles = makeTiles();
  // Bank 1 index 1 = blue.
  const palette = new Uint8Array(32 * 4);
  palette.set([0, 0, 255, 255], (16 + 1) * 4);
  const tsa = Uint16Array.from([(1 << 12) | 0, (1 << 12) | 0, (1 << 12) | 0, (1 << 12) | 0]); // tile 0, bank 1
  const out = composeMap({ widthChips: 1, heightChips: 1, layout: Uint16Array.from([0]), tsa, tiles, palette });
  assert.deepEqual([...out.rgba.subarray(0, 4)], [0, 0, 255, 255]);
});
