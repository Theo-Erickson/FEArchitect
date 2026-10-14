// A simple deterministic aggressive enemy AI for the multi-unit engine. It reuses the
// engine's reachable tiles, so it respects terrain and blocking. See the tactical play spec.
import type { TileVec } from "./types.ts";
import { type MultiGame, unitById, reachableTilesFor } from "./multigame.ts";
import { weaponRange, manhattan } from "./range.ts";

export function decideMultiAction(g: MultiGame, id: string): { to: TileVec; attackTargetId: string | null } {
  const me = unitById(g, id);
  if (!me) return { to: { x: 0, y: 0 }, attackTargetId: null };
  const foes = g.units.filter((u) => u.side !== me.side);
  if (foes.length === 0) return { to: me.pos, attackTargetId: null };

  const nearestFrom = (p: TileVec) => foes.slice().sort((a, b) => manhattan(p, a.pos) - manhattan(p, b.pos) || a.hp - b.hp)[0];

  const reach = weaponRange(me.weapon);
  const inRangeNow = foes.filter((f) => manhattan(me.pos, f.pos) <= reach);
  if (inRangeNow.length) {
    const t = inRangeNow.sort((a, b) => manhattan(me.pos, a.pos) - manhattan(me.pos, b.pos) || a.hp - b.hp)[0];
    return { to: me.pos, attackTargetId: t.id };
  }
  if (me.ai === "stationary") return { to: me.pos, attackTargetId: null };

  // Evaluate the unit's movement regardless of the current phase, with no side effects.
  const reachable = reachableTilesFor(g, id);
  let best: { to: TileVec; target: string; dist: number } | null = null;
  for (const key of reachable) {
    const [x, y] = key.split(",").map(Number);
    for (const f of foes) {
      const d = manhattan({ x, y }, f.pos);
      if (d <= reach && (!best || d < best.dist)) best = { to: { x, y }, target: f.id, dist: d };
    }
  }
  if (best) return { to: best.to, attackTargetId: best.target };

  const target = nearestFrom(me.pos);
  let step = me.pos;
  let bestDist = manhattan(me.pos, target.pos);
  for (const key of reachable) {
    const [x, y] = key.split(",").map(Number);
    const d = manhattan({ x, y }, target.pos);
    if (d < bestDist) { bestDist = d; step = { x, y }; }
  }
  return { to: step, attackTargetId: null };
}
