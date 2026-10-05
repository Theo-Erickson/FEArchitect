// Pre-cache runner: for each game whose clean ROM is present, export every battle
// animation (all 12 sections of every class animation id) to the same on-disk
// cache the gallery serves from, so the Animations tab is instant offline. It is
// resumable: any GIF already cached is skipped. Run: node tools/assetgen/precache.ts
import { spawnSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, type Game, cliPath, romPath, gameDir, presentGames } from "./paths.ts";
import { animIndex } from "../../gallery/animindex.ts";
import { animArgs, animCacheRel, animTargets } from "../../gallery/galleryutil.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

// Mapped animation ids for a game, read from its ROM plus imported classes.json.
async function animIdsFor(game: Game): Promise<number[]> {
  const classesPath = join(gameDir(ROOT, game), "classes.json");
  if (!existsSync(classesPath)) return [];
  const classes = JSON.parse(await readFile(classesPath, "utf8"));
  const map = animIndex(await readFile(romPath(ROOT, game)), classes);
  return Object.keys(map).map(Number).sort((a, b) => a - b);
}

async function precacheGame(game: Game): Promise<void> {
  const ids = await animIdsFor(game);
  if (ids.length === 0) {
    console.log(`  ${game}: no animation ids mapped (missing classes.json?), skipping`);
    return;
  }
  const targets = animTargets(ids);
  const cli = cliPath(ROOT);
  const rom = romPath(ROOT, game);
  let made = 0, skipped = 0, failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const { id, section } = targets[i];
    const abs = join(ROOT, animCacheRel(game, id, section));
    if (existsSync(abs)) { skipped++; continue; }
    await mkdir(dirname(abs), { recursive: true });
    const r = spawnSync(cli, animArgs(rom, id, section, abs), { encoding: "utf8" });
    if (r.status === 0 && existsSync(abs)) made++;
    else failed++;
    // Progress every 100 targets and at the end, so a long run stays legible.
    if ((i + 1) % 100 === 0 || i === targets.length - 1) {
      console.log(`  ${game}: ${i + 1}/${targets.length} (made ${made}, skipped ${skipped}, failed ${failed})`);
    }
  }
  console.log(`  ${game}: done. ${made} made, ${skipped} already cached, ${failed} unavailable, from ${ids.length} animations.`);
}

async function main(): Promise<void> {
  const cli = cliPath(ROOT);
  if (!existsSync(cli)) {
    throw new Error(`FEBuilderGBA.CLI not found at ${cli}. See the README "asset gallery" section to install it.`);
  }
  const games = presentGames(ROOT).filter((g) => existsSync(join(gameDir(ROOT, g), "classes.json")));
  if (games.length === 0) {
    throw new Error(`No imported game found. Run Import Assets.cmd first (expected one of: ${GAMES.join(", ")}).`);
  }
  console.log(`Pre-caching animations for: ${games.join(", ")}`);
  for (const game of games) await precacheGame(game);
  console.log("All done. The gallery Animations tab will now load from the cache.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
