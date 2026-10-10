// Shared contracts for the whole slice. Declarations only, no runtime code.

export type WeaponType =
  | "sword" | "lance" | "axe" | "bow"
  | "anima" | "light" | "dark" | "staff";

// The three weapon types that form the melee weapon triangle.
export const TRIANGLE_TYPES: readonly WeaponType[] = ["sword", "lance", "axe"];

// Magic weapon types. In this project the strength / magic split is enabled,
// so magic weapons use the mag stat and target res. Vanilla FE8 uses a single
// pow stat for both, see the note in combat.ts.
export const MAGIC_TYPES: readonly WeaponType[] = ["anima", "light", "dark"];

export interface WeaponDef {
  name: string;
  type: WeaponType;
  rank: string;   // "E".."S", not enforced in slice A
  might: number;
  hit: number;
  crit: number;
  weight: number;
  range?: number; // attack range in tiles; defaults to 1 (melee) when absent
}

export interface UnitDef {
  name: string;
  hp: number;
  str: number;
  mag: number;
  skl: number;
  spd: number;
  lck: number;
  def: number;
  res: number;
  con: number;
}

// One resolved fighter: a unit plus the specific weapon it wields.
export interface Combatant {
  id: string;       // the unit key, for display
  unit: UnitDef;
  weaponId: string;
  weapon: WeaponDef;
}

export interface EncounterSpec {
  id: string;
  notes?: string;
  player: { unit: string; weapon: string };
  enemy: { unit: string; weapon: string };
}

// Everything the combat engine needs, with references already resolved.
export interface DataBundle {
  weapons: Record<string, WeaponDef>;
  units: Record<string, UnitDef>;
  encounter: EncounterSpec;
  player: Combatant;
  enemy: Combatant;
}

// What one attacker does to one defender in a single matchup.
export interface Matchup {
  damage: number;         // per hit, floored at 0, no crit
  attackSpeed: number;
  displayedHit: number;   // 0..100
  trueHit: number;        // 0..100, 2RN corrected, rounded to 1 decimal
  displayedCrit: number;  // 0..100
  doubles: boolean;
  hitsToKill: number | null;   // ceil(targetHp / damage), null if damage is 0
  roundsToKill: number | null; // hitsToKill split by doubling, null if cannot kill
}

export interface DeterministicReport {
  playerVsEnemy: Matchup;
  enemyVsPlayer: Matchup;
}

export interface MonteCarloReport {
  seed: number;
  runs: number;
  playerWins: number;
  enemyWins: number;
  stalemates: number;
  playerWinRate: number;   // 0..100
  enemyWinRate: number;    // 0..100
  averageRounds: number;   // over decisive duels
  // deathRoundHistogram[i] = how many duels ended on engagement i (1 based).
  deathRoundHistogram: number[];
}

export interface PreviewResult {
  encounterId: string;
  deterministic: DeterministicReport;
  monteCarlo: MonteCarloReport;
}

// A terrain tile's contribution to the defender in a matchup.
export interface TerrainMod {
  avoid: number;
  def: number;
  res?: number; // terrain bonus applied against magic (physical uses def)
}
