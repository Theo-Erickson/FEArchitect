import { test } from "node:test";
import assert from "node:assert/strict";
import { createMultiGame } from "./multigame.ts";
import { decideMultiAction } from "./multiai.ts";

function scenario(enemyX: number, ai = "aggressive"): any {
  const terrainDefs = { plains: { name: "Plains", moveCost: { foot: 1, cav: 1, fly: 1 }, avoid: 0, def: 0 } };
  const map = { id: "m", width: 8, height: 1, terrain: [Array(8).fill("plains")] };
  const mk = (id: string, side: string, x: number, aiKind = "aggressive") => ({
    id, side, pos: { x, y: 0 }, hp: 20, cls: { name: "Inf", movementType: "foot", move: 3 },
    weapon: { name: "Sword", type: "sword", rank: "E", might: 5, hit: 100, crit: 0, weight: 5 },
    unit: { name: id, hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 0, def: 0, res: 0, con: 5 }, ai: aiKind,
  });
  return { id: "s", map, terrainDefs, units: [mk("p1", "player", 0), mk("e1", "enemy", enemyX, ai)] };
}

test("AI attacks in place when a player is already in range", () => {
  const g = createMultiGame(scenario(1), 1);
  const a = decideMultiAction(g, "e1");
  assert.deepEqual(a.to, { x: 1, y: 0 });
  assert.equal(a.attackTargetId, "p1");
});

test("AI moves adjacent and attacks when a player is reachable", () => {
  const g = createMultiGame(scenario(3), 1);
  const a = decideMultiAction(g, "e1");
  assert.equal(a.attackTargetId, "p1");
  assert.ok(Math.abs(a.to.x - 0) <= 1);
});

test("AI steps toward the nearest player when it cannot reach one", () => {
  const g = createMultiGame(scenario(7), 1);
  const a = decideMultiAction(g, "e1");
  assert.equal(a.attackTargetId, null);
  assert.ok(a.to.x < 7);
});

test("a stationary unit holds", () => {
  const g = createMultiGame(scenario(5, "stationary"), 1);
  const a = decideMultiAction(g, "e1");
  assert.deepEqual(a.to, { x: 5, y: 0 });
  assert.equal(a.attackTargetId, null);
});
