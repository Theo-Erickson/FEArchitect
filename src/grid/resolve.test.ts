import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMap, resolveScenario } from "./resolve.ts";
import { tiny } from "./testkit.ts";

const SC_TERRAIN: any = { plains: { name: "Plains", moveCost: { foot: 1, cav: 1, fly: 1 }, avoid: 0, def: 0 } };
const SC_CLASSES: any = {
  infantry: { name: "Infantry", movementType: "foot", move: 5 },
  paladin: {
    name: "Paladin", movementType: "cav", move: 8,
    bases: { hp: 23, str: 7, mag: 0, skl: 4, spd: 7, def: 8, res: 3, con: 11 },
    caps: { hp: 60, str: 25, mag: 25, skl: 26, spd: 24, def: 25, res: 25, con: 25 },
    growths: { hp: 70, str: 25, mag: 0, skl: 30, spd: 18, def: 12, res: 20, lck: 25 },
  },
};
const SC_UNITS: any = {
  seth: { name: "Seth", class: "paladin", level: 11, baseLevel: 1, bases: { hp: 30, str: 14, mag: 0, skl: 13, spd: 12, lck: 13, def: 11, res: 8, con: 11 }, growths: { hp: 50, str: 40, mag: 0, skl: 30, spd: 30, lck: 30, def: 25, res: 25 }, skills: ["str_plus_2"] },
  eirika: { name: "Eirika", class: "infantry", hp: 24, str: 9, mag: 3, skl: 13, spd: 15, lck: 12, def: 7, res: 6, con: 5 },
};
const SC_WEAPONS: any = { "iron-sword": { name: "Iron Sword", type: "sword", rank: "E", might: 5, hit: 90, crit: 0, weight: 5 } };
const SC_SKILLS: any = { str_plus_2: { name: "Strength +2", kind: "statMod", mods: { str: 2 } } };
const SC_MAP: any = { id: "m", legend: { ".": "plains" }, tiles: ["....", "...."] };

test("resolveScenario computes an authored unit's statblock and folds passive skills", () => {
  const sc = resolveScenario({ id: "s", map: "m", units: [{ unit: "seth", weapon: "iron-sword", side: "player", at: [0, 0] }] }, SC_UNITS, SC_WEAPONS, SC_TERRAIN, SC_CLASSES, SC_MAP, SC_SKILLS);
  const seth = sc.units[0];
  assert.equal(seth.unit.str, 22); // base 14 + floor((40+25)*10/100)=6 = 20, + str_plus_2 passive 2
  assert.equal(seth.level, 11);
  assert.ok(seth.skills?.some((s) => s.name === "Strength +2"));
});

test("resolveScenario places multiple units per side at their positions", () => {
  const sc = resolveScenario({ id: "s", map: "m", units: [
    { unit: "seth", weapon: "iron-sword", side: "player", at: [0, 0] },
    { unit: "eirika", weapon: "iron-sword", side: "enemy", at: [3, 1] },
  ] }, SC_UNITS, SC_WEAPONS, SC_TERRAIN, SC_CLASSES, SC_MAP, SC_SKILLS);
  assert.equal(sc.units.length, 2);
  assert.equal(sc.units[0].side, "player");
  assert.equal(sc.units[1].side, "enemy");
  assert.deepEqual(sc.units[1].pos, { x: 3, y: 1 });
});

test("a flat-stat unit resolves to its stats unchanged", () => {
  const sc = resolveScenario({ id: "s", map: "m", units: [{ unit: "eirika", weapon: "iron-sword", side: "player", at: [0, 0] }] }, SC_UNITS, SC_WEAPONS, SC_TERRAIN, SC_CLASSES, SC_MAP, SC_SKILLS);
  assert.equal(sc.units[0].unit.spd, 15);
  assert.equal(sc.units[0].unit.hp, 24);
});

test("resolveScenario also accepts the 1v1 player/enemy form", () => {
  const sc = resolveScenario({ id: "s", map: "m", player: { unit: "eirika", weapon: "iron-sword", at: [0, 0] }, enemy: { unit: "seth", weapon: "iron-sword", at: [3, 1] } }, SC_UNITS, SC_WEAPONS, SC_TERRAIN, SC_CLASSES, SC_MAP, SC_SKILLS);
  assert.equal(sc.units.length, 2);
});

const defs: any = {
  "1": { name: "Plains", avoid: 0, def: 0, moveCost: { foot: 1, cav: 1, fly: 1 } },
  "12": { name: "Forest", avoid: 20, def: 1, moveCost: { foot: 2, cav: 3, fly: 1 } },
};

test("resolveMap reads the chapter grid (terrainIds) format", () => {
  const m = resolveMap({ id: "fe8-1", width: 2, height: 1, terrainIds: [[1, 12]] }, defs);
  assert.deepEqual(m.terrain, [["1", "12"]]);
  assert.equal(m.width, 2);
  assert.equal(m.height, 1);
});

test("resolveMap still reads the ASCII legend format", () => {
  const m = resolveMap({ id: "s", legend: { ".": "1", "f": "12" }, tiles: [".f"] }, defs);
  assert.deepEqual(m.terrain, [["1", "12"]]);
});

test("resolveMap rejects an unknown terrain id in a grid", () => {
  assert.throws(() => resolveMap({ id: "x", width: 1, height: 1, terrainIds: [[99]] }, defs), /unknown terrain/);
});

test("resolveScenario uses the placement id, falling back to the unit key", () => {
  const sc = tiny([
    { id: "grunt-a", unit: "grunt", weapon: "iron-lance", side: "enemy", at: [0, 1] },
    { id: "grunt-b", unit: "grunt", weapon: "iron-lance", side: "enemy", at: [1, 1] },
    { unit: "hero", weapon: "iron-sword", side: "player", at: [0, 0] },
  ]);
  assert.deepEqual(sc.units.map((u) => u.id), ["grunt-a", "grunt-b", "hero"]);
});
