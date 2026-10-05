import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { encodePng } from "./pngencode.ts";

// Decode just enough of our own PNG to prove the pixels survive: read IHDR, collect
// IDAT, inflate, and strip the per-row filter byte (we only ever write filter 0).
function decode(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let o = 8, width = 0, height = 0;
  const idat: Uint8Array[] = [];
  while (o < png.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7]);
    const data = png.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { width = dv.getUint32(o + 8); height = dv.getUint32(o + 12); }
    if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const merged = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let m = 0;
  for (const d of idat) { merged.set(d, m); m += d.length; }
  const raw = new Uint8Array(inflateSync(merged));
  const stride = width * 4;
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    rgba.set(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride), y * stride);
  }
  return { width, height, rgba };
}

test("encodePng round-trips a small RGBA image", () => {
  const rgba = Uint8Array.from([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 255, 255,
  ]);
  const png = encodePng(rgba, 2, 2);
  const back = decode(png);
  assert.equal(back.width, 2);
  assert.equal(back.height, 2);
  assert.deepEqual([...back.rgba], [...rgba]);
});
