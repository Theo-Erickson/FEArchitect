// The hub's index of every FEArchitect tool: what it is, when to reach for it,
// what it needs, and how to start it. Pure data plus pure helpers so the server
// and the tests share one source of truth. Each tool mirrors a launchers/*.cmd.

export const GROUPS = ["Design & sim", "Assets", "AI", "Dev"] as const;
export type Group = (typeof GROUPS)[number];

export interface Prereq {
  label: string;
  /** Repo-relative path that must exist. Omit for a note the hub cannot check. */
  path?: string;
}

export interface Tool {
  id: string;
  name: string;
  group: Group;
  /** One line: what it does. */
  summary: string;
  /** One line: when to use it. */
  when: string;
  /** Script run with node, repo-relative, plus its arguments. */
  script: string[];
  /** Extra node flags placed before the script (e.g. --test). */
  nodeArgs?: string[];
  /** Long-running local web server: port and page to open. */
  serve?: { port: number; path: string };
  /** Needs a keyboard: opens in its own console window instead of the log panel. */
  interactive?: boolean;
  prereqs: Prereq[];
  /** The double-click equivalent, for people who prefer Explorer. */
  launcher: string;
}

const ROM: Prereq = { label: "Clean FE8 ROM at base/FE8_Clean.gba", path: "base/FE8_Clean.gba" };
const CLI: Prereq = { label: "FEBuilderGBA.CLI in tools/febuilder-cli/", path: "tools/febuilder-cli/FEBuilderGBA.CLI.exe" };
const IMPORTED: Prereq = { label: "Imported assets (run Import Assets)", path: "assets/reference/fe8/units.json" };

export const TOOLS: Tool[] = [
  {
    id: "editor", name: "Editor", group: "Design & sim",
    summary: "Edit unit stats and weapons with the fight math updating live beside them.",
    when: "Tuning a duel: change a number, see hit, damage and crit move, then Save.",
    script: ["src/server.ts"], serve: { port: 5173, path: "/" },
    prereqs: [], launcher: "launchers/Open Editor.cmd",
  },
  {
    id: "play-map", name: "Play Map", group: "Design & sim",
    summary: "The 1v1 tactical grid: move, attack, end turn, or auto play from the seed.",
    when: "Checking how class movement and terrain shape a single fight.",
    script: ["src/server.ts", "/src/game/index.html"], serve: { port: 5173, path: "/src/game/index.html" },
    prereqs: [], launcher: "launchers/Play Map.cmd",
  },
  {
    id: "scenario", name: "Play Scenario", group: "Design & sim",
    summary: "Multi-unit scenarios with unit inspection, matchup forecasts and enemy AI.",
    when: "Playing a whole encounter out, not just one matchup.",
    script: ["src/server.ts", "/src/game/scenario.html"], serve: { port: 5173, path: "/src/game/scenario.html" },
    prereqs: [], launcher: "launchers/Play Scenario.cmd",
  },
  {
    id: "preview", name: "Duel Preview", group: "Design & sim",
    summary: "Prints the headless fight math for the baseline duel.",
    when: "A quick numbers check without opening a browser.",
    script: ["src/preview.ts", "encounters/duel-01.json"],
    prereqs: [], launcher: "launchers/Preview.cmd",
  },
  {
    id: "preview-cli", name: "Preview (ops CLI)", group: "Design & sim",
    summary: "The same duel preview through the shared operations layer the MCP server uses.",
    when: "Confirming the CLI and MCP path agree with the editor.",
    script: ["mcp/cli.ts", "preview", "duel-01"],
    prereqs: [], launcher: "launchers/Preview (CLI).cmd",
  },
  {
    id: "simulate", name: "Simulate Skirmish", group: "Design & sim",
    summary: "Runs the baseline grid skirmish headlessly and prints the turn log.",
    when: "Seeing how a skirmish plays out turn by turn without clicking through it.",
    script: ["mcp/cli.ts", "simulate", "skirmish-01"],
    prereqs: [], launcher: "launchers/Simulate.cmd",
  },
  {
    id: "import", name: "Import Assets", group: "Assets",
    summary: "Imports units, classes, items and portraits from your clean ROMs.",
    when: "First-time setup, or after adding another game's ROM to base/.",
    script: ["tools/assetgen/import.ts"],
    prereqs: [CLI, ROM], launcher: "launchers/Import Assets.cmd",
  },
  {
    id: "gallery", name: "Asset Gallery", group: "Assets",
    summary: "Browse units, classes, items, portraits, battle animations and chapter maps.",
    when: "Looking something up in the canon, or eyeballing a rendered chapter map.",
    script: ["gallery/server.ts"], serve: { port: 5174, path: "/" },
    prereqs: [IMPORTED], launcher: "launchers/Gallery.cmd",
  },
  {
    id: "maps", name: "Generate Maps", group: "Assets",
    summary: "Renders every FE8 chapter map to PNG for the gallery's Maps tab.",
    when: "Once after importing. Safe to re-run: it skips maps already rendered.",
    script: ["tools/assetgen/mapgen.ts"],
    prereqs: [ROM], launcher: "launchers/Generate Maps.cmd",
  },
  {
    id: "anims", name: "Cache Animations", group: "Assets",
    summary: "Pre-generates every battle animation GIF so the Animations tab is instant.",
    when: "Optional. Run it once when you have a few minutes; it skips what is cached.",
    script: ["tools/assetgen/precache.ts"],
    prereqs: [CLI, IMPORTED], launcher: "launchers/Cache Animations.cmd",
  },
  {
    id: "bridge", name: "Local AI Bridge", group: "AI",
    summary: "Chat with a local Ollama model that reads, edits and simulates for you.",
    when: "Natural-language edits with no cloud: \"raise Eirika's speed and simulate\".",
    script: ["mcp/bridge.ts"], interactive: true,
    prereqs: [
      { label: "MCP dependencies (cd mcp && npm install)", path: "mcp/node_modules" },
      { label: "Ollama running with qwen2.5 pulled" },
    ],
    launcher: "launchers/Bridge.cmd",
  },
  {
    id: "test", name: "Run Tests", group: "Dev",
    summary: "Runs the whole test suite.",
    when: "Before committing, or to check nothing broke after a change.",
    script: [], nodeArgs: ["--test"],
    prereqs: [], launcher: "launchers/Test.cmd",
  },
];

