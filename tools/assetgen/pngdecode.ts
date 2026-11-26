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
