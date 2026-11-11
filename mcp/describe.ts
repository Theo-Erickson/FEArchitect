// Pure text views so the MCP can see a map and a scenario: an ASCII grid with
// coordinate rulers, a terrain legend, units overlaid with letter markers, a unit
// table, and the checker's problems. Deterministic for testing.
import type { ResolvedMap, ResolvedScenario, TerrainDef } from "../src/grid/types.ts";
import type { Problem } from "../src/grid/scenariocheck.ts";

const TERRAIN_SYMBOLS = ".,:;~^#%&*+=-_!?/|<>()[]{}$`'";
const PLAYER_MARKS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ENEMY_MARKS = "abcdefghijklmnopqrstuvwxyz0123456789";
const OVERFLOW = "@";

export interface MapDescription { id: string; width: number; height: number; text: string; }
export interface UnitRow {
  mark: string; id: string; side: string; name: string; className: string; level: number | null;
  at: [number, number]; stats: Record<string, number>; weapon: string; ai: string;
}
export interface ScenarioDescription { id: string; text: string; units: UnitRow[]; problems: Problem[]; }

// Most common terrain gets ".", ties broken by terrain id.
function terrainSymbols(map: ResolvedMap): Map<string, string> {
  const count = new Map<string, number>();
  for (const row of map.terrain) for (const t of row) count.set(t, (count.get(t) ?? 0) + 1);
  const order = [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)! || a.localeCompare(b));
  if (order.length > TERRAIN_SYMBOLS.length) {
    throw new Error(`map ${map.id} has ${order.length} terrain types, more than ${TERRAIN_SYMBOLS.length} can be drawn`);
  }
  return new Map(order.map((t, i) => [t, TERRAIN_SYMBOLS[i]]));
}

function gridLines(map: ResolvedMap, cell: (x: number, y: number) => string): string[] {
  const pad = "   ";
  const xs = Array.from({ length: map.width }, (_, x) => x);
  const lines: string[] = [];
  if (map.width > 10) lines.push(pad + xs.map((x) => (x >= 10 ? String(Math.floor(x / 10) % 10) : " ")).join(""));
  lines.push(pad + xs.map((x) => String(x % 10)).join(""));
  for (let y = 0; y < map.height; y++) lines.push(String(y).padStart(2, " ") + " " + xs.map((x) => cell(x, y)).join(""));
  return lines;
}

function cost(c: number | null | undefined): string {
  return c == null ? "-" : String(c);
}

function legendLines(sym: Map<string, string>, defs: Record<string, TerrainDef>): string[] {
  const lines = ["legend (move cost foot/cav/fly, - = impassable):"];
  for (const [tid, s] of sym) {
    const d: any = defs[tid] ?? {};
    const heal = d.heal ? ` heal ${d.heal}` : "";
    lines.push(`${s} ${d.name ?? tid} [${tid}] def ${d.def ?? 0} avoid ${d.avoid ?? 0}${heal} move ${cost(d.moveCost?.foot)}/${cost(d.moveCost?.cav)}/${cost(d.moveCost?.fly)}`);
  }
  return lines;
}

export function describeMap(map: ResolvedMap, defs: Record<string, TerrainDef>): MapDescription {
  const sym = terrainSymbols(map);
  const lines = [
    `map ${map.id}: ${map.width}x${map.height} (x right, y down)`,
    ...gridLines(map, (x, y) => sym.get(map.terrain[y][x])!),
    "",
    ...legendLines(sym, defs),
  ];
  return { id: map.id, width: map.width, height: map.height, text: lines.join("\n") };
}

export function describeScenario(sc: ResolvedScenario, problems: Problem[]): ScenarioDescription {
  const { map } = sc;
  const sym = terrainSymbols(map);
  let pi = 0;
  let ei = 0;
  const units: UnitRow[] = sc.units.map((u) => {
    const mark = u.side === "player" ? (PLAYER_MARKS[pi++] ?? OVERFLOW) : (ENEMY_MARKS[ei++] ?? OVERFLOW);
    const s: any = u.unit;
    return {
      mark, id: u.id, side: u.side, name: u.unit.name, className: u.cls.name, level: u.level ?? null,
      at: [u.pos.x, u.pos.y],
      stats: { hp: s.hp, str: s.str, mag: s.mag, skl: s.skl, spd: s.spd, lck: s.lck, def: s.def, res: s.res, con: s.con },
      weapon: u.weapon.name, ai: u.ai,
    };
  });
  const byTile = new Map<string, string>();
  for (const r of units) {
    const key = `${r.at[0]},${r.at[1]}`;
    byTile.set(key, byTile.has(key) ? OVERFLOW : r.mark);
  }
  const statText = (st: Record<string, number>) =>
    `HP ${st.hp} Str ${st.str} Mag ${st.mag} Skl ${st.skl} Spd ${st.spd} Lck ${st.lck} Def ${st.def} Res ${st.res} Con ${st.con}`;
  const lines = [
    `scenario ${sc.id} on ${map.id}: ${map.width}x${map.height} (x right, y down)`,
    ...gridLines(map, (x, y) => byTile.get(`${x},${y}`) ?? sym.get(map.terrain[y][x])!),
    "",
    ...legendLines(sym, sc.terrainDefs),
    "",
    "units:",
    ...units.map((r) =>
      `${r.mark} ${r.id} (${r.side}) ${r.name}, ${r.className} L${r.level ?? "-"}, at [${r.at[0]},${r.at[1]}], ${statText(r.stats)}, ${r.weapon}, ai ${r.ai}`),
    "",
    ...(problems.length ? ["problems:", ...problems.map((p) => `${p.level}: ${p.message}`)] : ["problems: none"]),
  ];
  return { id: sc.id, text: lines.join("\n"), units, problems };
}
