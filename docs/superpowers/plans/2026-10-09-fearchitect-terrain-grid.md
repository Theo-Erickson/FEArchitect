# FEArchitect Terrain Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the Slice B skirmish on a real FE8 chapter map with authentic ROM terrain (avoid, def, res, heal, move cost), rendering the chapter PNG as the board.

**Architecture:** A pure extractor reads FE8's terrain tables and each chapter's per-tile terrain id; the generator (mapgen) writes `terrain.json` and per-chapter grids under `assets/reference/fe8/`. The grid engine gains FE8 terrain defs, a chapter-grid map format, fly-aware terrain combat, and healing. Play Map draws the chapter PNG as the backdrop with the SVG movement overlay on top.

**Tech Stack:** TypeScript on Node 24 (no build, no deps), the FE8 ROM read directly, the Node built-in test runner.

**Prose and code conventions:** No em dashes or en dashes anywhere. Use commas or colons. Comment new code well. Do NOT add Co-Authored-By or any attribution trailer to commits (project owner preference).

**Confirmed facts (from the ROM probe, FE8U, mapped addresses; file offset = addr - 0x08000000):**
- 65 terrain ids (0 to 64). Every table is 65 bytes, u8 per terrain.
- Move cost, Normal weather: foot = CommonT1 `0x0880B849`, cav = HorseT2 `0x0880BAD3`, fly = Fly `0x0880BB96`. Impassable sentinel = 255 (maps to null).
- Avoid ground `0x0880C479`, fly `0x0880C53C`. Def ground `0x0880C4BA`, fly `0x0880C57D`. Res ground `0x0880C4FB`, fly `0x0880C5BE`. Heal amount `0x0880C744`, heals status `0x0880C785`. Name text ids `0x0880D374` (u16 each).
- Verified: id 12 Forest (foot 2, cav 3, fly 1, avo 20, def 1), id 11 Fort (foot 1, avo 20, def 3, heal 10, healsStatus 1), id 13 Mountain and id 16 Sea (foot/cav 255, fly 1).
- Per-tile terrain id: from the config blob mapgen already reads. The terrain lookup is a u8 array at byte 8192 of the config (after the 0x1000 u16 TSA). For a cell, `terrainId = config[8192 + ((marU16 >> 3) >> 2)]`. Note `marU16 >> 3` is exactly what `parseLayout` already returns.

**Existing shapes to build on:**
- `src/grid/types.ts`: `MovementType = "foot"|"cav"|"fly"`, `TerrainDef { name; avoid; def; moveCost: Record<MovementType, number|null> }` (to extend), `GridEncounter { map; terrainDefs; ... }`.
- `src/types.ts`: `TerrainMod { avoid; def }` (to extend with `res`).
- `src/combat.ts`: `computeMatchup(attacker, defender, defenderTerrain = { avoid: 0, def: 0 })` uses `defenderTerrain.def` (added to def/res stat) and `.avoid`; `magic = isMagic(attacker.weapon.type)`.
- `src/grid/resolve.ts`: `resolveMap(raw, terrainDefs)` builds `terrain: string[][]` from `raw.legend` + `raw.tiles`.
- `src/grid/datagen.ts`: `loadGridEncounter(encounterPath, paths)` reads units/weapons/terrain/classes/map JSON and calls `resolveGridEncounter(...)`. `paths.terrainPath` and `paths.mapsDir` are overridable.
- `tools/assetgen/mapgen.ts`: already reads the ROM, exports per-chapter assets, parses the config (`parseTsa`), and writes `maps/<index>.png` + `maps.json`.
- `tools/assetgen/paths.ts`: `cliPath`, `romPath`, `gameDir`, `presentGames`.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `tools/assetgen/terraindata.ts` | Pure: read FE8 terrain tables from a ROM buffer into 65 defs. |
| `tools/assetgen/terraindata.test.ts` | Tests for the extractor. |
| `tools/assetgen/terraingrid.ts` | Pure: per-tile terrain id grid from config + layout. |
| `tools/assetgen/terraingrid.test.ts` | Tests for the grid builder. |
| `tools/assetgen/mapgen.ts` | MODIFY: write `terrain.json` + per-chapter `terrain/<index>.json`. |
| `src/grid/types.ts` | MODIFY: extend `TerrainDef` (res, fly variants, heal, healsStatus). |
| `src/types.ts` | MODIFY: extend `TerrainMod` with `res`. |
| `src/grid/resolve.ts` | MODIFY: accept the chapter grid map format. |
| `src/grid/datagen.ts` | MODIFY: load FE8 terrain + chapter grid when the encounter is a chapter. |
| `src/grid/terrainmod.ts` | Create: build a `TerrainMod` for a unit on a tile (fly-aware). |
| `src/grid/terrainmod.test.ts` | Tests for fly-aware terrain selection. |
| `src/combat.ts` | MODIFY: apply `res` from terrain on the magic path. |
| `src/grid/game.ts` | MODIFY: healing on a healing tile at end of a unit's turn. |
| `src/grid/render.ts` | MODIFY: a PNG-backdrop mode (no terrain sprites). |
| `src/game/*` | MODIFY: load chapter PNG + grid, fit-to-view. |
| `encounters/fe8-ch1-duel.json` | Create: example encounter on a real chapter. |

