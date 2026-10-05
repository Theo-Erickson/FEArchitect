import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePalette, parseLayout, parseTsa } from "./maptiles.ts";

test("parsePalette reads JASC-PAL 'R G B' lines into opaque RGBA", () => {
  const jasc = "JASC-PAL\r\n0100\r\n2\r\n255 255 255\r\n255 0 0\r\n";
  const rgba = parsePalette(jasc);
  assert.deepEqual([...rgba.subarray(0, 4)], [255, 255, 255, 255]);
  assert.deepEqual([...rgba.subarray(4, 8)], [255, 0, 0, 255]);
});

test("parseLayout reads u16 cells and shifts right 3 to get TSA offsets", () => {
  // Two cells: stored 0x7A00 (31232) and 8; >>3 = 3904 and 1.
  const blob = new Uint8Array(4);
  const dv = new DataView(blob.buffer);
  dv.setUint16(0, 31232, true);
  dv.setUint16(2, 8, true);
  const layout = parseLayout(blob, 2, 1);
  assert.deepEqual([...layout], [3904, 1]);
});

test("parseTsa returns the TSA u16 entries, capped at the 0x1000 graphics region", () => {
  // 9216-byte config: first 8192 bytes are 4096 TSA u16, rest is terrain.
  const blob = new Uint8Array(9216);
  const dv = new DataView(blob.buffer);
  dv.setUint16(0, 0x1234, true);
  dv.setUint16(8190, 0xabcd, true); // last TSA entry (index 4095)
  dv.setUint16(8192, 0xffff, true); // terrain region, must be excluded
  const tsa = parseTsa(blob);
  assert.equal(tsa.length, 4096);
  assert.equal(tsa[0], 0x1234);
  assert.equal(tsa[4095], 0xabcd);
});
