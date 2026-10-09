// Generate tile-accurate chapter map PNGs plus a maps.json index, for FE8 (its
// chapter struct is the one decoded in docs/superpowers/notes/fe8-map-format.md).
// Resumable: a chapter whose PNG already exists is skipped. Run:
//   node tools/assetgen/mapgen.ts
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, type Game, cliPath, romPath, gameDir, presentGames } from "./paths.ts";
import { decodeChapterMap, makeAssetResolver, CHAPTER_TABLE_ADDR, RECORD_SIZE } from "./mapdata.ts";
import { parsePalette, parseLayout, parseTsa } from "./maptiles.ts";
import { composeMap } from "./mapcompose.ts";
import { encodePng } from "./pngencode.ts";

const ROM_BASE = 0x08000000;
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

function run(cli: string, args: string[]): void {
  const r = spawnSync(cli, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`CLI exited ${r.status}: ${(r.stderr || r.stdout || "").trim().slice(0, 200)}`);
}

// Enumerate chapters as { index, name } from --export-map-settings (its Name column
// is the friendly chapter title). Records themselves are read from the ROM.
async function chapterList(cli: string, rom: string): Promise<{ index: number; name: string }[]> {
  const tsv = join(ROOT, ".map-settings.tsv");
  run(cli, ["--export-map-settings", `--rom=${rom}`, `--out=${tsv}`]);
  const lines = (await readFile(tsv, "utf8")).split(/\r?\n/).filter(Boolean).slice(1);
  await rm(tsv, { force: true });
  const out: { index: number; name: string }[] = [];
  for (const line of lines) {
    const cols = line.split("\t");
    const index = parseInt(cols[0], 16);
    if (Number.isFinite(index)) out.push({ index, name: (cols[1] ?? "").trim() });
  }
  return out;
}

type IndexRow = { index: number; name: string; width: number; height: number; file: string };

async function genGame(game: Game): Promise<void> {
  const cli = cliPath(ROOT);
  const rom = romPath(ROOT, game);
  const romBuf = await readFile(rom);
  const asset = makeAssetResolver(romBuf);
  const mapsDir = join(gameDir(ROOT, game), "maps");
  const tmpDir = join(ROOT, ".map-tmp");
  await mkdir(mapsDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  const index: IndexRow[] = [];
  let made = 0, skipped = 0, failed = 0;

  for (const ch of await chapterList(cli, rom)) {
    const pngPath = join(mapsDir, `${ch.index}.png`);
    const file = `maps/${ch.index}.png`;
    try {
      const recOff = (CHAPTER_TABLE_ADDR - ROM_BASE) + ch.index * RECORD_SIZE;
      const record = romBuf.subarray(recOff, recOff + RECORD_SIZE);
      const ptrs = decodeChapterMap(record, asset);
      const hex = (p: number) => `0x${p.toString(16)}`;
      const t = join(tmpDir, `${game}-${ch.index}`);
      run(cli, ["--export-asset", "--kind=map", `--rom=${rom}`, `--addr=${hex(ptrs.layoutPtr)}`, `--out=${t}.mar`]);
      run(cli, ["--export-asset", "--kind=objtiles", `--rom=${rom}`, `--addr=${hex(ptrs.objTilesPtr)}`, `--out=${t}.objtiles`]);
      run(cli, ["--export-asset", "--kind=mapchipconfig", `--rom=${rom}`, `--addr=${hex(ptrs.tileConfigPtr)}`, `--out=${t}.cfg`]);
      run(cli, ["--export-palette", "--colors=256", `--rom=${rom}`, `--addr=${hex(ptrs.palettePtr)}`, `--out=${t}.pal`]);

      const dims = JSON.parse((await readFile(`${t}.mar.json`, "utf8")).replace(/^﻿/, ""));
      const width = dims.width, height = dims.height;
      index.push({ index: ch.index, name: ch.name, width: width * 16, height: height * 16, file });
      if (existsSync(pngPath)) { skipped++; continue; }

      const layout = parseLayout(await readFile(`${t}.mar`), width, height);
      const tsa = parseTsa(await readFile(`${t}.cfg`));
      const tiles = await readFile(`${t}.objtiles`);
      const palette = parsePalette(await readFile(`${t}.pal`, "utf8"));
      const img = composeMap({ widthChips: width, heightChips: height, layout, tsa, tiles, palette });
      await writeFile(pngPath, encodePng(img.rgba, img.width, img.height));
      made++;
      console.log(`  ${game}: ${ch.index} ${ch.name} -> ${img.width}x${img.height}`);
    } catch (e) {
      failed++;
      console.log(`  ${game}: ${ch.index} ${ch.name} FAILED: ${(e as Error).message}`);
    }
  }

  await rm(tmpDir, { recursive: true, force: true });
  index.sort((a, b) => a.index - b.index);
  await writeFile(join(gameDir(ROOT, game), "maps.json"), JSON.stringify(index, null, 2) + "\n", "utf8");
  console.log(`  ${game}: done. ${made} made, ${skipped} cached, ${failed} failed, ${index.length} chapters indexed.`);
}

async function main(): Promise<void> {
  if (!existsSync(cliPath(ROOT))) throw new Error(`FEBuilderGBA.CLI not found. See the README asset gallery section.`);
  // FE8 only: the chapter struct decoded in the findings doc is FE8's. FE7 differs
  // and is a later track.
  const games = presentGames(ROOT).filter((g) => g === "fe8" && existsSync(romPath(ROOT, g)));
  if (games.length === 0) throw new Error(`FE8 ROM not found in base/ (expected ${romPath(ROOT, "fe8" as Game)}).`);
  console.log(`Generating maps for: ${games.join(", ")}`);
  for (const game of games) await genGame(game);
  console.log("All done. Open the gallery Maps tab.");
  void GAMES;
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
