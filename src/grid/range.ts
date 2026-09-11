// Small shared helpers for range and distance, used by ai.ts and game.ts.
import type { WeaponDef } from "../types.ts";
import type { TileVec } from "./types.ts";

export function weaponRange(w: WeaponDef): number {
  return w.range ?? 1;
}

export function manhattan(a: TileVec, b: TileVec): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
