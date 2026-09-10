// Terrain lookups over a set of terrain definitions.
import type { TerrainDef, MovementType, TerrainMod } from "./types.ts";

function def(defs: Record<string, TerrainDef>, id: string): TerrainDef {
  const d = defs[id];
  if (!d) throw new Error(`unknown terrain id: ${id}`);
  return d;
}

// Cost to enter a tile of the given terrain with the given movement type, or
// null if impassable to that type.
export function enterCost(
  defs: Record<string, TerrainDef>, id: string, type: MovementType,
): number | null {
  return def(defs, id).moveCost[type];
}

export function isPassable(
  defs: Record<string, TerrainDef>, id: string, type: MovementType,
): boolean {
  return enterCost(defs, id, type) != null;
}

export function terrainMod(defs: Record<string, TerrainDef>, id: string): TerrainMod {
  const d = def(defs, id);
  return { avoid: d.avoid, def: d.def };
}
