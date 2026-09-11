// Pure validators for config records, shared by datagen, the MCP handlers, the
// CLI, and the bridge. No node imports. Each throws on invalid input with a
// clear message, or returns the typed value.
import type { EncounterSpec, UnitDef, WeaponDef, WeaponType } from "./types.ts";

const WEAPON_TYPES: WeaponType[] =
  ["sword", "lance", "axe", "bow", "anima", "light", "dark", "staff"];

const UNIT_NUMERIC_FIELDS: (keyof UnitDef)[] =
  ["hp", "str", "mag", "skl", "spd", "lck", "def", "res", "con"];

export function validateWeapon(id: string, w: any): WeaponDef {
  if (!w || typeof w !== "object") throw new Error(`Weapon ${id} is not an object`);
  if (typeof w.name !== "string") throw new Error(`Weapon ${id} missing name`);
  if (!WEAPON_TYPES.includes(w.type)) throw new Error(`Weapon ${id} has invalid type: ${w.type}`);
  for (const f of ["might", "hit", "crit", "weight"]) {
    if (typeof w[f] !== "number") throw new Error(`Weapon ${id} missing numeric ${f}`);
  }
  if (typeof w.rank !== "string") throw new Error(`Weapon ${id} missing rank`);
  return w as WeaponDef;
}

export function validateUnit(id: string, u: any): UnitDef {
  if (!u || typeof u !== "object") throw new Error(`Unit ${id} is not an object`);
  if (typeof u.name !== "string") throw new Error(`Unit ${id} missing name`);
  for (const f of UNIT_NUMERIC_FIELDS) {
    if (typeof u[f] !== "number") throw new Error(`Unit ${id} missing numeric ${String(f)}`);
  }
  return u as UnitDef;
}

export function validateEncounter(path: string, e: any): EncounterSpec {
  if (!e || typeof e !== "object") throw new Error(`Encounter ${path} is not an object`);
  if (typeof e.id !== "string") throw new Error(`Encounter ${path} missing id`);
  for (const side of ["player", "enemy"] as const) {
    if (!e[side] || typeof e[side].unit !== "string" || typeof e[side].weapon !== "string") {
      throw new Error(`Encounter ${path} ${side} must have string unit and weapon`);
    }
  }
  return e as EncounterSpec;
}
