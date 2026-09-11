// Load config JSON, validate it, and resolve references into a DataBundle.
// Validation is intentionally strict and loud: a bad reference or a missing
// field throws with a clear message rather than producing a silent wrong
// bundle. This is the same intent as the .nmm schema layer in later tiers.

import { readFile } from "node:fs/promises";
import type {
  DataBundle, UnitDef, WeaponDef, Combatant,
} from "./types.ts";
import { validateUnit, validateWeapon, validateEncounter } from "./validate.ts";

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
