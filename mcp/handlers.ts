// The FEArchitect operations, as pure async functions over a project root. Each
// frontend (MCP server, CLI, bridge) calls these. Reads and evaluation reuse the
// existing loaders and engine; writes validate in memory before touching disk.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { validateUnit, validateWeapon, validateEncounter } from "../src/validate.ts";
import { loadBundle } from "../src/datagen.ts";
import { loadGridEncounter } from "../src/grid/datagen.ts";
import { resolveGridEncounter } from "../src/grid/resolve.ts";
import { buildDeterministic, runMonteCarlo } from "../src/combat.ts";
import { createGame, takeAiTurn, endPhase, status } from "../src/grid/game.ts";
import type { Combatant } from "../src/types.ts";

const TABLE_FILES: Record<string, string> = {
  units: "data/units.json",
  weapons: "data/weapons.json",
  classes: "data/classes.json",
  terrain: "data/terrain.json",
};

async function readJson(root: string, rel: string): Promise<any> {
  return JSON.parse(await readFile(join(root, rel), "utf8"));
}
async function writeJson(root: string, rel: string, value: unknown): Promise<void> {
  await writeFile(join(root, rel), JSON.stringify(value, null, 2) + "\n", "utf8");
}
function gridPaths(root: string) {
  return {
    unitsPath: join(root, "data/units.json"),
    weaponsPath: join(root, "data/weapons.json"),
    terrainPath: join(root, "data/terrain.json"),
    classesPath: join(root, "data/classes.json"),
    mapsDir: join(root, "maps"),
  };
}

export async function list(root: string, kind: string): Promise<string[]> {
  if (kind in TABLE_FILES) return Object.keys(await readJson(root, TABLE_FILES[kind]));
  if (kind === "encounters" || kind === "maps") {
    const files = await readdir(join(root, kind));
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  }
  throw new Error(`unknown kind: ${kind}`);
}

export async function get(root: string, kind: string, id: string): Promise<any> {
  if (kind in TABLE_FILES) {
    const rec = (await readJson(root, TABLE_FILES[kind]))[id];
    if (!rec) throw new Error(`${kind} ${id} not found`);
    return rec;
  }
  const singular: Record<string, string> = { unit: "units", weapon: "weapons", class: "classes" };
  if (kind in singular) return get(root, singular[kind], id);
  if (kind === "encounter") return readJson(root, `encounters/${id}.json`);
  if (kind === "map") return readJson(root, `maps/${id}.json`);
  throw new Error(`unknown kind: ${kind}`);
}

// Resolve the two fighters of an encounter, whether it is a gridless duel or a
// grid skirmish. Returns objects usable as Combatant by the combat engine.
async function encounterSides(root: string, id: string): Promise<{ player: Combatant; enemy: Combatant }> {
  const raw = await readJson(root, `encounters/${id}.json`);
  const encPath = join(root, `encounters/${id}.json`);
  if (raw.map) {
    const enc = await loadGridEncounter(encPath, gridPaths(root));
    return { player: enc.player, enemy: enc.enemy };
  }
  const bundle = await loadBundle(encPath, {
    unitsPath: join(root, "data/units.json"),
    weaponsPath: join(root, "data/weapons.json"),
  });
  return { player: bundle.player, enemy: bundle.enemy };
}

export async function previewEncounter(root: string, id: string, seed = 42, runs = 1000) {
  const { player, enemy } = await encounterSides(root, id);
  return {
    encounterId: id,
    deterministic: buildDeterministic(player, enemy),
    monteCarlo: runMonteCarlo(player, enemy, { seed, runs }),
  };
}

export async function simulateSkirmish(root: string, id: string, seed = 1, turnCap = 50) {
  const raw = await readJson(root, `encounters/${id}.json`);
  if (!raw.map) throw new Error(`encounter ${id} is not a grid skirmish (no map)`);
  const enc = await loadGridEncounter(join(root, `encounters/${id}.json`), gridPaths(root));
  const g = createGame(enc, seed);
  while (status(g) === "ongoing" && g.turn <= turnCap) {
    takeAiTurn(g, g.phase === "player" ? g.player.id : g.enemy.id);
    endPhase(g);
  }
  return { status: status(g), turns: g.turn, log: g.log };
}

export async function setUnit(root: string, id: string, fields: Record<string, unknown>) {
  const units = await readJson(root, "data/units.json");
  const merged = { ...(units[id] ?? {}), ...fields };
  validateUnit(id, merged); // throws if invalid, leaving the file untouched
  units[id] = merged;
  await writeJson(root, "data/units.json", units);
  return merged;
}

export async function setWeapon(root: string, id: string, fields: Record<string, unknown>) {
  const weapons = await readJson(root, "data/weapons.json");
  const merged = { ...(weapons[id] ?? {}), ...fields };
  validateWeapon(id, merged);
  weapons[id] = merged;
  await writeJson(root, "data/weapons.json", weapons);
  return merged;
}

export async function setEncounter(root: string, id: string, spec: any) {
  const withId = { ...spec, id };
  if (withId.map) {
    // Validate by resolving against current data; throws on any bad reference.
    const [units, weapons, terrain, classes, map] = await Promise.all([
      readJson(root, "data/units.json"),
      readJson(root, "data/weapons.json"),
      readJson(root, "data/terrain.json"),
      readJson(root, "data/classes.json"),
      readJson(root, `maps/${withId.map}.json`),
    ]);
    resolveGridEncounter(withId, units, weapons, terrain, classes, map);
  } else {
    validateEncounter(id, withId);
    const units = await readJson(root, "data/units.json");
    const weapons = await readJson(root, "data/weapons.json");
    for (const side of ["player", "enemy"] as const) {
      if (!units[withId[side].unit]) throw new Error(`${side} references unknown unit: ${withId[side].unit}`);
      if (!weapons[withId[side].weapon]) throw new Error(`${side} references unknown weapon: ${withId[side].weapon}`);
    }
  }
  await writeJson(root, `encounters/${id}.json`, withId);
  return withId;
}
