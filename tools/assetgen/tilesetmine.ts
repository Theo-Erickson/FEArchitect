// Pure mining for the terrain tileset index. A fan sheet holds ROM chip p + 1 at
// row-major position p (32 per row, 16x16 px each). Chapters are matched to a sheet by
// pixel comparison, then each cell's chip is counted under its terrain context so the
// viewer can pick the chip FE8 itself used next to the same neighbours.
import type { RgbaImage } from "./pngdecode.ts";

export const CHIP = 16, SHEET_COLS = 32, SHEET_CHIPS = 1024;

// A 16x16 block as a string key, comparing colours at 5 bits per channel (the GBA's
// depth), so 8-bit expansion differences between rippers do not matter.
export function chipKeyAt(img: RgbaImage, px: number, py: number): string {
  const codes: number[] = [];
  for (let y = 0; y < CHIP; y++) for (let x = 0; x < CHIP; x++) {
    const o = ((py + y) * img.width + px + x) * 4;
    codes.push(((img.rgba[o] >> 3) << 10) | ((img.rgba[o + 1] >> 3) << 5) | (img.rgba[o + 2] >> 3));
  }
  return String.fromCharCode(...codes);
}

export function sheetKeys(sheet: RgbaImage): string[] {
  const keys: string[] = [];
  for (let p = 0; p < SHEET_CHIPS; p++) keys.push(chipKeyAt(sheet, (p % SHEET_COLS) * CHIP, Math.floor(p / SHEET_COLS) * CHIP));
  return keys;
}

// Share of chapter cells whose pixels equal the sheet chip at position chip - 1.
export function matchScore(keys: string[], chapter: RgbaImage, chips: number[][]): number {
  let hit = 0, n = 0;
  for (let y = 0; y < chips.length; y++) for (let x = 0; x < chips[y].length; x++) {
    n++;
    const p = chips[y][x] - 1;
    if (p >= 0 && p < keys.length && keys[p] === chipKeyAt(chapter, x * CHIP, y * CHIP)) hit++;
  }
  return n ? hit / n : 0;
}

// "t,n,e,s,w": the cell's terrain and its four neighbours', -1 off-map.
export function contextKey(terrain: number[][], x: number, y: number): string {
  const at = (xx: number, yy: number) => (yy < 0 || yy >= terrain.length || xx < 0 || xx >= terrain[yy].length ? -1 : terrain[yy][xx]);
  return [at(x, y), at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)].join(",");
}

export interface SheetAcc {
  contexts: Map<string, Map<number, number>>;
  freq: Map<number, Map<number, number>>;
  chapters: number[];
  terrains: Set<number>;
}

export function newAcc(): SheetAcc {
  return { contexts: new Map(), freq: new Map(), chapters: [], terrains: new Set() };
}

function bump<K>(m: Map<K, Map<number, number>>, k: K, p: number): void {
  let inner = m.get(k);
  if (!inner) { inner = new Map(); m.set(k, inner); }
  inner.set(p, (inner.get(p) ?? 0) + 1);
}

// chips[y][x] = ROM chip index, terrain[y][x] = FE8 terrain id, for one chapter.
export function mineChapter(acc: SheetAcc, chips: number[][], terrain: number[][], chapter: number): void {
  acc.chapters.push(chapter);
  for (let y = 0; y < chips.length; y++) for (let x = 0; x < chips[y].length; x++) {
    const p = chips[y][x] - 1;
    if (p < 0) continue; // ROM chip 0 is not on the sheet
    const t = terrain[y][x];
    acc.terrains.add(t);
    bump(acc.contexts, contextKey(terrain, x, y), p);
    bump(acc.freq, t, p);
  }
}

export type ChipCounts = [number, number][]; // [sheet position, count], count descending

export interface SheetData {
  contexts: Record<string, ChipCounts>;
  freq: Record<string, ChipCounts>;
}

function sorted(m: Map<number, number>): ChipCounts {
  return [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

export function serialiseSheet(acc: SheetAcc): SheetData {
  const contexts: Record<string, ChipCounts> = {};
  for (const k of [...acc.contexts.keys()].sort()) contexts[k] = sorted(acc.contexts.get(k)!);
  const freq: Record<string, ChipCounts> = {};
  for (const t of [...acc.freq.keys()].sort((a, b) => a - b)) freq[String(t)] = sorted(acc.freq.get(t)!);
  return { contexts, freq };
}