export function findTool(id: string): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function groupTools(tools: Tool[]): { group: Group; tools: Tool[] }[] {
  return GROUPS.map((group) => ({ group, tools: tools.filter((t) => t.group === group) }))
    .filter((g) => g.tools.length > 0);
}

export function prereqStatus(tool: Tool, exists: (rel: string) => boolean): (Prereq & { ok: boolean })[] {
  return tool.prereqs.map((p) => ({ ...p, ok: p.path ? exists(p.path) : true }));
}

export interface SpawnSpec {
  command: string;
  args: string[];
  cwd: string;
  /** True when the tool runs in its own console window (no streamed output). */
  console: boolean;
}

export function spawnSpec(tool: Tool, root: string, node: string): SpawnSpec {
  const nodeArgs = ["--no-warnings", ...(tool.nodeArgs ?? []), ...tool.script];
  if (tool.interactive) {
    // `start "title" cmd /k ...` opens a new console that stays open after exit.
    return {
      command: "cmd",
      args: ["/c", "start", `FEArchitect ${tool.name.replace(/^Local AI /, "")}`, "cmd", "/k", node, ...nodeArgs],
      cwd: root,
      console: true,
    };
  }
  return { command: node, args: nodeArgs, cwd: root, console: false };
}

/** The command a person would type to run the tool themselves. */
export function commandLine(tool: Tool): string {
  return ["node", ...(tool.nodeArgs ?? []), ...tool.script].join(" ");
}

export function toolUrl(tool: Tool): string | undefined {
  return tool.serve ? `http://localhost:${tool.serve.port}${tool.serve.path}` : undefined;
}

export function sameServer(a: Tool, b: Tool): boolean {
  return !!a.serve && !!b.serve && a.serve.port === b.serve.port;
}
