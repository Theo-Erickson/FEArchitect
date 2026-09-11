// Pure timing math for the token slide animation, extracted so it can be unit
// tested. Given the elapsed time, it returns the pixel offset (relative to the
// unit's start tile `from`) and whether the slide is complete.
//
// Elapsed is clamped to >= 0 on purpose: a requestAnimationFrame callback can be
// invoked with a timestamp slightly earlier than a performance.now() captured
// just before scheduling it, which would otherwise produce a negative elapsed, a
// segment index of -1, and an out-of-bounds path lookup that crashes the loop.
import type { TileVec } from "./types.ts";

export interface Offset {
  x: number;
  y: number;
  done: boolean;
}

export function pathOffsetAt(
  path: TileVec[], from: TileVec, elapsedMs: number, stepMs: number, tile: number,
): Offset {
  const last = path[path.length - 1];
  const offsetTo = (t: TileVec): Offset => ({ x: (t.x - from.x) * tile, y: (t.y - from.y) * tile, done: false });

  if (path.length < 2) return { x: (last.x - from.x) * tile, y: (last.y - from.y) * tile, done: true };

  const e = Math.max(0, elapsedMs);
  const seg = Math.floor(e / stepMs);
  if (seg >= path.length - 1) {
    return { x: (last.x - from.x) * tile, y: (last.y - from.y) * tile, done: true };
  }
  const tSeg = (e - seg * stepMs) / stepMs;
  const a = path[seg], b = path[seg + 1];
  const o = offsetTo(a);
  o.x = ((a.x + (b.x - a.x) * tSeg) - from.x) * tile;
  o.y = ((a.y + (b.y - a.y) * tSeg) - from.y) * tile;
  return o;
}
