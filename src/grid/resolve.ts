// Pure grid resolving: validate and combine already-parsed JSON (units, weapons,
// terrain, classes, map, encounter) into a GridEncounter. No node imports, so
// both the Node loader and the browser client can use it.
import type {
  TerrainDef, ClassDef, ResolvedMap, GridEncounter, GridUnit, MovementType, AiKind, Side,
} from "./types.ts";
import type { UnitDef, WeaponDef } from "../types.ts";

const MOVEMENT_TYPES: MovementType[] = ["foot", "cav", "fly"];

export function validateTerrainDefs(raw: any): Record<string, TerrainDef> {
  const out: Record<string, TerrainDef> = {};
  for (const [id, d] of Object.entries<any>(raw)) {
    if (typeof d?.name !== "string") throw new Error(`Terrain ${id} missing name`);
    if (!d.moveCost) throw new Error(`Terrain ${id} missing moveCost`);
    for (const mt of MOVEMENT_TYPES) {
      const c = d.moveCost[mt];
      if (!(c === null || typeof c === "number")) throw new Error(`Terrain ${id} moveCost.${mt} must be number or null`);
    }
    if (typeof d.avoid !== "number" || typeof d.def !== "number") throw new Error(`Terrain ${id} needs numeric avoid and def`);
    out[id] = d as TerrainDef;
  }
  return out;
}

export function validateClasses(raw: any): Record<string, ClassDef> {
  const out: Record<string, ClassDef> = {};
  for (const [id, c] of Object.entries<any>(raw)) {
    if (typeof c?.name !== "string") throw new Error(`Class ${id} missing name`);
    if (!MOVEMENT_TYPES.includes(c.movementType)) throw new Error(`Class ${id} invalid movementType: ${c.movementType}`);
    if (typeof c.move !== "number") throw new Error(`Class ${id} missing numeric move`);
    out[id] = c as ClassDef;
  }
  return out;
}

export function resolveMap(raw: any, terrainDefs: Record<string, TerrainDef>): ResolvedMap {
  if (!Array.isArray(raw?.tiles) || raw.tiles.length === 0) throw new Error(`Map ${raw?.id} has no tiles`);
  const legend: Record<string, string> = raw.legend ?? {};
  const width = raw.tiles[0].length;
  const terrain: string[][] = raw.tiles.map((row: string, y: number) => {
    if (row.length !== width) throw new Error(`Map ${raw.id} row ${y} has wrong width`);
    return [...row].map((ch) => {
      const id = legend[ch];
      if (!id) throw new Error(`Map ${raw.id} legend has no entry for '${ch}'`);
      if (!terrainDefs[id]) throw new Error(`Map ${raw.id} references unknown terrain '${id}'`);
      return id;
    });
  });
  return { id: raw.id, width, height: raw.tiles.length, terrain };
}

function buildUnit(
  side: Side, ref: any, units: Record<string, any>, weapons: Record<string, any>,
  classes: Record<string, ClassDef>,
): GridUnit {
  const unit = units[ref?.unit];
  if (!unit) throw new Error(`${side} references unknown unit: ${ref?.unit}`);
  const weapon = weapons[ref?.weapon];
  if (!weapon) throw new Error(`${side} references unknown weapon: ${ref?.weapon}`);
  const cls = classes[unit.class];
  if (!cls) throw new Error(`${side} unit references unknown class: ${unit.class}`);
  if (!Array.isArray(ref.at) || ref.at.length !== 2) throw new Error(`${side} needs an "at": [x, y]`);
  const ai: AiKind = ref.ai === "stationary" ? "stationary" : "aggressive";
  return { id: ref.unit, side, unit: unit as UnitDef, weapon: weapon as WeaponDef, cls, ai, pos: { x: ref.at[0], y: ref.at[1] }, hp: unit.hp };
}

export function resolveGridEncounter(
  rawEnc: any, rawUnits: any, rawWeapons: any, rawTerrain: any, rawClasses: any, rawMap: any,
): GridEncounter {
  if (typeof rawEnc?.id !== "string" || typeof rawEnc?.map !== "string") {
    throw new Error(`Encounter needs string id and map`);
  }
  const terrainDefs = validateTerrainDefs(rawTerrain);
  const classes = validateClasses(rawClasses);
  const map = resolveMap(rawMap, terrainDefs);
  const player = buildUnit("player", rawEnc.player, rawUnits, rawWeapons, classes);
  const enemy = buildUnit("enemy", rawEnc.enemy, rawUnits, rawWeapons, classes);
  return { id: rawEnc.id, win: rawEnc.win ?? "rout", map, terrainDefs, player, enemy };
}