---

## Task 1: Terrain table extraction (pure)

**Files:**
- Create: `tools/assetgen/terraindata.ts`
- Test: `tools/assetgen/terraindata.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/assetgen/terraindata.test.ts`. Build a synthetic ROM with known bytes at
the (file-offset) table addresses, then assert the parsed defs:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTerrain, TERRAIN_COUNT } from "./terraindata.ts";

const OFF = (addr: number) => addr - 0x08000000;
const put = (rom: Uint8Array, addr: number, bytes: number[]) => rom.set(bytes, OFF(addr));

test("extractTerrain reads the FE8 terrain tables, 255 move cost becomes null", () => {
  const rom = new Uint8Array(0x900000); // large enough to cover the table offsets
  // terrain id 1 = passable everywhere cost 1; id 2 = forest-like; id 3 = impassable to foot.
  put(rom, 0x0880B849, [9, 1, 2, 255]);   // foot (CommonT1): ids 0..3
  put(rom, 0x0880BAD3, [9, 1, 3, 255]);   // cav (HorseT2)
  put(rom, 0x0880BB96, [9, 1, 1, 1]);     // fly
  put(rom, 0x0880C479, [0, 0, 20, 30]);   // avoid ground
  put(rom, 0x0880C53C, [0, 0, 0, 0]);     // avoid fly
  put(rom, 0x0880C4BA, [0, 0, 1, 2]);     // def ground
  put(rom, 0x0880C57D, [0, 0, 0, 0]);     // def fly
  put(rom, 0x0880C4FB, [0, 0, 0, 0]);     // res ground
  put(rom, 0x0880C5BE, [0, 0, 0, 0]);     // res fly
  put(rom, 0x0880C744, [0, 0, 0, 0]);     // heal
  put(rom, 0x0880C785, [0, 0, 0, 0]);     // heals status
  // name text ids (u16 LE): id 2 -> 0x1234
  new DataView(rom.buffer).setUint16(OFF(0x0880D374) + 2 * 2, 0x1234, true);

  const defs = extractTerrain(rom);
  assert.equal(defs.length, TERRAIN_COUNT);
  assert.deepEqual(defs[2], {
    id: 2, nameTextId: 0x1234,
    avoid: 20, def: 1, res: 0, flyAvoid: 0, flyDef: 0, flyRes: 0,
    heal: 0, healsStatus: false,
    moveCost: { foot: 2, cav: 3, fly: 1 },
  });
  assert.equal(defs[3].moveCost.foot, null); // 255 -> null
  assert.equal(defs[3].moveCost.fly, 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/assetgen/terraindata.test.ts`
Expected: FAIL, `./terraindata.ts` not found.

- [ ] **Step 3: Implement `tools/assetgen/terraindata.ts`**

```ts
// Read FE8's terrain tables out of a ROM buffer. 65 terrain ids, every table 65 bytes
// (u8), at the documented FE8U addresses. Move cost 255 means impassable (null). The
// move-cost tables chosen map FE8's movement types down to the sim's three:
// foot = CommonT1, cav = HorseT2, fly = Fly (Normal weather). See the plan header and
// docs/superpowers/specs/2026-10-09-fearchitect-terrain-grid-design.md.
const ROM_BASE = 0x08000000;
export const TERRAIN_COUNT = 65;
const IMPASSABLE = 255;

const A = {
  footCost: 0x0880b849, cavCost: 0x0880bad3, flyCost: 0x0880bb96,
  avo: 0x0880c479, avoFly: 0x0880c53c, def: 0x0880c4ba, defFly: 0x0880c57d,
  res: 0x0880c4fb, resFly: 0x0880c5be, heal: 0x0880c744, healS: 0x0880c785,
  nameId: 0x0880d374,
};

export type TerrainRaw = {
  id: number; nameTextId: number;
  avoid: number; def: number; res: number;
  flyAvoid: number; flyDef: number; flyRes: number;
  heal: number; healsStatus: boolean;
  moveCost: { foot: number | null; cav: number | null; fly: number | null };
};

export function extractTerrain(rom: Uint8Array): TerrainRaw[] {
  const dv = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
  const u8 = (addr: number, i: number) => rom[addr - ROM_BASE + i];
  const cost = (addr: number, i: number) => { const v = u8(addr, i); return v === IMPASSABLE ? null : v; };
  const out: TerrainRaw[] = [];
  for (let i = 0; i < TERRAIN_COUNT; i++) {
    out.push({
      id: i,
      nameTextId: dv.getUint16(A.nameId - ROM_BASE + i * 2, true),
      avoid: u8(A.avo, i), def: u8(A.def, i), res: u8(A.res, i),
      flyAvoid: u8(A.avoFly, i), flyDef: u8(A.defFly, i), flyRes: u8(A.resFly, i),
      heal: u8(A.heal, i), healsStatus: u8(A.healS, i) !== 0,
      moveCost: { foot: cost(A.footCost, i), cav: cost(A.cavCost, i), fly: cost(A.flyCost, i) },
    });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/assetgen/terraindata.test.ts`
Expected: PASS.

- [ ] **Step 5: Spot-check against the real ROM**

Run:
```bash
node -e "const fs=require('fs');const {extractTerrain}=require('./tools/assetgen/terraindata.ts');" 2>/dev/null || true
node --input-type=module -e "import {extractTerrain} from './tools/assetgen/terraindata.ts'; import {readFileSync} from 'node:fs'; const d=extractTerrain(readFileSync('base/FE8_Clean.gba')); console.log('12', JSON.stringify(d[12])); console.log('11', JSON.stringify(d[11])); console.log('16', JSON.stringify(d[16]));"
```
Expected: id 12 forest (avoid 20, def 1, moveCost foot 2 / cav 3 / fly 1), id 11 fort (heal 10, healsStatus true), id 16 sea (foot null, cav null, fly 1).

- [ ] **Step 6: Commit**

```bash
git add tools/assetgen/terraindata.ts tools/assetgen/terraindata.test.ts
git commit -m "feat: extract FE8 terrain tables (avoid, def, res, heal, move cost)"
```

---

## Task 2: Per-chapter terrain grid (pure)

**Files:**
- Create: `tools/assetgen/terraingrid.ts`
- Test: `tools/assetgen/terraingrid.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { terrainGrid } from "./terraingrid.ts";

test("terrainGrid maps each cell's layout offset to a terrain id via the lookup", () => {
  // config: TSA region is 8192 bytes, then the terrain lookup (u8) starts at 8192.
  const config = new Uint8Array(9216);
  config[8192 + 0] = 12; // lookup index 0 -> terrain 12
  config[8192 + 5] = 16; // lookup index 5 -> terrain 16
  // layout offsets (already value>>3): offset 0 -> index 0>>2 = 0; offset 20 -> 20>>2 = 5.
  const layout = Uint16Array.from([0, 20]);
  const grid = terrainGrid(config, layout, 2, 1);
  assert.deepEqual(grid, [[12, 16]]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/assetgen/terraingrid.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `tools/assetgen/terraingrid.ts`**

```ts
// Per-tile terrain id for a chapter. The tileset config's terrain lookup is a u8
// array starting at byte 8192 (after the 0x1000 u16 TSA). For a cell, the terrain id
// is lookup[offset >> 2], where offset is the layout value already shifted right 3
// (what parseLayout returns). See docs/superpowers/notes/fe8-map-format.md and bmmap.c.
const TERRAIN_LOOKUP_OFFSET = 8192;

export function terrainGrid(config: Uint8Array, layout: Uint16Array, width: number, height: number): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const offset = layout[y * width + x];
      row.push(config[TERRAIN_LOOKUP_OFFSET + (offset >> 2)] ?? 0);
    }
    grid.push(row);
  }
  return grid;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/assetgen/terraingrid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/assetgen/terraingrid.ts tools/assetgen/terraingrid.test.ts
git commit -m "feat: per-chapter terrain id grid from the tileset config"
```

---

## Task 3: Generator wiring (terrain.json + per-chapter grids)

**Files:**
- Modify: `tools/assetgen/mapgen.ts`

- [ ] **Step 1: Import the new modules and a name resolver**

At the top of `mapgen.ts` add these imports (readFile/writeFile/mkdir are already
imported from `node:fs/promises`; do not re-import them):

```ts
import { extractTerrain, type TerrainRaw } from "./terraindata.ts";
import { terrainGrid } from "./terraingrid.ts";
```

Add a tiny name helper near the top of the file (names are cosmetic; the authentic
stats are what matter). Keep it simple and labelled, with a generic fallback:

```ts
// A short label per terrain id for the UI. The authentic stats come from the ROM;
// these names are a convenience and fall back to "Terrain N" for anything unlisted.
const TERRAIN_NAMES: Record<number, string> = {
  0: "--", 1: "Plains", 2: "Plains", 3: "Road", 4: "Wall", 5: "Floor",
  10: "Thicket", 11: "Fort", 12: "Forest", 13: "Mountain", 14: "Village",
  15: "Hill", 16: "Sea", 17: "River", 18: "Desert", 19: "Bridge",
};
const terrainName = (t: TerrainRaw) => TERRAIN_NAMES[t.id] ?? `Terrain ${t.id}`;
```

- [ ] **Step 2: Write `terrain.json` once per run, and a per-chapter grid**

In `genGame`, after `const asset = makeAssetResolver(romBuf);` add the terrain defs
extraction and write the keyed defs file:

```ts
  const terrainDir = join(gameDir(ROOT, game), "terrain");
  await mkdir(terrainDir, { recursive: true });
  const terrainRaw = extractTerrain(romBuf);
  const terrainDefs: Record<string, any> = {};
  for (const t of terrainRaw) {
    terrainDefs[String(t.id)] = {
      name: terrainName(t),
      avoid: t.avoid, def: t.def, res: t.res,
      flyAvoid: t.flyAvoid, flyDef: t.flyDef, flyRes: t.flyRes,
      heal: t.heal, healsStatus: t.healsStatus,
      moveCost: t.moveCost,
    };
  }
  await writeFile(join(gameDir(ROOT, game), "terrain.json"), JSON.stringify(terrainDefs, null, 2) + "\n", "utf8");
```

Then, inside the per-chapter `try` block in `genGame`, right after `const layout =
parseLayout(...)` and `const tsaCfg = await readFile(...)` are available (the config
buffer is read as `${t}.cfg`), compute and write the grid. Load the config buffer
into a variable you can reuse for both TSA and terrain:

```ts
      const cfgBuf = await readFile(`${t}.cfg`);
      const tsa = parseTsa(cfgBuf);
      const layout = parseLayout(await readFile(`${t}.mar`), width, height);
      // ... existing compose/encode ...
      const grid = terrainGrid(cfgBuf, layout, width, height);
      await writeFile(join(terrainDir, `${ch.index}.json`),
        JSON.stringify({ id: `fe8-${ch.index}`, width, height, terrainIds: grid }) + "\n", "utf8");
```

(Replace the existing `parseTsa(await readFile(\`${t}.cfg\`))` call with the `cfgBuf`
version so the config is read once.)

- [ ] **Step 3: Run the generator and verify outputs**

Run: `node --no-warnings tools/assetgen/mapgen.ts`
Expected: `assets/reference/fe8/terrain.json` exists with 65 keyed entries, and
`assets/reference/fe8/terrain/1.json` has a 15x10 `terrainIds` grid. Spot-check:

```bash
node -e "const t=require('./assets/reference/fe8/terrain.json'); console.log('12',JSON.stringify(t['12'])); const g=require('./assets/reference/fe8/terrain/1.json'); console.log('ch1', g.width+'x'+g.height, 'row0', g.terrainIds[0].join(','));"
```
Expected: terrain 12 is the forest def; the ch1 grid is 15x10 with plausible ids.

- [ ] **Step 4: Commit**

```bash
git add tools/assetgen/mapgen.ts
git commit -m "feat: generate FE8 terrain defs and per-chapter terrain grids"
```

---

## Task 4: Sim types and loader

**Files:**
- Modify: `src/grid/types.ts`, `src/types.ts`, `src/grid/resolve.ts`, `src/grid/datagen.ts`

- [ ] **Step 1: Extend `TerrainDef` and `TerrainMod`**

In `src/grid/types.ts`, extend `TerrainDef` (keep existing fields, add the new ones as
optional so the hand-authored `data/terrain.json` still validates):

```ts
export interface TerrainDef {
  name: string;
  avoid: number;
  def: number;
  moveCost: Record<MovementType, number | null>;
  res?: number;
  flyAvoid?: number;
  flyDef?: number;
  flyRes?: number;
  heal?: number;
  healsStatus?: boolean;
}
```

In `src/types.ts`, extend `TerrainMod`:

```ts
export interface TerrainMod {
  avoid: number;
  def: number;
  res?: number;
}
```

- [ ] **Step 2: Accept the chapter grid format in `resolveMap`**

In `src/grid/resolve.ts`, update `resolveMap` to branch on the grid format while
keeping the ASCII format. Replace the function with:

```ts
export function resolveMap(raw: any, terrainDefs: Record<string, TerrainDef>): ResolvedMap {
  // Chapter grid format: { id, width, height, terrainIds: number[][] }.
  if (Array.isArray(raw?.terrainIds)) {
    const height = raw.terrainIds.length;
    const width = raw.width ?? (raw.terrainIds[0]?.length ?? 0);
    const terrain: string[][] = raw.terrainIds.map((row: number[], y: number) => {
      if (row.length !== width) throw new Error(`Map ${raw.id} row ${y} has wrong width`);
      return row.map((n) => {
        const id = String(n);
        if (!terrainDefs[id]) throw new Error(`Map ${raw.id} references unknown terrain '${id}'`);
        return id;
      });
    });
    return { id: raw.id, width, height, terrain };
  }
  // ASCII legend format (showcase maps).
  if (!Array.isArray(raw?.tiles) || raw.tiles.length === 0) throw new Error(`Map ${raw?.id} has no tiles`);
  const legend: Record<string, string> = raw.legend ?? {};
  const width = raw.tiles[0].length;
  const terrain: string[][] = raw.tiles.map((row: string, y: number) => {
    if (row.length !== width) throw new Error(`Map ${raw.id} row ${y} has wrong width`);
    return [...row].map((ch) => {
      const id = legend[ch];
      if (!id) throw new Error(`Map ${raw.id} legend has no entry for '${ch}'`);
      if (!terrainDefs[id]) throw new Error(`Map ${raw.id} references unknown terrain '${id}'`);
      return id;
    });
  });
  return { id: raw.id, width, height: raw.tiles.length, terrain };
}
```

Also relax the terrain validation that requires numeric `avoid`/`def` only if you
find it rejects the FE8 defs: FE8 defs include `avoid` and `def` as numbers already,
so no change is needed, but confirm `resolveTerrain` does not reject the extra fields
(it should ignore unknown keys).

- [ ] **Step 2b: Write the failing test for the grid format**

Add to `src/grid/resolve.test.ts` (or create if absent) a test:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMap } from "./resolve.ts";

const defs: any = {
  "1": { name: "Plains", avoid: 0, def: 0, moveCost: { foot: 1, cav: 1, fly: 1 } },
  "12": { name: "Forest", avoid: 20, def: 1, moveCost: { foot: 2, cav: 3, fly: 1 } },
};

test("resolveMap reads the chapter grid (terrainIds) format", () => {
  const m = resolveMap({ id: "fe8-1", width: 2, height: 1, terrainIds: [[1, 12]] }, defs);
  assert.deepEqual(m.terrain, [["1", "12"]]);
  assert.equal(m.width, 2);
});
```

Run: `node --test src/grid/resolve.test.ts` and confirm it passes after Step 2.

- [ ] **Step 3: Load FE8 terrain + chapter grid in `datagen.ts`**

In `src/grid/datagen.ts`, let an encounter opt into the FE8 terrain set and chapter
grids. Simplest: when `rawEnc.terrain === "fe8"`, read the FE8 defs and read the map
from the FE8 terrain dir. Update `loadGridEncounter`:

```ts
export async function loadGridEncounter(encounterPath: string, paths: GridLoadPaths = {}): Promise<GridEncounter> {
  const rawEnc = await readJson(encounterPath);
  const rawUnits = await readJson(paths.unitsPath ?? "data/units.json");
  const rawWeapons = await readJson(paths.weaponsPath ?? "data/weapons.json");
  const rawClasses = await readJson(paths.classesPath ?? "data/classes.json");
  const useFe8 = rawEnc.terrain === "fe8";
  const rawTerrain = await readJson(
    paths.terrainPath ?? (useFe8 ? "assets/reference/fe8/terrain.json" : "data/terrain.json"));
  const mapPath = useFe8
    ? `assets/reference/fe8/terrain/${rawEnc.map.replace(/^fe8-/, "")}.json`
    : `${paths.mapsDir ?? "maps"}/${rawEnc.map}.json`;
  const rawMap = await readJson(mapPath);
  return resolveGridEncounter(rawEnc, rawUnits, rawWeapons, rawTerrain, rawClasses, rawMap);
}
```

- [ ] **Step 4: Run the suite**

Run: `node --test src/grid/`
Expected: PASS (existing grid tests plus the new resolve test).

- [ ] **Step 5: Commit**

```bash
git add src/grid/types.ts src/types.ts src/grid/resolve.ts src/grid/resolve.test.ts src/grid/datagen.ts
git commit -m "feat: FE8 terrain defs and chapter grid map format in the grid loader"
```

---

## Task 5: Authentic terrain in combat and healing

**Files:**
- Create: `src/grid/terrainmod.ts`, `src/grid/terrainmod.test.ts`
- Modify: `src/combat.ts`, `src/grid/game.ts`

- [ ] **Step 1: Write the failing test for fly-aware terrain selection**

Create `src/grid/terrainmod.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { terrainModFor } from "./terrainmod.ts";

const forest: any = { name: "Forest", avoid: 20, def: 1, res: 0, flyAvoid: 0, flyDef: 0, flyRes: 0, moveCost: { foot: 2, cav: 3, fly: 1 } };

test("terrainModFor gives ground bonuses to foot, zeroed fly bonuses to fliers", () => {
  assert.deepEqual(terrainModFor(forest, "foot"), { avoid: 20, def: 1, res: 0 });
  assert.deepEqual(terrainModFor(forest, "fly"), { avoid: 0, def: 0, res: 0 });
});

test("terrainModFor tolerates a def without fly fields (showcase terrain)", () => {
  const plains: any = { name: "Plains", avoid: 0, def: 0, moveCost: { foot: 1, cav: 1, fly: 1 } };
  assert.deepEqual(terrainModFor(plains, "fly"), { avoid: 0, def: 0, res: 0 });
});
```

- [ ] **Step 2: Implement `src/grid/terrainmod.ts`**

```ts
// Build the TerrainMod a unit experiences on a tile. Flying units use FE8's fly
// terrain bonuses (usually zero); everyone else uses the ground bonuses. Missing fly
// fields (the hand-authored showcase terrain) fall back to 0.
import type { TerrainDef, MovementType } from "./types.ts";
import type { TerrainMod } from "../types.ts";

export function terrainModFor(def: TerrainDef, movementType: MovementType): TerrainMod {
  if (movementType === "fly") {
    return { avoid: def.flyAvoid ?? 0, def: def.flyDef ?? 0, res: def.flyRes ?? 0 };
  }
  return { avoid: def.avoid, def: def.def, res: def.res ?? 0 };
}
```

- [ ] **Step 3: Apply `res` from terrain on the magic path in `src/combat.ts`**

In `computeMatchup`, change the damage line so terrain res applies against magic and
terrain def against physical:

```ts
  // ComputeBattleUnitDefense: res for magic, def otherwise, plus the terrain bonus.
  const defenseStat = magic ? defender.unit.res : defender.unit.def;
  const terrainDefBonus = magic ? (defenderTerrain.res ?? 0) : defenderTerrain.def;
  const damage = Math.max(0, attack - (defenseStat + terrainDefBonus));
```

Leave the default `defenderTerrain = { avoid: 0, def: 0 }` as is (res defaults to 0).

- [ ] **Step 4: Wire `terrainModFor` where the grid builds combat terrain**

Find where the grid resolves a defender's terrain into a `TerrainMod` for
`computeMatchup`/`resolveExchange` (search `defenderTerrain` and `terrain` usage in
`src/grid/resolve.ts`, `src/grid/game.ts`, `src/grid/ai.ts`). Replace the place that
constructs `{ avoid, def }` from a tile's `TerrainDef` with `terrainModFor(def,
unit.cls.movementType)` so fliers get the fly values and res is carried. Add or update
a test in `src/grid/game.test.ts` asserting a flier on a forest tile gets no avoid
bonus while a foot unit does.

- [ ] **Step 5: Healing on a healing tile**

In `src/grid/game.ts`, at the end of a unit's turn (after a move or wait resolves),
if the unit's current tile's `TerrainDef.heal` is greater than 0, restore that many HP
capped at the unit's max HP. Add a test in `src/grid/game.test.ts`: a unit ending on a
fort (`heal` 10) at reduced HP gains 10, not exceeding max.

- [ ] **Step 6: Run the suite and commit**

Run: `node --test`
Expected: PASS.

```bash
git add src/grid/terrainmod.ts src/grid/terrainmod.test.ts src/combat.ts src/grid/game.ts src/grid/game.test.ts
git commit -m "feat: authentic terrain in combat (fly bonuses, res vs magic) and tile healing"
```

---

## Task 6: Play Map renders a real chapter

**Files:**
- Modify: `src/grid/render.ts`, `src/game/*` (client + `src/server.ts` if needed)
- Create: `encounters/fe8-ch1-duel.json`

- [ ] **Step 1: Create the example encounter**

Create `encounters/fe8-ch1-duel.json`:

```json
{
  "id": "fe8-ch1-duel",
  "terrain": "fe8",
  "map": "fe8-1",
  "notes": "1v1 on the real Chapter 1 map: terrain affects range, avoid, and defense.",
  "player": { "unit": "eirika-t", "weapon": "iron-sword", "at": [4, 7] },
  "enemy":  { "unit": "wyvern-1", "weapon": "iron-lance", "at": [10, 3], "ai": "aggressive" },
  "win": "rout"
}
```

(Adjust `at` positions to passable tiles on the ch1 grid; pick from the generated
`assets/reference/fe8/terrain/1.json` so neither unit starts on an impassable tile.)

- [ ] **Step 2: Verify the encounter loads and terrain matters (headless)**

Run:
```bash
node --input-type=module -e "import {loadGridEncounter} from './src/grid/datagen.ts'; const e=await loadGridEncounter('encounters/fe8-ch1-duel.json'); console.log('map',e.map.width+'x'+e.map.height,'defs',Object.keys(e.terrainDefs).length);"
```
Expected: the chapter map size (for example 15x10) and 65 terrain defs. If it throws
on a bad start tile, move the unit to a passable tile and retry.

- [ ] **Step 3: Add a PNG-backdrop render mode to `src/grid/render.ts`**

Add an option so the board can be drawn without terrain sprites (the PNG shows
terrain). For example a `backdrop` flag on the existing render entry point that, when
set, skips emitting the per-tile terrain sprite layer but still emits the movement and
attack highlight overlays and the unit tokens, all sized to a 16px tile. Keep the
existing sprite path as the default for showcase maps. Add a render test asserting the
backdrop mode omits terrain sprites but keeps highlights and tokens.

- [ ] **Step 4: Client: chapter PNG backdrop + fit-to-view**

In `src/game` (the client `src/server.ts` serves), when the loaded encounter uses the
FE8 terrain (`terrain === "fe8"` or the map id starts with `fe8-`):
- Set the board background to `/assets/reference/fe8/maps/<index>.png` (index from the
  map id), rendered at 16px per tile (`width*16` by `height*16`), `image-rendering:
  pixelated`.
- Use the backdrop render mode so the SVG overlay (highlights, cursor, unit tokens,
  HP) draws on top, tile-aligned.
- Scale the whole board to fit the viewport width (CSS transform or an SVG viewBox),
  with scrolling for very large maps.
Confirm the server already serves `/assets/reference/...` (the gallery server does; if
this server does not, add a static route for `assets/reference/`).

- [ ] **Step 5: Verify in the browser**

Run: `node --no-warnings src/server.ts /src/game/index.html` (or double-click Play
Map.cmd), then load the `fe8-ch1-duel` encounter. Confirm:
- The real Chapter 1 map shows as the board background, tiles aligned.
- The player's movement range stops at impassable terrain (sea, mountain) and costs
  more through forest; a flier crosses freely.
- Attacking a unit standing in forest shows reduced hit (terrain avoid) in the
  forecast, and reduced damage on a forest/fort tile (terrain def).
Stop the server.

- [ ] **Step 6: Run the full suite and commit**

Run: `node --test`
Expected: PASS, the full suite including the new terrain extraction, grid, resolve,
terrainmod, combat, and healing tests.

```bash
git add src/grid/render.ts src/grid/render.test.ts src/game encounters/fe8-ch1-duel.json
git commit -m "feat: Play Map renders a real FE8 chapter with terrain-aware skirmish"
```

---

## Self-review notes (for the implementer)

- The two ROM unknowns are resolved: impassable sentinel is 255 (to null), and names
  use a small label table with a "Terrain N" fallback (cosmetic). Stats are authentic.
- `TerrainDef`'s new fields are optional so the hand-authored `data/terrain.json` and
  the showcase maps keep working unchanged; only FE8 chapters carry the fly/res/heal
  fields.
- `terrainModFor` is the single place that resolves a unit's terrain bonus, so fly
  handling and res are consistent across movement preview, combat forecast, AI, and
  resolution. Make sure every caller that used a raw `{ avoid, def }` from a tile goes
  through it (Task 5 Step 4).
- Rendering reuses the chapter PNG (already generated and gitignored); do not redraw
  terrain in SVG for chapters.
- FE7 and weather tables are out of scope; `extractTerrain` reads FE8 Normal-weather
  tables only.
