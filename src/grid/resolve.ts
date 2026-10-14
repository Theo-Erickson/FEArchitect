// Pure grid resolving: validate and combine already-parsed JSON (units, weapons,
// terrain, classes, map, encounter) into a GridEncounter. No node imports, so
// both the Node loader and the browser client can use it.
import type {
  TerrainDef, ClassDef, ResolvedMap, ResolvedScenario, GridEncounter, GridUnit, MovementType, AiKind, Side,
} from "./types.ts";
import type { UnitDef, WeaponDef, Skill, StatBlock } from "../types.ts";
import { computeStatblock } from "./statblock.ts";
import { resolveSkills, passiveStatMods } from "./skills.ts";

const MOVEMENT_TYPES: MovementType[] = ["foot", "cav", "fly"];

// Resolve a raw unit to its effective statblock and its resolved skills. Flat-stat
// units pass through unchanged; authored units (with bases, or a statful class) are
// computed, then passive stat skills are folded in and re-capped at the class caps.
function resolveUnitStats(rawUnit: any, cls: ClassDef | undefined, skillDefs: Record<string, Skill>): { unit: UnitDef; skills: Skill[] } {
  const skills = resolveSkills(rawUnit.skills, cls?.skills, skillDefs);
  const stats = computeStatblock(rawUnit, cls) as any;
  const mods = passiveStatMods(skills);
  for (const [k, v] of Object.entries(mods)) {
    const key = k as keyof StatBlock;
    const cap = cls?.caps?.[key] ?? Infinity;
    stats[key] = Math.min((stats[key] ?? 0) + (v ?? 0), cap);
  }
  return { unit: stats as UnitDef, skills };
}

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
  // Chapter grid format: { id, width, height, terrainIds: number[][] }.
  if (Array.isArray(raw?.terrainIds)) {
    const height = raw.terrainIds.length;
    const width = raw.width ?? (raw.terrainIds[0]?.length ?? 0);
    const terrain: string[][] = raw.terrainIds.map((row: number[], y: number) => {
      if (row.length !== width) throw new Error(`Map ${raw.id} row ${y} has wrong width`);
      return row.map((n) => {
        const id = String(n);
        if (!terrainDefs[id]) throw new Error(`Map ${raw.id} references unknown terrain '${id}'`);
        return id;
      });
    });
    return { id: raw.id, width, height, terrain };
  }
  // ASCII legend format (showcase maps).
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
  classes: Record<string, ClassDef>, skillDefs: Record<string, Skill> = {},
): GridUnit {
  const rawUnit = units[ref?.unit];
  if (!rawUnit) throw new Error(`${side} references unknown unit: ${ref?.unit}`);
  const weapon = weapons[ref?.weapon];
  if (!weapon) throw new Error(`${side} references unknown weapon: ${ref?.weapon}`);
  const cls = classes[rawUnit.class];
  if (!cls) throw new Error(`${side} unit references unknown class: ${rawUnit.class}`);
  if (!Array.isArray(ref.at) || ref.at.length !== 2) throw new Error(`${side} needs an "at": [x, y]`);
  const ai: AiKind = ref.ai === "stationary" ? "stationary" : "aggressive";
  const { unit, skills } = resolveUnitStats(rawUnit, cls, skillDefs);
  return { id: ref.unit, side, unit, weapon: weapon as WeaponDef, cls, ai, pos: { x: ref.at[0], y: ref.at[1] }, hp: unit.hp, level: rawUnit.level, skills, portrait: rawUnit.portrait };
}

export function resolveGridEncounter(
  rawEnc: any, rawUnits: any, rawWeapons: any, rawTerrain: any, rawClasses: any, rawMap: any,
  rawSkills: any = {},
): GridEncounter {
  if (typeof rawEnc?.id !== "string" || typeof rawEnc?.map !== "string") {
    throw new Error(`Encounter needs string id and map`);
  }
  const terrainDefs = validateTerrainDefs(rawTerrain);
  const classes = validateClasses(rawClasses);
  const map = resolveMap(rawMap, terrainDefs);
  const skillDefs = (rawSkills ?? {}) as Record<string, Skill>;
  const player = buildUnit("player", rawEnc.player, rawUnits, rawWeapons, classes, skillDefs);
  const enemy = buildUnit("enemy", rawEnc.enemy, rawUnits, rawWeapons, classes, skillDefs);
  return { id: rawEnc.id, win: rawEnc.win ?? "rout", map, terrainDefs, player, enemy };
}

// Resolve a multi-unit scenario. Accepts either the 1v1 form ({ player, enemy }) or
// a { units: [{ unit, weapon, side, at, ai }] } list, into placed GridUnits.
export function resolveScenario(
  rawEnc: any, rawUnits: any, rawWeapons: any, rawTerrain: any, rawClasses: any, rawMap: any,
  rawSkills: any = {},
): ResolvedScenario {
  if (typeof rawEnc?.id !== "string") throw new Error(`Scenario needs a string id`);
  const terrainDefs = validateTerrainDefs(rawTerrain);
  const classes = validateClasses(rawClasses);
  const map = resolveMap(rawMap, terrainDefs);
  const skillDefs = (rawSkills ?? {}) as Record<string, Skill>;
  const refs: any[] = Array.isArray(rawEnc.units)
    ? rawEnc.units
    : [{ ...rawEnc.player, side: "player" }, { ...rawEnc.enemy, side: "enemy" }];
  const units = refs.map((ref) => buildUnit(ref.side === "enemy" ? "enemy" : "player", ref, rawUnits, rawWeapons, classes, skillDefs));
  return { id: rawEnc.id, map, terrainDefs, units };
}
