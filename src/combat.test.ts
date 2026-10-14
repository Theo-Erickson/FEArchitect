import { test } from "node:test";
import assert from "node:assert/strict";
import { attackSpeed, trueHit2RN, weaponTriangle, computeMatchup, resolveExchange } from "./combat.ts";
import { makeRng } from "./rng.ts";
import type { Combatant, UnitDef, WeaponDef, Skill } from "./types.ts";

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

test("terrain res reduces magic damage, terrain def reduces physical", () => {
  const defender = fighter(unit({ res: 2, def: 8, spd: 0, lck: 0, con: 5 }), weapon({ type: "sword" }));
  // magic: attack = mag 10 + might 5 = 15; res 2 + terrain res 3 = 5 -> damage 10
  const atkMag = fighter(unit({ mag: 10, str: 0 }), weapon({ type: "anima", might: 5 }));
  assert.equal(computeMatchup(atkMag, defender, { avoid: 0, def: 1, res: 3 }).damage, 10);
  // physical: attack = str 10 + might 5 = 15; def 8 + terrain def 4 = 12 -> damage 3 (terrain res ignored)
  const atkPhys = fighter(unit({ str: 10, mag: 0 }), weapon({ type: "sword", might: 5 }));
  assert.equal(computeMatchup(atkPhys, defender, { avoid: 0, def: 4, res: 99 }).damage, 3);
});

const luna: Skill = { name: "Luna", kind: "combat", trigger: "sklRate", effect: "ignoreDef" };
const sol: Skill = { name: "Sol", kind: "combat", trigger: "sklRate", effect: "lifesteal" };
const pavise: Skill = { name: "Pavise", kind: "combat", trigger: "sklRate", effect: "halveDamage" };
const vantage: Skill = { name: "Vantage", kind: "combat", trigger: "defendBelowHalf", effect: "strikeFirst" };

test("Luna annotation reports the skl rate and the on-activation damage", () => {
  const atk = { ...fighter(unit({ str: 10, skl: 20 }), weapon({ type: "sword", might: 5 })), skills: [luna] };
  const def = fighter(unit({ def: 8 }), weapon({ type: "sword" }));
  const m = computeMatchup(atk, def);
  assert.equal(m.damage, 7); // 15 - 8
  assert.ok(m.skillNotes?.some((n) => n.skill === "Luna" && n.rate === 20 && n.damage === 15));
});

test("a combatant with no skills produces no skillNotes and unchanged numbers", () => {
  const m = computeMatchup(fighter(unit({ str: 10 }), weapon({ might: 5 })), fighter(unit({ def: 8 }), weapon({})));
  assert.equal(m.skillNotes, undefined);
  assert.equal(m.damage, 7);
});

test("Luna in resolveExchange ignores defense on activation", () => {
  // Guaranteed hit (weapon hit 100, no avoid), no crit (skl 0 -> but Luna uses skl for
  // activation, so give skl 100 and high defender lck to zero the crit rate).
  const atk = { ...fighter(unit({ str: 10, skl: 100, spd: 0, con: 5 }), weapon({ type: "sword", might: 10, hit: 100, crit: 0 })), skills: [luna] };
  const def = fighter(unit({ def: 18, spd: 0, lck: 60, hp: 40, con: 5 }), weapon({ type: "sword" }));
  const res = resolveExchange({ attacker: atk, defender: def, attackerHp: 40, defenderHp: 40, defenderCanCounter: false, rng: makeRng(1) });
  // normal damage would be 20 - 18 = 2; Luna ignores def -> 20. So defenderHp = 20.
  assert.equal(res.defenderHp, 20);
});

test("Sol in resolveExchange recovers HP equal to damage dealt", () => {
  const atk = { ...fighter(unit({ str: 10, skl: 100, spd: 0, con: 5, hp: 40 }), weapon({ type: "sword", might: 10, hit: 100, crit: 0 })), skills: [sol] };
  const def = fighter(unit({ def: 4, spd: 0, lck: 60, hp: 40, con: 5 }), weapon({ type: "sword" }));
  const res = resolveExchange({ attacker: atk, defender: def, attackerHp: 10, defenderHp: 40, defenderCanCounter: false, rng: makeRng(1) });
  // damage 16; attacker heals from 10 to 26.
  assert.equal(res.attackerHp, 26);
});

test("Pavise in resolveExchange halves incoming damage on activation", () => {
  const atk = fighter(unit({ str: 10, skl: 0, spd: 0, con: 5 }), weapon({ type: "sword", might: 10, hit: 100, crit: 0 }));
  const def = { ...fighter(unit({ def: 4, skl: 100, spd: 0, lck: 0, hp: 40, con: 5 }), weapon({ type: "sword" })), skills: [pavise] };
  const res = resolveExchange({ attacker: atk, defender: def, attackerHp: 40, defenderHp: 40, defenderCanCounter: false, rng: makeRng(1) });
  // normal 16 -> Pavise halves to 8. defenderHp = 32.
  assert.equal(res.defenderHp, 32);
});

test("Vantage makes a low-HP defender strike first", () => {
  const atk = { ...fighter(unit({ str: 10, spd: 0, con: 5 }), weapon({ type: "sword", might: 5, hit: 100 })), id: "ATK" };
  const def = { ...fighter(unit({ str: 6, spd: 0, con: 5, hp: 20 }), weapon({ type: "sword", might: 5, hit: 100 })), id: "DEF", skills: [vantage] };
  const res = resolveExchange({ attacker: atk, defender: def, attackerHp: 40, defenderHp: 5, defenderCanCounter: true, rng: makeRng(1) });
  // defender is at 5 of 20 (<= half), so it strikes first.
  assert.equal(res.events[0].attackerId, "DEF");
});

test("zero damage yields null kill counts", () => {
  const atk = fighter(unit({ str: 1 }), weapon({ might: 1, type: "sword" }));
  const def = fighter(unit({ def: 50 }), weapon({ type: "sword" }));
  const m = computeMatchup(atk, def);
  assert.equal(m.damage, 0);
  assert.equal(m.hitsToKill, null);
  assert.equal(m.roundsToKill, null);
});
