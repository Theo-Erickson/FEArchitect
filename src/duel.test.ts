import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeterministic, runMonteCarlo } from "./combat.ts";
import type { Combatant, UnitDef, WeaponDef } from "./types.ts";

function unit(over: Partial<UnitDef>): UnitDef {
  return { name: "U", hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 0, def: 5, res: 0, con: 5, ...over };
}
function weapon(over: Partial<WeaponDef>): WeaponDef {
  return { name: "W", type: "sword", rank: "E", might: 5, hit: 90, crit: 0, weight: 5, ...over };
}
function fighter(id: string, u: UnitDef, w: WeaponDef): Combatant {
  return { id, unit: u, weaponId: "w", weapon: w };
}

test("deterministic report computes both directions", () => {
  const player = fighter("p", unit({ str: 10, skl: 10, spd: 12 }), weapon({ type: "sword" }));
  const enemy = fighter("e", unit({ str: 6, skl: 4, spd: 5, def: 4 }), weapon({ type: "axe" }));
  const r = buildDeterministic(player, enemy);
  assert.ok(r.playerVsEnemy.damage > 0);
  assert.ok(r.enemyVsPlayer.damage >= 0);
});

test("monte carlo is deterministic for a fixed seed", () => {
  const player = fighter("p", unit({ hp: 24, str: 10, skl: 12, spd: 14, lck: 8 }), weapon({ type: "sword", hit: 90 }));
  const enemy = fighter("e", unit({ hp: 22, str: 8, skl: 6, spd: 8, def: 5, lck: 2 }), weapon({ type: "axe", hit: 75 }));
  const a = runMonteCarlo(player, enemy, { seed: 42, runs: 500 });
  const b = runMonteCarlo(player, enemy, { seed: 42, runs: 500 });
  assert.deepEqual(a, b);
});

test("overwhelming player wins nearly always", () => {
  const player = fighter("p", unit({ hp: 40, str: 25, skl: 20, spd: 20, lck: 15, def: 15 }), weapon({ type: "sword", hit: 100 }));
  const enemy = fighter("e", unit({ hp: 20, str: 3, skl: 2, spd: 2, def: 2, lck: 0 }), weapon({ type: "axe", hit: 60 }));
  const r = runMonteCarlo(player, enemy, { seed: 1, runs: 1000 });
  assert.ok(r.playerWinRate > 95, `expected >95, got ${r.playerWinRate}`);
  assert.equal(r.playerWins + r.enemyWins + r.stalemates, 1000);
});

test("two units that cannot hurt each other stalemate", () => {
  const player = fighter("p", unit({ str: 1, def: 40 }), weapon({ type: "sword", might: 1 }));
  const enemy = fighter("e", unit({ str: 1, def: 40 }), weapon({ type: "sword", might: 1 }));
  const r = runMonteCarlo(player, enemy, { seed: 5, runs: 100 });
  assert.equal(r.stalemates, 100);
  assert.equal(r.playerWins, 0);
  assert.equal(r.enemyWins, 0);
});
