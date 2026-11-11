// Tiny in-memory fixtures for pure grid tests: a 4x2 map with plains, a forest, and a
// wall, two classes, two flat units, and two weapons. tiny(units) resolves a scenario.
import { resolveScenario } from "./resolve.ts";
import type { ResolvedScenario } from "./types.ts";

export const TK_TERRAIN: any = {
  plains: { name: "Plains", avoid: 0, def: 0, res: 0, heal: 0, moveCost: { foot: 1, cav: 1, fly: 1 } },
  forest: { name: "Forest", avoid: 20, def: 1, res: 0, heal: 0, moveCost: { foot: 2, cav: 3, fly: 1 } },
  wall: { name: "Wall", avoid: 0, def: 0, res: 0, heal: 0, moveCost: { foot: null, cav: null, fly: null } },
};

// Row 0: plains, plains, forest, wall. Row 1: all plains.
export const TK_MAP: any = { id: "tiny", legend: { ".": "plains", f: "forest", "#": "wall" }, tiles: ["..f#", "...."] };

export const TK_CLASSES: any = {
  infantry: { name: "Infantry", movementType: "foot", move: 5 },
  knight: { name: "Knight", movementType: "foot", move: 4, weaponRanks: { lance: "C" } },
};

export const TK_UNITS: any = {
  hero: { name: "Hero", class: "infantry", hp: 20, str: 6, mag: 0, skl: 7, spd: 8, lck: 5, def: 4, res: 2, con: 7 },
  grunt: { name: "Grunt", class: "knight", hp: 18, str: 5, mag: 0, skl: 3, spd: 2, lck: 0, def: 7, res: 0, con: 12 },
};

export const TK_WEAPONS: any = {
  "iron-sword": { name: "Iron Sword", type: "sword", rank: "E", might: 5, hit: 90, crit: 0, weight: 5 },
  "iron-lance": { name: "Iron Lance", type: "lance", rank: "E", might: 7, hit: 80, crit: 0, weight: 8 },
};

export function tiny(units: any[]): ResolvedScenario {
  return resolveScenario({ id: "t", map: "tiny", units }, TK_UNITS, TK_WEAPONS, TK_TERRAIN, TK_CLASSES, TK_MAP);
}
