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

// Largest entry we will inflate (a 512x512 RGBA sheet is ~1 MB); guards against zip bombs.
export const MAX_ENTRY_BYTES = 32 << 20;
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
        if (method === 8) return new Uint8Array(inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }));
        throw new Error(`unsupported compression method ${method}: ${name}`);
      },
    });
  }
  return out;
}
