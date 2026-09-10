// Grid movement: reachable-tile computation and least-cost pathfinding, both
// via Dijkstra over per-movement-type terrain costs. Pure and deterministic.
import type { TerrainDef, ResolvedMap, MovementType, TileVec } from "./types.ts";
import { enterCost } from "./terrain.ts";

export function tileKey(t: TileVec): string {
  return `${t.x},${t.y}`;
}

export interface MoveOpts {
  movementType: MovementType;
  move: number;       // budget; pass Infinity for pathfinding regardless of range
  from: TileVec;
}

const DIRS: TileVec[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

function inBounds(map: ResolvedMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

// Least-cost distance from `from` to every reachable tile within `move`, plus
// predecessors for path reconstruction. Tiles in `blocked` cannot be entered.
function dijkstra(
  map: ResolvedMap, defs: Record<string, TerrainDef>, opts: MoveOpts, blocked: Set<string>,
): { cost: Map<string, number>; prev: Map<string, TileVec> } {
  const cost = new Map<string, number>();
  const prev = new Map<string, TileVec>();
  const startKey = tileKey(opts.from);
  cost.set(startKey, 0);
  // Small binary-heap-free priority queue: fine for these map sizes.
  const frontier: { t: TileVec; c: number }[] = [{ t: opts.from, c: 0 }];
  while (frontier.length) {
    frontier.sort((a, b) => a.c - b.c);
    const cur = frontier.shift()!;
    if (cur.c > (cost.get(tileKey(cur.t)) ?? Infinity)) continue;
    for (const d of DIRS) {
      const nx = cur.t.x + d.x, ny = cur.t.y + d.y;
      if (!inBounds(map, nx, ny)) continue;
      const key = `${nx},${ny}`;
      if (blocked.has(key)) continue;
      const step = enterCost(defs, map.terrain[ny][nx], opts.movementType);
      if (step == null) continue;
      const nc = cur.c + step;
      if (nc <= opts.move && nc < (cost.get(key) ?? Infinity)) {
        cost.set(key, nc);
        prev.set(key, cur.t);
        frontier.push({ t: { x: nx, y: ny }, c: nc });
      }
    }
  }
  return { cost, prev };
}

// The set of tiles reachable within budget, with their costs.
export function computeReachable(
  map: ResolvedMap, defs: Record<string, TerrainDef>, opts: MoveOpts, blocked: Set<string>,
): { tiles: Set<string>; costs: Map<string, number> } {
  const { cost } = dijkstra(map, defs, opts, blocked);
  return { tiles: new Set(cost.keys()), costs: cost };
}

export interface PathResult {
  path: TileVec[]; // from start tile to destination, inclusive
  cost: number;
}

// Least-cost path to `to`, or null if unreachable within `opts.move` or blocked.
export function findPath(
  map: ResolvedMap, defs: Record<string, TerrainDef>, opts: MoveOpts, to: TileVec, blocked: Set<string>,
): PathResult | null {
  const toKey = tileKey(to);
  if (blocked.has(toKey)) return null;
  const { cost, prev } = dijkstra(map, defs, opts, blocked);
  if (!cost.has(toKey)) return null;
  const path: TileVec[] = [];
  let cur: TileVec | undefined = to;
  while (cur) {
    path.unshift(cur);
    if (tileKey(cur) === tileKey(opts.from)) break;
    cur = prev.get(tileKey(cur));
  }
  return { path, cost: cost.get(toKey)! };
}
