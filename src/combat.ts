// FE8 combat math. Every formula is ported from fireemblem8u/src/bmbattle.c
// (the ComputeBattleUnit* functions) and include/bmbattle.h. Constants are
// cited inline. The strength / magic split is treated as enabled: magic
// weapons use mag and target res, where vanilla FE8 uses a single pow stat.

import type {
  Combatant, Matchup, WeaponType,
  DeterministicReport, MonteCarloReport,
} from "./types.ts";
import { MAGIC_TYPES } from "./types.ts";
import { makeRng, roll2RN, type Rng } from "./rng.ts";

// include/bmbattle.h: BATTLE_FOLLOWUP_SPEED_THRESHOLD = 4
const FOLLOWUP_THRESHOLD = 4;

export function isMagic(type: WeaponType): boolean {
  return MAGIC_TYPES.includes(type);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

// ComputeBattleUnitSpeed: effWt = weight - conBonus, floored at 0;
// battleSpeed = spd - effWt, floored at 0.
export function attackSpeed(c: Combatant): number {
  const effWt = Math.max(0, c.weapon.weight - c.unit.con);
  return Math.max(0, c.unit.spd - effWt);
}

// The melee weapon triangle. bmbattle.c applies a hit bonus of +/-15 and a
// damage bonus of +/-1. Only sword, lance, axe participate in slice A.
export function weaponTriangle(
  attacker: WeaponType,
  defender: WeaponType,
): { hitBonus: number; dmgBonus: number } {
  const beats: Record<string, WeaponType> = { sword: "axe", axe: "lance", lance: "sword" };
  const losesTo: Record<string, WeaponType> = { sword: "lance", axe: "sword", lance: "axe" };
  if (beats[attacker] === defender) return { hitBonus: 15, dmgBonus: 1 };
  if (losesTo[attacker] === defender) return { hitBonus: -15, dmgBonus: -1 };
  return { hitBonus: 0, dmgBonus: 0 };
}

// The GBA two random number correction, expressed as a closed form. The
// engine rolls the average of two integers in 0..99 (see roll2RN in rng.ts).
// The probability that this average is below a displayed rate d is:
//   d <= 50:  2 * (d/100)^2                       -> as a percent: d*d/50
//   d  > 50:  1 - 2 * ((100-d)/100)^2             -> 100 - (100-d)^2/50
// This matches the widely documented FE true hit curve.
export function trueHit2RN(displayed: number): number {
  const d = clamp(displayed, 0, 100);
  if (d <= 50) return (d * d) / 50;
  return 100 - ((100 - d) * (100 - d)) / 50;
}

// Everything one attacker does to one defender in a single matchup.
export function computeMatchup(attacker: Combatant, defender: Combatant): Matchup {
  const tri = weaponTriangle(attacker.weapon.type, defender.weapon.type);
  const magic = isMagic(attacker.weapon.type);

  // ComputeBattleUnitAttack: might + triangle dmg + power stat (effectiveness later).
  const powerStat = magic ? attacker.unit.mag : attacker.unit.str;
  const attack = attacker.weapon.might + tri.dmgBonus + powerStat;

  // ComputeBattleUnitDefense: res for magic, def otherwise. No terrain in slice A.
  const defenseStat = magic ? defender.unit.res : defender.unit.def;
  const damage = Math.max(0, attack - defenseStat);

  // ComputeBattleUnitHitRate: skl*2 + weapon hit + lck/2 + triangle hit.
  const rawHit =
    attacker.unit.skl * 2 +
    attacker.weapon.hit +
    Math.floor(attacker.unit.lck / 2) +
    tri.hitBonus;

  // ComputeBattleUnitAvoidRate: AS*2 + terrain(0) + lck.
  const defenderAvoid = Math.max(0, attackSpeed(defender) * 2 + defender.unit.lck);

  // ComputeBattleUnitEffectiveHitRate: hit - avoid, clamped 0..100.
  const displayedHit = clamp(rawHit - defenderAvoid, 0, 100);
  const trueHit = Math.round(trueHit2RN(displayedHit) * 10) / 10;

  // ComputeBattleUnitCritRate: weapon crit + skl/2. ComputeBattleUnitDodgeRate: lck.
  const rawCrit = attacker.weapon.crit + Math.floor(attacker.unit.skl / 2);
  const displayedCrit = clamp(rawCrit - defender.unit.lck, 0, 100);

  const as = attackSpeed(attacker);
  const doubles = as - attackSpeed(defender) >= FOLLOWUP_THRESHOLD;

  const hitsToKill = damage > 0 ? Math.ceil(defender.unit.hp / damage) : null;
  const roundsToKill =
    hitsToKill === null ? null : Math.ceil(hitsToKill / (doubles ? 2 : 1));

  return {
    damage,
    attackSpeed: as,
    displayedHit,
    trueHit,
    displayedCrit,
    doubles,
    hitsToKill,
    roundsToKill,
  };
}

export function buildDeterministic(player: Combatant, enemy: Combatant): DeterministicReport {
  return {
    playerVsEnemy: computeMatchup(player, enemy),
    enemyVsPlayer: computeMatchup(enemy, player),
  };
}

// One strike: roll 2RN to hit, then roll crit, and return damage dealt.
function strike(m: Matchup, rng: Rng): number {
  if (!roll2RN(m.displayedHit, rng)) return 0;
  const crit = rng.next100() < m.displayedCrit;
  return crit ? m.damage * 3 : m.damage;
}

// Simulate one full duel. The player initiates each engagement. Within an
// engagement the initiator strikes, the defender counters if alive, then any
// doubler strikes again, matching the GBA follow up order. Returns the 1 based
// engagement number on which someone died, or null for a stalemate.
function simulateDuel(
  pm: Matchup, em: Matchup, playerHp: number, enemyHp: number, rng: Rng, cap: number,
): { winner: "player" | "enemy" | null; rounds: number } {
  let pHp = playerHp;
  let eHp = enemyHp;
  for (let round = 1; round <= cap; round++) {
    eHp -= strike(pm, rng);
    if (eHp <= 0) return { winner: "player", rounds: round };
    pHp -= strike(em, rng);
    if (pHp <= 0) return { winner: "enemy", rounds: round };
    if (pm.doubles) {
      eHp -= strike(pm, rng);
      if (eHp <= 0) return { winner: "player", rounds: round };
    }
    if (em.doubles) {
      pHp -= strike(em, rng);
      if (pHp <= 0) return { winner: "enemy", rounds: round };
    }
  }
  return { winner: null, rounds: cap };
}

export interface MonteCarloOptions {
  seed: number;
  runs: number;
  roundCap?: number; // safety bound so a stalemate cannot loop forever
}

export function runMonteCarlo(
  player: Combatant, enemy: Combatant, opts: MonteCarloOptions,
): MonteCarloReport {
  const roundCap = opts.roundCap ?? 100;
  const pm = computeMatchup(player, enemy);
  const em = computeMatchup(enemy, player);
  const rng = makeRng(opts.seed);

  let playerWins = 0;
  let enemyWins = 0;
  let stalemates = 0;
  let decisiveRoundTotal = 0;
  const deathRoundHistogram: number[] = new Array(roundCap + 1).fill(0);

  for (let i = 0; i < opts.runs; i++) {
    const out = simulateDuel(pm, em, player.unit.hp, enemy.unit.hp, rng, roundCap);
    if (out.winner === "player") playerWins++;
    else if (out.winner === "enemy") enemyWins++;
    else stalemates++;
    if (out.winner !== null) {
      decisiveRoundTotal += out.rounds;
      deathRoundHistogram[out.rounds]++;
    }
  }

  const decisive = playerWins + enemyWins;
  const pct = (n: number) => Math.round((n / opts.runs) * 1000) / 10;
  return {
    seed: opts.seed,
    runs: opts.runs,
    playerWins,
    enemyWins,
    stalemates,
    playerWinRate: pct(playerWins),
    enemyWinRate: pct(enemyWins),
    averageRounds: decisive === 0 ? 0 : Math.round((decisiveRoundTotal / decisive) * 10) / 10,
    deathRoundHistogram,
  };
}
