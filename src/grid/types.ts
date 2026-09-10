// Grid-specific contracts. Declarations only.
import type { UnitDef, WeaponDef } from "../types.ts";

export type MovementType = "foot" | "cav" | "fly";

export interface TerrainDef {
  name: string;
  // Cost to ENTER a tile of this terrain per movement type. null = impassable.
  moveCost: Record<MovementType, number | null>;
  avoid: number;
  def: number;
}

export interface ClassDef {
  name: string;
  movementType: MovementType;
  move: number; // movement budget in points
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
