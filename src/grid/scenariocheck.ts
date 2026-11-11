// Pure placement checks for a resolved scenario. Errors block an MCP write; warnings
// are shown but allowed. Unknown references are caught earlier by resolveScenario.
import type { ResolvedScenario } from "./types.ts";

export interface Problem {
  level: "error" | "warning";
  unitId?: string;
  message: string;
}

export function errorsOf(problems: Problem[]): Problem[] {
  return problems.filter((p) => p.level === "error");
}

export function checkScenario(sc: ResolvedScenario): Problem[] {
  const out: Problem[] = [];
  const { width, height } = sc.map;

  const idCounts = new Map<string, number>();
  for (const u of sc.units) idCounts.set(u.id, (idCounts.get(u.id) ?? 0) + 1);
  for (const [id, n] of idCounts) {
    if (n > 1) out.push({ level: "error", unitId: id, message: `${n} placements share the id ${id}` });
  }

  const onTile = new Map<string, string[]>();
  for (const u of sc.units) {
    const { x, y } = u.pos;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      out.push({ level: "error", unitId: u.id, message: `${u.id} at [${x},${y}] is off the ${width}x${height} map` });
      continue;
    }
    const terrainId = sc.map.terrain[y][x];
    const def = sc.terrainDefs[terrainId];
    const mt = u.cls.movementType;
    if (def?.moveCost?.[mt] == null) {
      out.push({ level: "error", unitId: u.id, message: `${u.id} at [${x},${y}] is on ${def?.name ?? terrainId}, impassable for ${mt} units` });
    }
    const key = `${x},${y}`;
    onTile.set(key, [...(onTile.get(key) ?? []), u.id]);
    const ranks = u.cls.weaponRanks;
    if (ranks && !(u.weapon.type in ranks)) {
      out.push({
        level: "warning", unitId: u.id,
        message: `${u.id}'s ${u.weapon.name} (${u.weapon.type}) is not in ${u.cls.name}'s weapon ranks (${Object.keys(ranks).join(", ")})`,
      });
    }
  }
  for (const [key, ids] of onTile) {
    if (ids.length > 1) out.push({ level: "error", message: `${ids.length} units on [${key}]: ${ids.join(", ")}` });
  }

  for (const side of ["player", "enemy"] as const) {
    if (!sc.units.some((u) => u.side === side)) out.push({ level: "error", message: `the ${side} side has no units` });
  }
  return out;
}
