// Pick an FE8 map chip for every tile of a custom map from a mined sheet index (see
// tools/assetgen/tilesetmine.ts). Pure and deterministic: the same map and sheet always
// give the same chips. Positions are sheet positions (ROM chip - 1); null means "no
// chip, keep the SVG placeholder for this tile".
import type { ResolvedMap, TerrainDef } from "./types.ts";
import { vary } from "./render.ts";

export type ChipCounts = [number, number][]; // [sheet position, count], count descending

export interface SheetData {
  terrains: number[];                  // FE8 terrain ids with mined chips on this sheet
  contexts: Record<string, ChipCounts>; // "t,n,e,s,w" (-1 = off-map) -> chips
  freq: Record<string, ChipCounts>;     // terrain id -> chips
}

const CHIP = 16, SHEET_COLS = 32, MIN_PARTIAL = 2;

export function chipSource(p: number): { sx: number; sy: number } {
  return { sx: (p % SHEET_COLS) * CHIP, sy: Math.floor(p / SHEET_COLS) * CHIP };
}

export function fe8IdFor(def: TerrainDef | undefined, terrains: number[]): number | null {
  for (const id of def?.fe8 ?? []) if (terrains.includes(id)) return id;
  return null;
}

// Among chips with at least half the top count, pick one by a coordinate hash,
// weighted by how often FE8 used each, so rare variants stay rare.
function pick(list: ChipCounts, x: number, y: number): number {
  const top = list[0][1];
  const keep = list.filter(([, c]) => c * 2 >= top);
  let r = vary(x, y, 17) * keep.reduce((a, c) => a + c[1], 0);
  for (const [p, c] of keep) { if (r < c) return p; r -= c; }
  return keep[keep.length - 1][0];
}

export function chooseChips(map: ResolvedMap, defs: Record<string, TerrainDef>, sheet: SheetData): (number | null)[][] {
  const ids = map.terrain.map((row) => row.map((t) => fe8IdFor(defs[t], sheet.terrains)));
  const at = (x: number, y: number) => (y < 0 || y >= map.height || x < 0 || x >= map.width ? -1 : ids[y][x] ?? -1);
  // Contexts grouped by centre terrain, for the partial-match step.
  const byCentre = new Map<number, { nb: number[]; list: ChipCounts; total: number; key: string }[]>();
  for (const [key, list] of Object.entries(sheet.contexts)) {
    const [t, ...nb] = key.split(",").map(Number);
    const arr = byCentre.get(t) ?? [];
    arr.push({ nb, list, total: list.reduce((a, c) => a + c[1], 0), key });
    byCentre.set(t, arr);
  }

  return ids.map((row, y) => row.map((t, x) => {
    if (t == null) return null;
    const nb = [at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)];
    // Map edges first count as more of the same terrain: real chapter borders are
    // noisy (roads, sand, cliffs run off-map), so the literal edge context misleads.
    const nbSelf = nb.map((v) => (v === -1 ? t : v));
    let list = sheet.contexts[[t, ...nbSelf].join(",")];
    if (!list?.length) list = sheet.contexts[[t, ...nb].join(",")];
    if (!list?.length) {
      let best: { score: number; total: number; key: string; list: ChipCounts } | null = null;
      for (const c of byCentre.get(t) ?? []) {
        const score = c.nb.reduce((a, v, i) => a + (v === nbSelf[i] ? 1 : 0), 0);
        if (score < MIN_PARTIAL || !c.list.length) continue;
        if (!best || score > best.score || (score === best.score && (c.total > best.total || (c.total === best.total && c.key < best.key)))) {
          best = { score, total: c.total, key: c.key, list: c.list };
        }
      }
      list = best?.list ?? sheet.freq[String(t)];
    }
    return list?.length ? pick(list, x, y) : null;
  }));
}
