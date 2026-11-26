// Build the FE8 terrain tileset assets for the map viewers:
//   1. import: copy FE 8/*.png sheets out of Feaw's Tileset Collection zip into
//      assets/tilesets/fe8/ (skipped when no zip is given or found and sheets exist);
//   2. index: mine every FE8 chapter (ROM layout + tile config, via the CLI) into a
//      per-sheet terrain-context index next to the sheets.
// Run: node --no-warnings tools/assetgen/tilesets.ts [path/to/zip]
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cliPath, romPath, gameDir } from "./paths.ts";
import { decodeChapterMap, makeAssetResolver, CHAPTER_TABLE_ADDR, RECORD_SIZE } from "./mapdata.ts";
import { parseLayout } from "./maptiles.ts";
import { terrainGrid } from "./terraingrid.ts";
import { readZip } from "./zipread.ts";
import { decodePng } from "./pngdecode.ts";
import { sheetFileName, dataFileFor, TILESET_DIR, DEFAULT_ZIP } from "./tilesetfiles.ts";
import { sheetKeys, matchScore, newAcc, mineChapter, serialiseSheet, type SheetAcc } from "./tilesetmine.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const OUT = join(ROOT, TILESET_DIR);
const ROM_BASE = 0x08000000;
const MIN_MATCH = 0.5;

type SheetRef = { name: string; file: string };

