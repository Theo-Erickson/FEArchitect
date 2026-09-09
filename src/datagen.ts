// Load config JSON, validate it, and resolve references into a DataBundle.
// Validation is intentionally strict and loud: a bad reference or a missing
// field throws with a clear message rather than producing a silent wrong
// bundle. This is the same intent as the .nmm schema layer in later tiers.

import { readFile } from "node:fs/promises";
import type {
  DataBundle, EncounterSpec, UnitDef, WeaponDef, WeaponType, Combatant,
} from "./types.ts";

const WEAPON_TYPES: WeaponType[] =
  ["sword", "lance", "axe", "bow", "anima", "light", "dark", "staff"];

const UNIT_NUMERIC_FIELDS: (keyof UnitDef)[] =
  ["hp", "str", "mag", "skl", "spd", "lck", "def", "res", "con"];

async function readJson(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new Error(`Cannot read config file: ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON in ${path}: ${(e as Error).message}`);
  }
}

function validateWeapon(id: string, w: any): WeaponDef {
  if (!w || typeof w !== "object") throw new Error(`Weapon ${id} is not an object`);
  if (typeof w.name !== "string") throw new Error(`Weapon ${id} missing name`);
  if (!WEAPON_TYPES.includes(w.type)) throw new Error(`Weapon ${id} has invalid type: ${w.type}`);
  for (const f of ["might", "hit", "crit", "weight"]) {
    if (typeof w[f] !== "number") throw new Error(`Weapon ${id} missing numeric ${f}`);
  }
  if (typeof w.rank !== "string") throw new Error(`Weapon ${id} missing rank`);
  return w as WeaponDef;
}

function validateUnit(id: string, u: any): UnitDef {
  if (!u || typeof u !== "object") throw new Error(`Unit ${id} is not an object`);
  if (typeof u.name !== "string") throw new Error(`Unit ${id} missing name`);
  for (const f of UNIT_NUMERIC_FIELDS) {
    if (typeof u[f] !== "number") throw new Error(`Unit ${id} missing numeric ${String(f)}`);
  }
  return u as UnitDef;
}

function validateEncounter(path: string, e: any): EncounterSpec {
  if (!e || typeof e !== "object") throw new Error(`Encounter ${path} is not an object`);
  if (typeof e.id !== "string") throw new Error(`Encounter ${path} missing id`);
  for (const side of ["player", "enemy"] as const) {
    if (!e[side] || typeof e[side].unit !== "string" || typeof e[side].weapon !== "string") {
      throw new Error(`Encounter ${path} ${side} must have string unit and weapon`);
    }
  }
  return e as EncounterSpec;
}

function resolveSide(
  label: string, ref: { unit: string; weapon: string },
  units: Record<string, UnitDef>, weapons: Record<string, WeaponDef>,
): Combatant {
  const unit = units[ref.unit];
  if (!unit) throw new Error(`${label} references unknown unit: ${ref.unit}`);
  const weapon = weapons[ref.weapon];
  if (!weapon) throw new Error(`${label} references unknown weapon: ${ref.weapon}`);
  return { id: ref.unit, unit, weaponId: ref.weapon, weapon };
}

export interface LoadPaths {
  unitsPath?: string;
  weaponsPath?: string;
}

export async function loadBundle(encounterPath: string, paths: LoadPaths = {}): Promise<DataBundle> {
  const unitsPath = paths.unitsPath ?? "data/units.json";
  const weaponsPath = paths.weaponsPath ?? "data/weapons.json";

  const rawUnits = await readJson(unitsPath) as Record<string, any>;
  const rawWeapons = await readJson(weaponsPath) as Record<string, any>;
  const rawEncounter = await readJson(encounterPath);

  const units: Record<string, UnitDef> = {};
  for (const [id, u] of Object.entries(rawUnits)) units[id] = validateUnit(id, u);

  const weapons: Record<string, WeaponDef> = {};
  for (const [id, w] of Object.entries(rawWeapons)) weapons[id] = validateWeapon(id, w);

  const encounter = validateEncounter(encounterPath, rawEncounter);
  const player = resolveSide("player", encounter.player, units, weapons);
  const enemy = resolveSide("enemy", encounter.enemy, units, weapons);

  return { weapons, units, encounter, player, enemy };
}
