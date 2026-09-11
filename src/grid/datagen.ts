// Node-side loader: read the config files, then hand the parsed objects to the
// pure resolver. Uses node:fs, so this file is imported only by Node (tests and
// any headless tools), never by the browser client.
import { readFile } from "node:fs/promises";
import { resolveGridEncounter } from "./resolve.ts";
import type { GridEncounter } from "./types.ts";

async function readJson(path: string): Promise<any> {
  let text: string;
  try { text = await readFile(path, "utf8"); }
  catch { throw new Error(`Cannot read config file: ${path}`); }
  try { return JSON.parse(text); }
  catch (e) { throw new Error(`Invalid JSON in ${path}: ${(e as Error).message}`); }
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
  const rawTerrain = await readJson(paths.terrainPath ?? "data/terrain.json");
  const rawClasses = await readJson(paths.classesPath ?? "data/classes.json");
  const rawMap = await readJson(`${paths.mapsDir ?? "maps"}/${rawEnc.map}.json`);
  return resolveGridEncounter(rawEnc, rawUnits, rawWeapons, rawTerrain, rawClasses, rawMap);
}
