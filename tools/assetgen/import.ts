// Import runner: for each game whose clean ROM is present, export the data tables
// and all portraits via FEBuilderGBA.CLI, normalize the data, and write everything
// under assets/reference/<game>/. Run directly: node tools/assetgen/import.ts
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, type Game, cliPath, romPath, gameDir, presentGames } from "./paths.ts";
import { normalizeTable } from "./normalize.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const TABLES = ["units", "classes", "items"] as const;

// Run the CLI. Data exports must exit 0. The portrait export can exit nonzero
// when some individual portraits fail to render ("render returned null") while
// still producing most PNGs, so the portrait caller passes tolerateNonzero and
// separately confirms that output was produced.
function runCli(args: string[], tolerateNonzero = false): void {
  const cli = cliPath(ROOT);
  const res = spawnSync(cli, args, { encoding: "utf8" });
  if (res.error) throw new Error(`Failed to run ${cli}: ${res.error.message}`);
  if (!tolerateNonzero && res.status !== 0) {
    throw new Error(`CLI exited ${res.status}: ${(res.stderr || res.stdout || "").trim()}`);
  }
}

async function importGame(game: Game): Promise<void> {
  const gdir = gameDir(ROOT, game);
  const rom = romPath(ROOT, game);
  const portraitsDir = join(gdir, "portraits");
  await mkdir(portraitsDir, { recursive: true });

  for (const table of TABLES) {
    const rawPath = join(gdir, `.raw-${table}.json`);
    runCli([`--rom=${rom}`, "--export-data", `--table=${table}`, "--format=json", `--out=${rawPath}`]);
    const raw = JSON.parse(await readFile(rawPath, "utf8"));
    await writeFile(join(gdir, `${table}.json`), JSON.stringify(normalizeTable(raw), null, 2) + "\n", "utf8");
    await rm(rawPath, { force: true });
    console.log(`  ${game}: ${table} imported`);
  }

  // Portraits: tolerate a nonzero exit from partial render failures, then
  // confirm at least one PNG was produced.
  runCli([`--rom=${rom}`, "--export-portrait-all", `--out=${portraitsDir}`], true);
  const pngs = (await readdir(portraitsDir)).filter((f) => f.endsWith(".png"));
  if (pngs.length === 0) throw new Error(`${game}: no portraits were exported`);
  console.log(`  ${game}: portraits imported (${pngs.length})`);
}

async function main(): Promise<void> {
  const cli = cliPath(ROOT);
  if (!existsSync(cli)) {
    throw new Error(`FEBuilderGBA.CLI not found at ${cli}. See the README "asset gallery" section to install it.`);
  }
  const games = presentGames(ROOT);
  if (games.length === 0) {
    throw new Error(`No clean ROM found in base/ (expected one of: ${GAMES.map((g) => romPath(ROOT, g)).join(", ")}).`);
  }
  console.log(`Importing: ${games.join(", ")}`);
  for (const game of games) await importGame(game);
  console.log("Done. Open the gallery with Gallery.cmd.");
}

main().catch((e) => { console.error("import error:", (e as Error).message); process.exit(1); });
