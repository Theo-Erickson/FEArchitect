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

test("readZip fails cleanly on a truncated central directory or bad local offset", () => {
  const zip = makeZip([{ name: "FE 8/a.png", data: new Uint8Array([1, 2, 3]), method: 0 }]);
  const dv = new DataView(zip.buffer);
  const eocd = zip.length - 22;
  const badCd = zip.slice(); new DataView(badCd.buffer).setUint32(eocd + 16, zip.length - 30, true); // CD offset into the EOCD
  assert.throws(() => readZip(badCd), /corrupt zip central directory/);
  const cdStart = dv.getUint32(eocd + 16, true);
  const badLocal = zip.slice(); new DataView(badLocal.buffer).setUint32(cdStart + 42, 0x7fffffff, true); // local header far past the end
  const [e] = readZip(badLocal);
  assert.throws(() => e.read());
});
