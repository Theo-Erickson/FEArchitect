// The turn state machine. Holds mutable game state and exposes transitions the
// client calls. All randomness flows through a seeded RNG so runs replay.
import type { GridEncounter, GridUnit, TileVec, GameStatus, Side, MovementType } from "./types.ts";
import { computeReachable, findPath, tileKey } from "./movement.ts";
import { terrainMod } from "./terrain.ts";
import { weaponRange, manhattan } from "./range.ts";
import { decideAction } from "./ai.ts";
import { resolveExchange } from "../combat.ts";
import { makeRng, type Rng } from "../rng.ts";
import type { Combatant } from "../types.ts";

export interface GameState {
  enc: GridEncounter;
  player: GridUnit;
  enemy: GridUnit;
  phase: Side;
  turn: number;
  seed: number;
  rng: Rng;
  log: string[];
}

export function createGame(enc: GridEncounter, seed: number): GameState {
  return {
    enc, player: enc.player, enemy: enc.enemy,
    phase: "player", turn: 1, seed, rng: makeRng(seed), log: [],
  };
}

function unitById(g: GameState, id: string): GridUnit {
  return g.player.id === id ? g.player : g.enemy;
}
function opponentOf(g: GameState, id: string): GridUnit {
  return g.player.id === id ? g.enemy : g.player;
}

// Reachable tiles for a unit this phase, optionally overriding its movement type
// (used by the showcase movement-type selector). The opposing unit blocks tiles.
export function reachableFor(
  g: GameState, id: string, overrideMove?: { movementType: MovementType; move: number },
): Set<string> {
  const u = unitById(g, id);
  const foe = opponentOf(g, id);
  const opts = {
    movementType: overrideMove?.movementType ?? u.cls.movementType,
    move: overrideMove?.move ?? u.cls.move,
    from: u.pos,
  };
  return computeReachable(g.enc.map, g.enc.terrainDefs, opts, new Set([tileKey(foe.pos)])).tiles;
}

export function pathFor(g: GameState, id: string, to: TileVec) {
  const u = unitById(g, id);
  const foe = opponentOf(g, id);
  const opts = { movementType: u.cls.movementType, move: u.cls.move, from: u.pos };
  return findPath(g.enc.map, g.enc.terrainDefs, opts, to, new Set([tileKey(foe.pos)]));
}

export function applyMove(g: GameState, id: string, to: TileVec): void {
  if (!reachableFor(g, id).has(tileKey(to))) {
    throw new Error(`tile ${tileKey(to)} is not reachable for ${id}`);
  }
  unitById(g, id).pos = to;
}

function combatant(u: GridUnit): Combatant {
  return { id: u.id, unit: u.unit, weaponId: u.weapon.name, weapon: u.weapon };
}

export function applyAttack(g: GameState, attackerId: string, targetId: string): void {
  const attacker = unitById(g, attackerId);
  const target = unitById(g, targetId);
  const range = weaponRange(attacker.weapon);
  if (manhattan(attacker.pos, target.pos) > range) {
    throw new Error(`${attackerId} is not in range of ${targetId}`);
  }
  const defenderCanCounter = manhattan(attacker.pos, target.pos) <= weaponRange(target.weapon);
  const atkTerrainId = g.enc.map.terrain[attacker.pos.y][attacker.pos.x];
  const defTerrainId = g.enc.map.terrain[target.pos.y][target.pos.x];

  const result = resolveExchange({
    attacker: combatant(attacker),
    defender: combatant(target),
    attackerHp: attacker.hp,
    defenderHp: target.hp,
    attackerTerrain: terrainMod(g.enc.terrainDefs, atkTerrainId, attacker.cls.movementType),
    defenderTerrain: terrainMod(g.enc.terrainDefs, defTerrainId, target.cls.movementType),
    defenderCanCounter,
    rng: g.rng,
  });
  attacker.hp = result.attackerHp;
  target.hp = result.defenderHp;
  for (const e of result.events) {
    const who = e.attackerId === attacker.id ? attacker : target;
    const whom = e.defenderId === attacker.id ? attacker : target;
    g.log.push(
      e.hit
        ? `${who.unit.name} hit ${whom.unit.name} for ${e.damage}${e.crit ? " (crit)" : ""} [${e.displayedHit}%], ${whom.unit.name} HP ${e.defenderHpAfter}`
        : `${who.unit.name} missed ${whom.unit.name} [${e.displayedHit}%]`,
    );
  }
}

// Heal a unit standing on a healing tile (fort, throne), capped at its max HP.
// Returns the HP recovered. Terrain id with no heal, or a missing def, heals 0.
export function applyTileHeal(g: GameState, id: string): number {
  const u = unitById(g, id);
  const d = g.enc.terrainDefs[g.enc.map.terrain[u.pos.y][u.pos.x]];
  const heal = d?.heal ?? 0;
  if (heal <= 0) return 0;
  const before = u.hp;
  u.hp = Math.min(u.unit.hp, u.hp + heal);
  const gained = u.hp - before;
  if (gained > 0) g.log.push(`${u.unit.name} recovered ${gained} HP on ${d.name}`);
  return gained;
}

export function endPhase(g: GameState): void {
  if (g.phase === "enemy") g.turn += 1;
  g.phase = g.phase === "player" ? "enemy" : "player";
  // Units heal at the start of their own phase while standing on a healing tile.
  const active = g.phase === "player" ? g.player : g.enemy;
  if (active.hp > 0) applyTileHeal(g, active.id);
}

export function status(g: GameState): GameStatus {
  if (g.enemy.hp <= 0) return "player-won";
  if (g.player.hp <= 0) return "player-lost";
  return "ongoing";
}

// Run one unit's turn by AI: move to the decided tile, then attack if planned.
export function takeAiTurn(g: GameState, id: string): void {
  if (status(g) !== "ongoing") return;
  const action = decideAction(g.enc, id);
  const u = unitById(g, id);
  if (!(action.to.x === u.pos.x && action.to.y === u.pos.y)) {
    // The AI only proposes reachable tiles; guard anyway.
    if (reachableFor(g, id).has(tileKey(action.to))) u.pos = action.to;
  }
  if (action.attackTargetId) applyAttack(g, id, action.attackTargetId);
}
