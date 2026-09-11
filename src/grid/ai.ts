// Decide a unit's action for a phase: attack a target in range, otherwise (for
// aggressive AI) move to the cheapest tile adjacent to the target and attack, or
// approach as far as possible. Stationary AI never moves. Pure and deterministic.
import type { GridEncounter, GridUnit, TileVec } from "./types.ts";
import { computeReachable, findPath, tileKey } from "./movement.ts";
import { weaponRange, manhattan } from "./range.ts";

export interface AiAction {
  to: TileVec;                    // where the unit should end up (may equal its current tile)
  attackTargetId: string | null; // whom to attack after moving, or null
}

function other(enc: GridEncounter, unitId: string): GridUnit {
  return enc.player.id === unitId ? enc.enemy : enc.player;
}
function self(enc: GridEncounter, unitId: string): GridUnit {
  return enc.player.id === unitId ? enc.player : enc.enemy;
}

export function decideAction(enc: GridEncounter, unitId: string): AiAction {
  const me = self(enc, unitId);
  const target = other(enc, unitId);
  const range = weaponRange(me.weapon);

  // Already in range from the current tile?
  if (manhattan(me.pos, target.pos) <= range) {
    return { to: me.pos, attackTargetId: target.id };
  }
  if (me.ai === "stationary") {
    return { to: me.pos, attackTargetId: null };
  }

  const blocked = new Set<string>([tileKey(target.pos)]);
  const opts = { movementType: me.cls.movementType, move: me.cls.move, from: me.pos };
  const { tiles } = computeReachable(enc.map, enc.terrainDefs, opts, blocked);

  // Prefer the cheapest reachable tile from which the target is in range.
  let best: { to: TileVec; cost: number } | null = null;
  for (const key of tiles) {
    const [x, y] = key.split(",").map(Number);
    const tile = { x, y };
    if (manhattan(tile, target.pos) <= range) {
      const p = findPath(enc.map, enc.terrainDefs, opts, tile, blocked);
      if (p && (!best || p.cost < best.cost)) best = { to: tile, cost: p.cost };
    }
  }
  if (best) return { to: best.to, attackTargetId: target.id };

  // Cannot reach striking distance: approach along the cheapest path to any tile
  // adjacent to the target, truncated to the movement budget.
  const approach = approachTile(enc, me, target, blocked);
  return { to: approach, attackTargetId: null };
}

function approachTile(enc: GridEncounter, me: GridUnit, target: GridUnit, blocked: Set<string>): TileVec {
  // Full-cost path to the cheapest tile within range of the target, ignoring budget.
  const opts = { movementType: me.cls.movementType, move: Infinity, from: me.pos };
  const range = weaponRange(me.weapon);
  const adj: TileVec[] = [];
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d === 0 || d > range) continue;
      adj.push({ x: target.pos.x + dx, y: target.pos.y + dy });
    }
  }
  let bestPath: TileVec[] | null = null;
  let bestCost = Infinity;
  for (const t of adj) {
    const p = findPath(enc.map, enc.terrainDefs, opts, t, blocked);
    if (p && p.cost < bestCost) { bestCost = p.cost; bestPath = p.path; }
  }
  if (!bestPath) return me.pos; // fully cut off: hold

  // Walk along the path spending at most the movement budget.
  let spent = 0;
  let landing = me.pos;
  for (let i = 1; i < bestPath.length; i++) {
    const step = enterStep(enc, me, bestPath[i]);
    if (step == null || spent + step > me.cls.move) break;
    spent += step;
    landing = bestPath[i];
  }
  return landing;
}

function enterStep(enc: GridEncounter, me: GridUnit, t: TileVec): number | null {
  const id = enc.map.terrain[t.y][t.x];
  return enc.terrainDefs[id].moveCost[me.cls.movementType];
}
