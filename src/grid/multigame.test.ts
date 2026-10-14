import { test } from "node:test";
import assert from "node:assert/strict";
import { createMultiGame, reachableFor, moveUnit, attack, act, canAttack, endPhase, status, unitById } from "./multigame.ts";
import { tileKey } from "./movement.ts";

function scenario(): any {
  const terrainDefs = { plains: { name: "Plains", moveCost: { foot: 1, cav: 1, fly: 1 }, avoid: 0, def: 0 } };
  const map = { id: "m", width: 5, height: 1, terrain: [["plains", "plains", "plains", "plains", "plains"]] };
  const mk = (id: string, side: string, x: number, str: number, hp: number) => ({
    id, side, pos: { x, y: 0 }, hp, cls: { name: "Inf", movementType: "foot", move: 3 },
    weapon: { name: "Sword", type: "sword", rank: "E", might: 5, hit: 100, crit: 0, weight: 5 },
    unit: { name: id, hp, str, mag: 0, skl: 5, spd: 5, lck: 0, def: 0, res: 0, con: 5 }, ai: "aggressive",
  });
  return { id: "s", map, terrainDefs, units: [mk("p1", "player", 0, 20, 30), mk("e1", "enemy", 4, 3, 20)] };
}

test("reachableFor excludes tiles occupied by other units and respects move", () => {
  const g = createMultiGame(scenario(), 1);
  const r = reachableFor(g, "p1");
  assert.ok(r.has("0,0") && r.has("3,0"));
  assert.ok(!r.has("4,0"));
});

test("moveUnit rejects an unreachable tile and accepts a reachable one", () => {
  const g = createMultiGame(scenario(), 1);
  assert.throws(() => moveUnit(g, "p1", { x: 4, y: 0 }), /reachable/i);
  moveUnit(g, "p1", { x: 3, y: 0 });
  assert.deepEqual(unitById(g, "p1").pos, { x: 3, y: 0 });
});

test("attack resolves combat, applies HP, removes the dead, and ends when routed", () => {
  const g = createMultiGame(scenario(), 1);
  act(g, "p1", { x: 3, y: 0 }, "e1");
  assert.equal(unitById(g, "e1"), undefined);
  assert.equal(status(g), "player-won");
  assert.ok(g.acted.has("p1"));
});

test("a unit cannot act twice in a phase", () => {
  const g = createMultiGame(scenario(), 1);
  act(g, "p1", { x: 1, y: 0 });
  assert.equal(reachableFor(g, "p1").size, 0);
});

test("endPhase toggles side, clears acted, and bumps turn after the enemy phase", () => {
  const g = createMultiGame(scenario(), 1);
  act(g, "p1", { x: 1, y: 0 });
  endPhase(g);
  assert.equal(g.phase, "enemy");
  assert.equal(g.acted.size, 0);
  endPhase(g);
  assert.equal(g.phase, "player");
  assert.equal(g.turn, 2);
});
