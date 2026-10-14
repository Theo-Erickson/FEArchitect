import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStatblock } from "./statblock.ts";

const paladin: any = {
  name: "Paladin", movementType: "cav", move: 8,
  bases: { hp: 23, str: 7, mag: 0, skl: 4, spd: 7, def: 8, res: 3, con: 11 },
  caps:  { hp: 60, str: 25, mag: 25, skl: 26, spd: 24, def: 25, res: 25, con: 25 },
  growths: { hp: 70, str: 25, mag: 0, skl: 30, spd: 18, def: 12, res: 20, lck: 25 },
};
const seth: any = {
  name: "Seth", class: "paladin", level: 1, baseLevel: 1,
  bases: { hp: 30, str: 14, mag: 0, skl: 13, spd: 12, lck: 13, def: 11, res: 8, con: 11 },
  growths: { hp: 50, str: 40, mag: 0, skl: 30, spd: 30, lck: 30, def: 25, res: 25 },
};

test("averaged statblock uses base plus floored combined growth, capped", () => {
  const s = computeStatblock(seth, paladin, { level: 11, mode: "avg" });
  assert.equal(s.str, 20);
  assert.equal(s.hp, 42);
  assert.equal(s.spd, 16);
});

test("averaged statblock clamps at the class cap", () => {
  const capped = computeStatblock({ ...seth, growths: { ...seth.growths, str: 999 } }, paladin, { level: 20, mode: "avg" });
  assert.equal(capped.str, 25);
});

test("a flat-stat unit with no class returns its stats unchanged", () => {
  const flat: any = { name: "Eirika", hp: 24, str: 9, mag: 3, skl: 13, spd: 15, lck: 12, def: 7, res: 6, con: 5 };
  assert.deepEqual(computeStatblock(flat, undefined), {
    name: "Eirika", hp: 24, str: 9, mag: 3, skl: 13, spd: 15, lck: 12, def: 7, res: 6, con: 5,
  });
});

test("rolled mode is deterministic per seed and gives a floor plus a chance", () => {
  const a = computeStatblock(seth, paladin, { level: 11, mode: "rolled", seed: 5 });
  const b = computeStatblock(seth, paladin, { level: 11, mode: "rolled", seed: 5 });
  assert.deepEqual(a, b);
  assert.ok(a.str >= 14);
});
