import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAction } from "./ai.ts";
import type { GridEncounter, GridUnit, TerrainDef, ResolvedMap } from "./types.ts";
import type { UnitDef, WeaponDef } from "../types.ts";

const DEFS: Record<string, TerrainDef> = {
  plains: { name: "Plains", moveCost: { foot: 1, cav: 1, fly: 1 }, avoid: 0, def: 0 },
};
function openMap(w: number, h: number): ResolvedMap {
  return { id: "m", width: w, height: h, terrain: Array.from({ length: h }, () => new Array(w).fill("plains")) };
}
function unit(over: Partial<UnitDef>): UnitDef {
  return { name: "U", hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 0, def: 5, res: 0, con: 5, ...over };
}
function weapon(): WeaponDef { return { name: "W", type: "sword", rank: "E", might: 5, hit: 90, crit: 0, weight: 5 }; }
function gu(id: string, side: any, x: number, y: number, ai: any = "aggressive", move = 5): GridUnit {
  return { id, side, unit: unit({}), weapon: weapon(), cls: { name: "C", movementType: "foot", move }, ai, pos: { x, y }, hp: 20 };
}
function enc(player: GridUnit, enemy: GridUnit): GridEncounter {
  return { id: "e", win: "rout", map: openMap(10, 3), terrainDefs: DEFS, player, enemy };
}

test("attacks a target already in range without moving", () => {
  const e = gu("foe", "enemy", 5, 1);
  const p = gu("hero", "player", 4, 1);
  const a = decideAction(enc(p, e), "foe");
  assert.deepEqual(a.to, { x: 5, y: 1 });
  assert.equal(a.attackTargetId, "hero");
});

test("aggressive moves adjacent to the target and attacks", () => {
  const e = gu("foe", "enemy", 9, 1, "aggressive", 5);
  const p = gu("hero", "player", 4, 1);
  const a = decideAction(enc(p, e), "foe");
  // nearest reachable tile adjacent to the player is (5,1), 4 tiles away.
  assert.deepEqual(a.to, { x: 5, y: 1 });
  assert.equal(a.attackTargetId, "hero");
});

test("aggressive approaches when it cannot reach, without attacking", () => {
  const e = gu("foe", "enemy", 9, 1, "aggressive", 2);
  const p = gu("hero", "player", 0, 1);
  const a = decideAction(enc(p, e), "foe");
  assert.equal(a.attackTargetId, null);
  assert.deepEqual(a.to, { x: 7, y: 1 }); // moved 2 toward the player
});

test("stationary never moves and only attacks in range", () => {
  const far = decideAction(enc(gu("hero", "player", 0, 1), gu("foe", "enemy", 9, 1, "stationary")), "foe");
  assert.deepEqual(far.to, { x: 9, y: 1 });
  assert.equal(far.attackTargetId, null);

  const near = decideAction(enc(gu("hero", "player", 8, 1), gu("foe", "enemy", 9, 1, "stationary")), "foe");
  assert.equal(near.attackTargetId, "hero");
});
