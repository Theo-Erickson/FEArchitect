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

// The terrain bonus a unit of the given movement type gets on a tile. Flying units
// use FE8's fly bonuses (usually 0); everyone else uses the ground bonuses. res is
// carried for the magic combat path. Missing fly/res fields fall back to 0.
export function terrainMod(
  defs: Record<string, TerrainDef>, id: string, type: MovementType = "foot",
): TerrainMod {
  const d = def(defs, id);
  if (type === "fly") {
    return { avoid: d.flyAvoid ?? 0, def: d.flyDef ?? 0, res: d.flyRes ?? 0 };
  }
  return { avoid: d.avoid, def: d.def, res: d.res ?? 0 };
}
