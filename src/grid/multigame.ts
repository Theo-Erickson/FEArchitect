// Multi-unit tactical game state and engine. Orchestrates the pure movement, combat,
// and terrain helpers for N units per side. The 1v1 GameState in game.ts is separate
// and unchanged. See the tactical play spec.
import type { ResolvedMap, TerrainDef, GridUnit, Side, GameStatus, TileVec, ResolvedScenario } from "./types.ts";
import type { Combatant } from "../types.ts";
import { makeRng, type Rng } from "../rng.ts";
import { computeReachable, tileKey } from "./movement.ts";
import { weaponRange, manhattan } from "./range.ts";
import { resolveExchange } from "../combat.ts";
import { terrainMod } from "./terrain.ts";

export interface MultiGame {
  id: string;
  map: ResolvedMap;
  terrainDefs: Record<string, TerrainDef>;
  units: GridUnit[];
  phase: Side;
  turn: number;
  acted: Set<string>;
  rng: Rng;
  log: string[];
}

export function createMultiGame(sc: ResolvedScenario, seed: number): MultiGame {
  return {
    id: sc.id, map: sc.map, terrainDefs: sc.terrainDefs,
    units: sc.units.map((u) => ({ ...u, pos: { ...u.pos } })),
    phase: "player", turn: 1, acted: new Set(), rng: makeRng(seed), log: [],
  };
}

export function unitById(g: MultiGame, id: string): GridUnit | undefined { return g.units.find((u) => u.id === id); }
export function unitAt(g: MultiGame, x: number, y: number): GridUnit | undefined { return g.units.find((u) => u.pos.x === x && u.pos.y === y); }

function blockers(g: MultiGame, exceptId: string): Set<string> {
  const s = new Set<string>();
  for (const u of g.units) if (u.id !== exceptId) s.add(tileKey(u.pos));
  return s;
}

export function reachableFor(g: MultiGame, id: string): Set<string> {
  const u = unitById(g, id);
  if (!u || u.side !== g.phase || g.acted.has(id)) return new Set();
  return computeReachable(g.map, g.terrainDefs, { movementType: u.cls.movementType, move: u.cls.move, from: u.pos }, blockers(g, id)).tiles;
}

export function canAttack(g: MultiGame, attackerId: string, targetId: string): boolean {
  const a = unitById(g, attackerId), t = unitById(g, targetId);
  if (!a || !t || a.side === t.side) return false;
  return manhattan(a.pos, t.pos) <= weaponRange(a.weapon);
}

function combatant(u: GridUnit): Combatant {
  return { id: u.id, unit: u.unit, weaponId: u.weapon.name, weapon: u.weapon, skills: u.skills };
}

export function attack(g: MultiGame, attackerId: string, targetId: string): void {
  const a = unitById(g, attackerId), t = unitById(g, targetId);
  if (!a || !t) throw new Error(`attack references a missing unit`);
  if (!canAttack(g, attackerId, targetId)) throw new Error(`${attackerId} cannot reach ${targetId}`);
  const atkTid = g.map.terrain[a.pos.y][a.pos.x], defTid = g.map.terrain[t.pos.y][t.pos.x];
  const res = resolveExchange({
    attacker: combatant(a), defender: combatant(t), attackerHp: a.hp, defenderHp: t.hp,
    attackerTerrain: terrainMod(g.terrainDefs, atkTid, a.cls.movementType),
    defenderTerrain: terrainMod(g.terrainDefs, defTid, t.cls.movementType),
    defenderCanCounter: manhattan(a.pos, t.pos) <= weaponRange(t.weapon), rng: g.rng,
  });
  a.hp = res.attackerHp; t.hp = res.defenderHp;
  for (const e of res.events) {
    const who = e.attackerId === a.id ? a : t, whom = e.defenderId === a.id ? a : t;
    g.log.push(e.hit
      ? `${who.unit.name} hit ${whom.unit.name} for ${e.damage}${e.crit ? " (crit)" : ""}, HP ${e.defenderHpAfter}`
      : `${who.unit.name} missed ${whom.unit.name}`);
  }
  g.units = g.units.filter((u) => u.hp > 0);
}

export function moveUnit(g: MultiGame, id: string, to: TileVec): void {
  const u = unitById(g, id);
  if (!u) throw new Error(`move references a missing unit: ${id}`);
  if (!reachableFor(g, id).has(tileKey(to))) throw new Error(`tile ${tileKey(to)} is not reachable for ${id}`);
  u.pos = { x: to.x, y: to.y };
}

export function act(g: MultiGame, id: string, to: TileVec, targetId?: string | null): void {
  moveUnit(g, id, to);
  if (targetId) attack(g, id, targetId);
  g.acted.add(id);
}

function healTile(g: MultiGame, u: GridUnit): void {
  const d = g.terrainDefs[g.map.terrain[u.pos.y][u.pos.x]];
  const heal = d?.heal ?? 0;
  if (heal > 0 && u.hp < u.unit.hp) {
    const gained = Math.min(u.unit.hp, u.hp + heal) - u.hp;
    u.hp += gained;
    if (gained > 0) g.log.push(`${u.unit.name} recovered ${gained} HP on ${d.name}`);
  }
}

export function endPhase(g: MultiGame): void {
  if (g.phase === "enemy") g.turn += 1;
  g.phase = g.phase === "player" ? "enemy" : "player";
  g.acted = new Set();
  for (const u of g.units) if (u.side === g.phase) healTile(g, u);
}

export function status(g: MultiGame): GameStatus {
  const players = g.units.some((u) => u.side === "player");
  const enemies = g.units.some((u) => u.side === "enemy");
  if (!enemies) return "player-won";
  if (!players) return "player-lost";
  return "ongoing";
}