async function importSheets(zipPath: string): Promise<SheetRef[]> {
  const entries = readZip(new Uint8Array(await readFile(zipPath)));
  const sheets: SheetRef[] = [];
  await mkdir(OUT, { recursive: true });
  for (const e of entries) {
    const ref = sheetFileName(e.name);
    if (!ref) {
      if (/^FE 8\//i.test(e.name) && /\.png$/i.test(e.name)) console.log(`  skipped unsafe name: ${e.name}`);
      continue;
    }
    if (sheets.some((s) => s.file === ref.file)) { console.log(`  skipped duplicate name: ${e.name}`); continue; }
    await writeFile(join(OUT, ref.file), e.read());
    sheets.push(ref);
  }
  if (sheets.length === 0) throw new Error(`No "FE 8/*.png" sheets found in ${zipPath}`);
  sheets.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(join(OUT, "sheets.json"), JSON.stringify(sheets, null, 2) + "\n", "utf8");
  console.log(`Imported ${sheets.length} sheets into ${TILESET_DIR}/`);
  return sheets;
}

function run(cli: string, args: string[]): void {
  const r = spawnSync(cli, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`CLI exited ${r.status}: ${(r.stderr || r.stdout || "").trim().slice(0, 200)}`);
}

async function buildIndex(sheets: SheetRef[]): Promise<void> {
  const cli = cliPath(ROOT), rom = romPath(ROOT, "fe8");
  const mapsJson = join(gameDir(ROOT, "fe8"), "maps.json");
  if (!existsSync(rom)) throw new Error(`FE8 ROM not found at ${rom}.`);
  if (!existsSync(cli)) throw new Error("FEBuilderGBA.CLI not found. See the README asset gallery section.");
  if (!existsSync(mapsJson)) throw new Error("Chapter maps not found. Run Generate Maps (tools/assetgen/mapgen.ts) first.");

  const romBuf = await readFile(rom);
  const asset = makeAssetResolver(romBuf);
  const loaded = await Promise.all(sheets.map(async (s) => ({ ...s, keys: sheetKeys(decodePng(await readFile(join(OUT, s.file)))) })));
  const accs = new Map<string, SheetAcc>();
  const tmp = join(ROOT, ".tileset-tmp");
  await mkdir(tmp, { recursive: true });
  const chapters: { index: number; name: string }[] = JSON.parse(await readFile(mapsJson, "utf8"));

  try {
    for (const ch of chapters) {
      try {
        const recOff = (CHAPTER_TABLE_ADDR - ROM_BASE) + ch.index * RECORD_SIZE;
        const ptrs = decodeChapterMap(romBuf.subarray(recOff, recOff + RECORD_SIZE), asset);
        const hex = (p: number) => `0x${p.toString(16)}`;
        const t = join(tmp, `ch${ch.index}`);
        run(cli, ["--export-asset", "--kind=map", `--rom=${rom}`, `--addr=${hex(ptrs.layoutPtr)}`, `--out=${t}.mar`]);
        run(cli, ["--export-asset", "--kind=mapchipconfig", `--rom=${rom}`, `--addr=${hex(ptrs.tileConfigPtr)}`, `--out=${t}.cfg`]);
        const dims = JSON.parse((await readFile(`${t}.mar.json`, "utf8")).replace(/^\uFEFF/, ""));
        const layout = parseLayout(await readFile(`${t}.mar`), dims.width, dims.height);
        const cfg = await readFile(`${t}.cfg`);
        const chips: number[][] = [];
        for (let y = 0; y < dims.height; y++) chips.push(Array.from({ length: dims.width }, (_, x) => layout[y * dims.width + x] >> 2));
        const terrain = terrainGrid(cfg, layout, dims.width, dims.height);
        const png = decodePng(await readFile(join(gameDir(ROOT, "fe8"), "maps", `${ch.index}.png`)));
        let best = { name: "", score: 0 };
        for (const s of loaded) {
          const score = matchScore(s.keys, png, chips);
          if (score > best.score) best = { name: s.name, score };
        }
        if (best.score < MIN_MATCH) { console.log(`  ${ch.index} ${ch.name}: no matching sheet (best ${(best.score * 100).toFixed(0)}%)`); continue; }
        let acc = accs.get(best.name);
        if (!acc) { acc = newAcc(); accs.set(best.name, acc); }
        mineChapter(acc, chips, terrain, ch.index);
        console.log(`  ${ch.index} ${ch.name}: ${best.name} (${(best.score * 100).toFixed(0)}%)`);
      } catch (e) {
        console.log(`  ${ch.index} ${ch.name} FAILED: ${(e as Error).message}`);
      }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  const terrainDefs = JSON.parse(await readFile(join(gameDir(ROOT, "fe8"), "terrain.json"), "utf8"));
  const index: { name: string; file: string; data: string; chapters: number[]; terrains: number[] }[] = [];
  for (const s of sheets) {
    const acc = accs.get(s.name);
    if (!acc) { console.log(`${s.name}: no chapters matched, not indexed`); continue; }
    const data = dataFileFor(s.file);
    const out = serialiseSheet(acc);
    await writeFile(join(OUT, data), JSON.stringify(out) + "\n", "utf8");
    const terrains = [...acc.terrains].sort((a, b) => a - b);
    index.push({ name: s.name, file: s.file, data, chapters: acc.chapters, terrains });
    const report = terrains.map((t) => `${t} ${terrainDefs[t]?.name ?? "?"} (${out.freq[String(t)].reduce((a, c) => a + c[1], 0)})`).join(", ");
    console.log(`${s.name}: ${acc.chapters.length} chapters; terrains ${report}`);
  }
  await writeFile(join(OUT, "index.json"), JSON.stringify({ sheets: index }, null, 2) + "\n", "utf8");
  console.log(`Indexed ${index.length} of ${sheets.length} sheets into ${TILESET_DIR}/index.json`);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const zip = arg ? resolve(arg) : join(ROOT, DEFAULT_ZIP);
  let sheets: SheetRef[];
  if (existsSync(zip)) sheets = await importSheets(zip);
  else if (arg) throw new Error(`Zip not found: ${zip}`);
  else if (existsSync(join(OUT, "sheets.json"))) sheets = JSON.parse(await readFile(join(OUT, "sheets.json"), "utf8"));
  else throw new Error(`No sheets yet. Pass the path to "${DEFAULT_ZIP}" or put it at the repo root.`);
  await buildIndex(sheets);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
