// Pure helpers shared by the browser client, kept out of the DOM so they can be
// tested with the Node test runner.
import type { UnitDef } from "../types.ts";

const FIELDS: (keyof UnitDef)[] = ["hp", "str", "mag", "skl", "spd", "lck", "def", "res", "con"];

export function unitFields(): string[] {
  return FIELDS.map(String);
}

export function applyUnitField(u: UnitDef, field: string, value: number): UnitDef {
  return { ...u, [field]: value };
}

export function weaponSelectValue(weaponId: string): string {
  return weaponId;
}
