// One manifest of tools, shared by the MCP server and the bridge so their tool
// definitions cannot drift. Each entry carries a JSON-Schema parameter object and
// the handler to run. Handlers receive (projectRoot, args).
import * as h from "./handlers.ts";

export interface ToolSpec {
  name: string;
  description: string;
  params: { type: "object"; properties: Record<string, any>; required?: string[] };
  handler: (root: string, args: any) => Promise<unknown>;
}

export const TOOLSPECS: ToolSpec[] = [
  {
    name: "list",
    description: "List the ids of records of a kind: units, weapons, classes, terrain, encounters, or maps.",
    params: { type: "object", properties: { kind: { type: "string", description: "units|weapons|classes|terrain|encounters|maps" } }, required: ["kind"] },
    handler: (root, a) => h.list(root, a.kind),
  },
  {
    name: "get",
    description: "Get one record by kind and id. kind is unit, weapon, class, terrain, encounter, or map.",
    params: { type: "object", properties: { kind: { type: "string" }, id: { type: "string" } }, required: ["kind", "id"] },
    handler: (root, a) => h.get(root, a.kind, a.id),
  },
  {
    name: "preview_encounter",
    description: "Tier 1 math preview of an encounter: deterministic breakdown plus a seeded Monte Carlo. Positions are ignored.",
    params: { type: "object", properties: { id: { type: "string" }, seed: { type: "number" }, runs: { type: "number" } }, required: ["id"] },
    handler: (root, a) => h.previewEncounter(root, a.id, a.seed, a.runs),
  },
  {
    name: "simulate_skirmish",
    description: "Run a grid skirmish to a result headlessly. Returns status, turns, and the combat log. Requires an encounter with a map.",
    params: { type: "object", properties: { id: { type: "string" }, seed: { type: "number" } }, required: ["id"] },
    handler: (root, a) => h.simulateSkirmish(root, a.id, a.seed),
  },
  {
    name: "set_unit",
    description: "Create or update a unit. fields is an object of unit stats to merge (hp, str, mag, skl, spd, lck, def, res, con, name, class). Validated before writing.",
    params: { type: "object", properties: { id: { type: "string" }, fields: { type: "object" } }, required: ["id", "fields"] },
    handler: (root, a) => h.setUnit(root, a.id, a.fields),
  },
  {
    name: "set_weapon",
    description: "Create or update a weapon. fields merges weapon stats (name, type, rank, might, hit, crit, weight, range). Validated before writing.",
    params: { type: "object", properties: { id: { type: "string" }, fields: { type: "object" } }, required: ["id", "fields"] },
    handler: (root, a) => h.setWeapon(root, a.id, a.fields),
  },
  {
    name: "set_encounter",
    description: "Create or update an encounter. spec is the full encounter object (a duel, or a skirmish with a map and positions). Validated by resolving it before writing.",
    params: { type: "object", properties: { id: { type: "string" }, spec: { type: "object" } }, required: ["id", "spec"] },
    handler: (root, a) => h.setEncounter(root, a.id, a.spec),
  },
];

export function toolByName(name: string): ToolSpec | undefined {
  return TOOLSPECS.find((t) => t.name === name);
}
