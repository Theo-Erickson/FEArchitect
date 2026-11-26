// Browser glue for real terrain tiles: loads the tileset index and a sheet, runs the
// pure chip picker, and composes the chosen chips onto a canvas at 16 px per tile.
// Every failure resolves to null so the viewers keep their SVG terrain.
import { chooseChips, chipSource, type SheetData } from "../grid/tiles.ts";
import type { ResolvedMap, TerrainDef } from "../grid/types.ts";

export interface SheetInfo { name: string; file: string; data: string; chapters: number[]; terrains: number[] }
export interface Backdrop { href: string; covered: boolean[][] }

export const DEFAULT_SHEET = "Overworld Regular";
const BASE = "/assets/tilesets/fe8/";
const CHIP = 16;

let indexP: Promise<SheetInfo[] | null> | null = null;

export function loadTilesetIndex(): Promise<SheetInfo[] | null> {
  indexP ??= fetch(BASE + "index.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (Array.isArray(j?.sheets) && j.sheets.length ? (j.sheets as SheetInfo[]) : null))
    .catch(() => null);
  return indexP;
}

// The wanted sheet if indexed, else the default, else the first one.
export function pickSheet(sheets: SheetInfo[], wanted?: string): SheetInfo | null {
  return sheets.find((s) => s.name === wanted) ?? sheets.find((s) => s.name === DEFAULT_SHEET) ?? sheets[0] ?? null;
}

const sheetCache = new Map<string, Promise<{ data: SheetData; img: HTMLImageElement } | null>>();

function loadSheet(info: SheetInfo): Promise<{ data: SheetData; img: HTMLImageElement } | null> {
  let p = sheetCache.get(info.name);
  if (!p) {
    p = Promise.all([
      fetch(BASE + info.data).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText)))),
      new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = BASE + info.file; }),
    ])
      .then(([j, img]) => ({ data: { terrains: info.terrains, contexts: j.contexts ?? {}, freq: j.freq ?? {} }, img }))
      .catch(() => null);
    sheetCache.set(info.name, p);
  }
  return p;
}

const backdropCache = new Map<string, Promise<Backdrop | null>>();

export function tileBackdrop(map: ResolvedMap, defs: Record<string, TerrainDef>, info: SheetInfo): Promise<Backdrop | null> {
  const key = `${map.id}|${info.name}`;
  let p = backdropCache.get(key);
  if (!p) {
    p = loadSheet(info).then((sheet) => {
      if (!sheet) return null;
      const chips = chooseChips(map, defs, sheet.data);
      const canvas = document.createElement("canvas");
      canvas.width = map.width * CHIP; canvas.height = map.height * CHIP;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = false;
      const covered = chips.map((row, y) => row.map((p, x) => {
        if (p == null) return false;
        const { sx, sy } = chipSource(p);
        ctx.drawImage(sheet.img, sx, sy, CHIP, CHIP, x * CHIP, y * CHIP, CHIP, CHIP);
        return true;
      }));
      if (!covered.some((row) => row.some(Boolean))) return null;
      return { href: canvas.toDataURL("image/png"), covered };
    }).catch(() => null);
    backdropCache.set(key, p);
  }
  return p;
}
