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
