import { test } from "node:test";
import assert from "node:assert/strict";
import { toSimClass, FLY_MOVCOST, HORSE_MOVCOST } from "./simclasses.ts";

const paladin: any = {
  name: "Paladin\u001f", BaseHP: 23, BasePow: 7, BaseSkl: 4, BaseSpd: 7, BaseDef: 8, BaseRes: 3, BaseCon: 11, BaseMov: 8,
  MaxHP: 60, MaxPow: 25, MaxSkl: 26, MaxSpd: 24, MaxDef: 25, MaxRes: 25, MaxCon: 25,
  GrowthHP: 70, GrowthPow: 25, GrowthSkl: 30, GrowthSpd: 18, GrowthDef: 12, GrowthRes: 20, GrowthLck: 25,
  SwordRank: 181, LanceRank: 181, AxeRank: 0, BowRank: 0, StaffRank: 0, AnimaRank: 0, LightRank: 0, DarkRank: 0,
  MovCostPointer: "0x0880BAD3",
};
const mage: any = { ...paladin, name: "Mage", AnimaRank: 1, SwordRank: 0, LanceRank: 0, MovCostPointer: "0x0880B849" };

test("toSimClass routes Pow to str for a physical class, cav movement from the table", () => {
  const c = toSimClass(paladin);
  assert.equal(c.movementType, "cav");
  assert.equal(c.bases.str, 7);
  assert.equal(c.bases.mag, 0);
  assert.equal(c.growths.str, 25);
  assert.equal(c.caps.str, 25);
  assert.equal(c.move, 8);
});

test("toSimClass routes Pow to mag for a magic class", () => {
  const c = toSimClass(mage);
  assert.equal(c.bases.mag, 7);
  assert.equal(c.bases.str, 0);
  assert.equal(c.growths.mag, 25);
  assert.equal(c.growths.str, 0);
});
