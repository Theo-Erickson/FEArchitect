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
