// Node file IO for the MCP handlers: JSON reads, atomic writes (so the polling viewer
// never reads a half-written file), the merged class table, and resolving scenarios
// and maps from disk using the shared scenarioSources rules.
import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { scenarioSources, CLASS_PATHS, type ScenarioSources } from "../src/grid/scenariosrc.ts";
import { resolveScenario, resolveMap, validateTerrainDefs } from "../src/grid/resolve.ts";
import type { ResolvedScenario, ResolvedMap, TerrainDef } from "../src/grid/types.ts";

export async function readJson(root: string, rel: string): Promise<any> {
  return JSON.parse(await readFile(join(root, rel), "utf8"));
}

export async function readJsonOpt(root: string, rel: string, fallback: any): Promise<any> {
  try {
    return await readJson(root, rel);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

export async function writeJsonAtomic(root: string, rel: string, value: unknown): Promise<void> {
  const target = join(root, rel);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, target);
}

export async function loadClassesAll(root: string): Promise<Record<string, any>> {
  const fe8 = await readJsonOpt(root, CLASS_PATHS.fe8, {});
  const custom = await readJson(root, CLASS_PATHS.custom);
  return { ...fe8, ...custom };
}

// Read a terrain or map file named by scenarioSources, with a clear message when it
// is missing: FE8 data needs the Generate Maps import, custom maps need the file.
async function readSource(root: string, rel: string, src: ScenarioSources): Promise<any> {
  try {
    return await readJson(root, rel);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    if (src.fe8) throw new Error(`FE8 data ${rel} not found: run Generate Maps to import FE8 chapters`);
    throw new Error(`unknown map: ${rel}`);
  }
}

export async function resolveScenarioOnDisk(root: string, enc: any): Promise<ResolvedScenario> {
  const src = scenarioSources(enc);
  const [units, weapons, classes, skills, terrain, map] = await Promise.all([
    readJson(root, "data/units.json"),
    readJson(root, "data/weapons.json"),
    loadClassesAll(root),
    readJsonOpt(root, "data/skills.json", {}),
    readSource(root, src.terrainPath, src),
    readSource(root, src.mapPath, src),
  ]);
  return resolveScenario(enc, units, weapons, terrain, classes, map, skills);
}

export async function resolveMapOnDisk(root: string, mapId: string): Promise<{ map: ResolvedMap; terrainDefs: Record<string, TerrainDef> }> {
  const src = scenarioSources({ map: mapId });
  const terrainDefs = validateTerrainDefs(await readSource(root, src.terrainPath, src));
  const map = resolveMap(await readSource(root, src.mapPath, src), terrainDefs);
  return { map, terrainDefs };
}

// Read a multi-unit scenario file as stored (placements may lack ids in older files).
export async function readScenario(root: string, id: string): Promise<any> {
  const raw = await readJsonOpt(root, `encounters/${id}.json`, null);
  if (!raw) throw new Error(`scenario ${id} not found`);
  if (!Array.isArray(raw.units)) throw new Error(`encounter ${id} is not a multi-unit scenario (no units list)`);
  return raw;
}
