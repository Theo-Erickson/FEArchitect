// Node-side loader: read the config files, then hand the parsed objects to the
// pure resolver. Uses node:fs, so this file is imported only by Node (tests and
// any headless tools), never by the browser client.
import { readFile } from "node:fs/promises";
import { resolveGridEncounter, resolveScenario } from "./resolve.ts";
import type { GridEncounter, ResolvedScenario } from "./types.ts";

async function readJson(path: string): Promise<any> {
  let text: string;
  try { text = await readFile(path, "utf8"); }
  catch { throw new Error(`Cannot read config file: ${path}`); }
  try { return JSON.parse(text); }
  catch (e) { throw new Error(`Invalid JSON in ${path}: ${(e as Error).message}`); }
}

// Read JSON if present, else return the fallback (for optional files).
async function readJsonOpt(path: string, fallback: any): Promise<any> {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

// The class set: the custom committed classes plus, when present, the FE8 sim class
// library (seeded, gitignored). Custom ids win on a collision.
async function loadClasses(paths: GridLoadPaths): Promise<Record<string, any>> {
  const custom = await readJson(paths.classesPath ?? "data/classes.json");
  const fe8 = await readJsonOpt("assets/reference/fe8/sim-classes.json", {});
  return { ...fe8, ...custom };
}

export interface GridLoadPaths {
  unitsPath?: string;
  weaponsPath?: string;
  terrainPath?: string;
  classesPath?: string;
  mapsDir?: string;
}

export async function loadGridEncounter(encounterPath: string, paths: GridLoadPaths = {}): Promise<GridEncounter> {
  const rawEnc = await readJson(encounterPath);
  const rawUnits = await readJson(paths.unitsPath ?? "data/units.json");
  const rawWeapons = await readJson(paths.weaponsPath ?? "data/weapons.json");
  const rawClasses = await loadClasses(paths);
  const rawSkills = await readJsonOpt("data/skills.json", {});
  // An encounter with "terrain": "fe8" plays on a real chapter: authentic terrain
  // defs and the per-chapter terrain id grid, both generated under assets/reference.
  const useFe8 = rawEnc.terrain === "fe8";
  const rawTerrain = await readJson(
    paths.terrainPath ?? (useFe8 ? "assets/reference/fe8/terrain.json" : "data/terrain.json"));
  const mapPath = useFe8
    ? `assets/reference/fe8/terrain/${String(rawEnc.map).replace(/^fe8-/, "")}.json`
    : `${paths.mapsDir ?? "maps"}/${rawEnc.map}.json`;
  const rawMap = await readJson(mapPath);
  return resolveGridEncounter(rawEnc, rawUnits, rawWeapons, rawTerrain, rawClasses, rawMap, rawSkills);
}

// Load a multi-unit scenario (or a 1v1 encounter) as placed, resolved units.
export async function loadScenario(encounterPath: string, paths: GridLoadPaths = {}): Promise<ResolvedScenario> {
  const rawEnc = await readJson(encounterPath);
  const rawUnits = await readJson(paths.unitsPath ?? "data/units.json");
  const rawWeapons = await readJson(paths.weaponsPath ?? "data/weapons.json");
  const rawClasses = await loadClasses(paths);
  const rawSkills = await readJsonOpt("data/skills.json", {});
  const useFe8 = rawEnc.terrain === "fe8";
  const rawTerrain = await readJson(
    paths.terrainPath ?? (useFe8 ? "assets/reference/fe8/terrain.json" : "data/terrain.json"));
  const mapPath = useFe8
    ? `assets/reference/fe8/terrain/${String(rawEnc.map).replace(/^fe8-/, "")}.json`
    : `${paths.mapsDir ?? "maps"}/${rawEnc.map}.json`;
  const rawMap = await readJson(mapPath);
  return resolveScenario(rawEnc, rawUnits, rawWeapons, rawTerrain, rawClasses, rawMap, rawSkills);
}
