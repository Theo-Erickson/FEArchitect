// Grid-specific contracts. Declarations only.
import type { StatBlock, UnitDef, WeaponDef, Skill } from "../types.ts";

export type MovementType = "foot" | "cav" | "fly";

export interface TerrainDef {
  name: string;
  // Cost to ENTER a tile of this terrain per movement type. null = impassable.
  moveCost: Record<MovementType, number | null>;
  avoid: number;
  def: number;
  // Authentic FE8 extras (optional: the hand-authored showcase terrain omits them).
  res?: number;
  flyAvoid?: number; // avoid/def/res a flying unit gets here (usually 0 in FE8)
  flyDef?: number;
  flyRes?: number;
  heal?: number;        // HP restored when ending a turn here (fort, throne)
  healsStatus?: boolean; // whether the tile also cures status
}

export interface ClassDef {
  name: string;
  movementType: MovementType;
  move: number; // movement budget in points
  // Authoring extras (optional so the minimal showcase classes still validate):
  bases?: Partial<StatBlock>;
  caps?: Partial<StatBlock>;
  growths?: Partial<StatBlock>;
  weaponRanks?: Record<string, string>;
  skills?: string[];
}

// An authored unit: a class plus a base statblock, growths, a level, and skills.
export interface UnitAuthor {
  name: string;
  class?: string;
  level?: number;
  baseLevel?: number;
  bases?: Partial<StatBlock>;
  growths?: Partial<StatBlock>;
  skills?: string[];
  // A flat-stat unit (current form) instead carries hp/str/... directly.
}

export interface TileVec {
  x: number;
  y: number;
}

// A map with its tiles resolved from legend chars into terrain ids.
export interface ResolvedMap {
  id: string;
  width: number;
  height: number;
  terrain: string[][]; // terrain[y][x] = terrain id
}

export type Side = "player" | "enemy";
export type AiKind = "aggressive" | "stationary";

// A fighter placed on the grid with live HP and position.
export interface GridUnit {
  id: string;      // unit key
  side: Side;
  unit: UnitDef;
  weapon: WeaponDef;
  cls: ClassDef;
  ai: AiKind;      // player defaults to "aggressive" but is normally human-driven
  pos: TileVec;
  hp: number;      // current HP
  level?: number;  // for display when the unit is authored
  skills?: Skill[]; // resolved combat-relevant skills
  portrait?: number; // portrait table index for the map token, if any
}

// A multi-unit scenario: units placed per side on a map, for the scenario viewer.
export interface ResolvedScenario {
  id: string;
  map: ResolvedMap;
  terrainDefs: Record<string, TerrainDef>;
  units: GridUnit[];
}

export interface GridEncounter {
  id: string;
  win: string;
  map: ResolvedMap;
  terrainDefs: Record<string, TerrainDef>;
  player: GridUnit;
  enemy: GridUnit;
}

export type GameStatus = "ongoing" | "player-won" | "player-lost";
