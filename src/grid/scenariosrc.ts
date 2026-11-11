// Pure helpers for scenario files, shared by the MCP handlers, the dev server, and the
// browser viewer: which data files a scenario needs, normalizing a scenario before it
// is written, and the scenario index used for listings. No node imports.

export interface ScenarioSources {
  fe8: boolean;
  terrainPath: string; // relative to the project root
  mapPath: string;     // relative to the project root
}

export interface ScenarioListing {
  id: string;
  map: string;
  notes: string;
}

// Classes are always the FE8 sim classes (optional, ROM derived) with the custom
// classes layered on top.
export const CLASS_PATHS = {
  fe8: "assets/reference/fe8/sim-classes.json",
  custom: "data/classes.json",
};

const FE8_PREFIX = /^fe8-/;

export function isFe8Map(mapId: string): boolean {
  return FE8_PREFIX.test(mapId);
}

export function scenarioSources(enc: { map?: unknown; terrain?: unknown }): ScenarioSources {
  if (typeof enc?.map !== "string" || enc.map === "") throw new Error(`Scenario needs a string map`);
  const fe8 = enc.terrain === "fe8" || isFe8Map(enc.map);
  if (fe8) {
    const chapter = enc.map.replace(FE8_PREFIX, "");
    return { fe8, terrainPath: "assets/reference/fe8/terrain.json", mapPath: `assets/reference/fe8/terrain/${chapter}.json` };
  }
  return { fe8, terrainPath: "data/terrain.json", mapPath: `maps/${enc.map}.json` };
}

// Prepare a scenario for writing: force its id, mark FE8 chapter maps, and give every
// placement a stable id. Explicit ids are reserved first; a missing id becomes the
// unit key, or the key plus -2, -3, and so on when taken. Returns a new object.
export function normalizeScenario(id: string, spec: any): any {
  if (!spec || typeof spec !== "object") throw new Error(`Scenario ${id} must be an object`);
  if (!Array.isArray(spec.units)) throw new Error(`Scenario ${id} needs a units list`);
  const out: any = { ...spec, id };
  if (typeof out.map === "string" && isFe8Map(out.map)) out.terrain = "fe8";
  const taken = new Set<string>();
  for (const p of spec.units) if (typeof p?.id === "string") taken.add(p.id);
  out.units = spec.units.map((p: any) => {
    if (typeof p?.id === "string") return { ...p };
    const base = String(p?.unit);
    let candidate = base;
    let n = 2;
    while (taken.has(candidate)) candidate = `${base}-${n++}`;
    taken.add(candidate);
    return { id: candidate, ...p };
  });
  return out;
}

// Build the scenario listing from encounter files: only files whose JSON has a units
// list count as multi-unit scenarios.
export function scenarioIndex(files: { file: string; json: any }[]): ScenarioListing[] {
  return files
    .filter((f) => f.file.endsWith(".json") && Array.isArray(f.json?.units))
    .map((f) => ({ id: f.file.replace(/\.json$/, ""), map: String(f.json.map ?? ""), notes: String(f.json.notes ?? "") }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
