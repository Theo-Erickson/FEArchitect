import { test } from "node:test";
import assert from "node:assert/strict";
import { unitFields, weaponSelectValue, applyUnitField } from "./formmodel.ts";
import type { UnitDef } from "../types.ts";

test("unitFields lists every numeric stat in a stable order", () => {
  const fields = unitFields();
  assert.deepEqual(fields, ["hp", "str", "mag", "skl", "spd", "lck", "def", "res", "con"]);
});

test("applyUnitField updates one stat immutably", () => {
  const u: UnitDef = { name: "E", hp: 24, str: 9, mag: 3, skl: 13, spd: 15, lck: 12, def: 7, res: 6, con: 5 };
  const next = applyUnitField(u, "spd", 20);
  assert.equal(next.spd, 20);
  assert.equal(u.spd, 15); // original unchanged
});

test("weaponSelectValue returns the current weapon id", () => {
  assert.equal(weaponSelectValue("iron-sword"), "iron-sword");
});
