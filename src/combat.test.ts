import { test } from "node:test";
import assert from "node:assert/strict";
import { attackSpeed, trueHit2RN, weaponTriangle, computeMatchup } from "./combat.ts";
import type { Combatant, UnitDef, WeaponDef } from "./types.ts";

function unit(over: Partial<UnitDef>): UnitDef {
  return { name: "U", hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 0, def: 5, res: 0, con: 5, ...over };
}
function weapon(over: Partial<WeaponDef>): WeaponDef {
  return { name: "W", type: "sword", rank: "E", might: 5, hit: 90, crit: 0, weight: 5, ...over };
}
function fighter(u: UnitDef, w: WeaponDef): Combatant {
  return { id: "x", unit: u, weaponId: "w", weapon: w };
}

test("attack speed subtracts weight over con, floored at 0", () => {
  // weight 10, con 4 -> penalty 6, spd 12 -> AS 6
  assert.equal(attackSpeed(fighter(unit({ spd: 12, con: 4 }), weapon({ weight: 10 }))), 6);
  // weight 5, con 5 -> no penalty, spd 7 -> AS 7
  assert.equal(attackSpeed(fighter(unit({ spd: 7, con: 5 }), weapon({ weight: 5 }))), 7);
  // huge weight cannot push AS below 0
  assert.equal(attackSpeed(fighter(unit({ spd: 3, con: 0 }), weapon({ weight: 99 }))), 0);
});

test("2RN true hit closed form", () => {
  assert.equal(Math.round(trueHit2RN(50)), 50);
  assert.equal(Math.round(trueHit2RN(90)), 98);
  assert.equal(Math.round(trueHit2RN(30)), 18);
  assert.equal(trueHit2RN(0), 0);
  assert.equal(trueHit2RN(100), 100);
});

test("weapon triangle: sword beats axe, loses to lance", () => {
  assert.deepEqual(weaponTriangle("sword", "axe"), { hitBonus: 15, dmgBonus: 1 });
  assert.deepEqual(weaponTriangle("sword", "lance"), { hitBonus: -15, dmgBonus: -1 });
  assert.deepEqual(weaponTriangle("sword", "sword"), { hitBonus: 0, dmgBonus: 0 });
  assert.deepEqual(weaponTriangle("bow", "axe"), { hitBonus: 0, dmgBonus: 0 });
});

test("physical matchup: damage, hit, doubling", () => {
  // attacker: str 9, skl 13, spd 15, lck 12, con 5, iron sword (mt5 hit90 wt5)
  // defender: def 11, spd 9, lck 2, con 13, iron lance (mt7 hit80 wt8)
  const atk = fighter(
    unit({ str: 9, skl: 13, spd: 15, lck: 12, def: 7, con: 5 }),
    weapon({ type: "sword", might: 5, hit: 90, crit: 0, weight: 5 }),
  );
  const def = fighter(
    unit({ str: 12, skl: 8, spd: 9, lck: 2, def: 11, con: 13 }),
    weapon({ type: "lance", might: 7, hit: 80, crit: 0, weight: 8 }),
  );
  const m = computeMatchup(atk, def);
  // triangle sword vs lance: hit -15, dmg -1.
  // attack = 5 (mt) - 1 (tri) + 9 (str) = 13; damage = 13 - 11 (def) = 2
  assert.equal(m.damage, 2);
  // AS attacker = 15 - max(0,5-5)=15 ; AS defender = 9 - max(0,8-13)=9 ; diff 6 -> doubles
  assert.equal(m.attackSpeed, 15);
  assert.equal(m.doubles, true);
  // hit = skl*2(26) + wpnHit(90) + lck/2(6) + tri(-15) = 107
  // avoid def = AS*2(18) + terrain(0) + lck(2) = 20 ; displayed = 107-20=87
  assert.equal(m.displayedHit, 87);
  // damage 2 into hp 20 -> hitsToKill 10, doubles -> roundsToKill 5
  assert.equal(m.hitsToKill, 10);
  assert.equal(m.roundsToKill, 5);
});

test("magic matchup uses mag versus res", () => {
  const atk = fighter(unit({ mag: 10, str: 0, skl: 6, lck: 4, spd: 8, con: 5 }),
    weapon({ type: "anima", might: 6, hit: 85, crit: 0, weight: 5 }));
  const def = fighter(unit({ res: 3, def: 20, spd: 5, lck: 0, con: 8 }),
    weapon({ type: "sword", might: 5, hit: 90, weight: 5 }));
  const m = computeMatchup(atk, def);
  // no triangle for anima vs sword in slice A. attack = 6 + 10 = 16 ; damage = 16 - 3 (res) = 13
  assert.equal(m.damage, 13);
});

test("zero damage yields null kill counts", () => {
  const atk = fighter(unit({ str: 1 }), weapon({ might: 1, type: "sword" }));
  const def = fighter(unit({ def: 50 }), weapon({ type: "sword" }));
  const m = computeMatchup(atk, def);
  assert.equal(m.damage, 0);
  assert.equal(m.hitsToKill, null);
  assert.equal(m.roundsToKill, null);
});
