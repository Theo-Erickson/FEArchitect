import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMatchup, resolveExchange } from "./combat.ts";
import { makeRng } from "./rng.ts";
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

test("terrain avoid and def change the matchup", () => {
  // Same weapon types (no triangle) and a mid-range hit so nothing clamps.
  const atk = fighter("a", unit({ str: 10, skl: 5, spd: 10, lck: 0 }), weapon({ type: "sword", hit: 70 }));
  const def = fighter("d", unit({ def: 5, spd: 5, lck: 0 }), weapon({ type: "sword" }));
  const plain = computeMatchup(atk, def);
  const onForest = computeMatchup(atk, def, { avoid: 20, def: 1 });
  assert.ok(plain.displayedHit < 100, "plain hit should be below the clamp");
  assert.equal(onForest.displayedHit, plain.displayedHit - 20);
  assert.equal(onForest.damage, plain.damage - 1);
});

test("Slice A callers with no terrain get identical numbers (regression)", () => {
  const atk = fighter("a", unit({ str: 9, skl: 13, spd: 15, lck: 12 }), weapon({ type: "sword", might: 5, hit: 90 }));
  const def = fighter("d", unit({ def: 11, spd: 9, lck: 2, con: 13 }), weapon({ type: "lance", might: 7, hit: 80, weight: 8 }));
  const a = computeMatchup(atk, def);
  const b = computeMatchup(atk, def, { avoid: 0, def: 0 });
  assert.deepEqual(a, b);
});

test("resolveExchange runs attacker, counter, and doubles, and is seed-stable", () => {
  const atk = fighter("hero", unit({ hp: 24, str: 10, skl: 12, spd: 16, lck: 6 }), weapon({ type: "sword", hit: 90 }));
  const def = fighter("foe", unit({ hp: 20, str: 8, skl: 6, spd: 8, def: 4, lck: 1 }), weapon({ type: "axe", hit: 75 }));
  const args = () => ({
    attacker: atk, defender: def, attackerHp: 24, defenderHp: 20,
    defenderCanCounter: true, rng: makeRng(3),
  });
  const r1 = resolveExchange(args());
  const r2 = resolveExchange(args());
  assert.deepEqual(r1, r2);
  // attacker has higher AS (16 vs 8), so it doubles: at least 2 attacker events.
  const attackerHits = r1.events.filter((e) => e.attackerId === "hero");
  assert.ok(attackerHits.length >= 2);
});

test("resolveExchange with no counter leaves the attacker unharmed", () => {
  const atk = fighter("hero", unit({ hp: 24, str: 20 }), weapon({ type: "sword", hit: 100 }));
  const def = fighter("foe", unit({ hp: 20, def: 0 }), weapon({ type: "axe", hit: 100 }));
  const r = resolveExchange({ attacker: atk, defender: def, attackerHp: 24, defenderHp: 20, defenderCanCounter: false, rng: makeRng(1) });
  assert.equal(r.attackerHp, 24);
  assert.ok(r.events.every((e) => e.attackerId === "hero"));
});
