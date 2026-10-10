import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGridEncounter } from "./datagen.ts";
import { createGame, reachableFor, applyMove, applyAttack, endPhase, status, takeAiTurn, applyTileHeal } from "./game.ts";
import { tileKey } from "./movement.ts";

async function game(seed = 1) {
  const enc = await loadGridEncounter("encounters/skirmish-01.json");
  return createGame(enc, seed);
}

test("reachable respects movement type and blocks the enemy tile", async () => {
  const g = await game();
  const r = reachableFor(g, "eirika-t");
  assert.ok(r.has("4,3"));       // foot can reach through the forest
  assert.ok(!r.has(tileKey(g.enemy.pos))); // cannot end on the enemy
});

test("applyMove rejects an unreachable tile", async () => {
  const g = await game();
  assert.throws(() => applyMove(g, "eirika-t", { x: 9, y: 0 }), /reachable/i);
});

test("applyMove moves the unit", async () => {
  const g = await game();
  applyMove(g, "eirika-t", { x: 4, y: 3 });
  assert.deepEqual(g.player.pos, { x: 4, y: 3 });
});

test("applyAttack resolves an exchange, logs it, and can end the game", async () => {
  const g = await game(7);
  // Put the units adjacent and give the player an overwhelming edge.
  g.player.pos = { x: 8, y: 3 };
  g.enemy.pos = { x: 9, y: 3 };
  g.player.unit.str = 99;
  applyAttack(g, "eirika-t", "wyvern-1");
  assert.ok(g.log.length > 0);
  assert.equal(g.enemy.hp, 0);
  assert.equal(status(g), "player-won");
});

test("applyTileHeal restores HP on a healing tile, capped at max", async () => {
  const g = await game();
  const tid = g.enc.map.terrain[g.player.pos.y][g.player.pos.x];
  g.enc.terrainDefs[tid] = { ...g.enc.terrainDefs[tid], heal: 10, name: "Fort" };
  g.player.hp = g.player.unit.hp - 5;
  assert.equal(applyTileHeal(g, "eirika-t"), 5); // only 5 missing, capped at max
  assert.equal(g.player.hp, g.player.unit.hp);
});

test("endPhase toggles the active side", async () => {
  const g = await game();
  assert.equal(g.phase, "player");
  endPhase(g);
  assert.equal(g.phase, "enemy");
  endPhase(g);
  assert.equal(g.phase, "player");
});

test("a seeded auto-played skirmish is deterministic", async () => {
  async function run(seed: number) {
    const g = await game(seed);
    for (let i = 0; i < 40 && status(g) === "ongoing"; i++) {
      takeAiTurn(g, g.phase === "player" ? "eirika-t" : "wyvern-1");
      endPhase(g);
    }
    return { status: status(g), log: g.log };
  }
  assert.deepEqual(await run(5), await run(5));
});
