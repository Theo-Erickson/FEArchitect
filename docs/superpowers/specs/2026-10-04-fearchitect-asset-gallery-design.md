# FEArchitect FE8 Asset Reference Gallery

Date: 2026-10-04
Status: Approved for planning
Author: Claude (Opus 4.8) with Theo (Technical Game Designer)

## Prose and code conventions

No em dashes or en dashes anywhere in this document or in code and comments.
Use colons or commas instead. Do not add Co-Authored-By or any attribution
trailer to commits (project owner preference).

## 1. Purpose

Let the owner browse GBA Fire Emblem canon, units, classes, items, portraits, and
battle animations, imported from clean ROMs through `FEBuilderGBA.CLI`. The gallery
covers all three GBA titles the tool supports: FE6, FE7, and FE8, chosen with a
game selector. The gallery is a read-only reference. It stays separate from the
sim's curated hand-authored data so the clean `data/*.json` and encounters are
never flooded with hundreds of canon entries.

Two things are explicitly out of scope and become their own later tracks: mapping
a specific canon unit or class into the sim model (the follow-up after the
gallery), and porting assets across games into a single unified ROM build (the
Tier 3 asset-porting track, see section 11).

## 2. Context already established

The toolchain is in place and every step was verified against the real ROM during
brainstorming:

- Clean ROM at `base/FE8_Clean.gba`, SHA1 `c25b145e37456171ada4b0d440bf88a19f4d509f`
  (the decomp's canonical FE8U build target). Gitignored.
- `FEBuilderGBA.CLI` (laqieer fork, `ver_20260905.23`) extracted to
  `tools/febuilder-cli/FEBuilderGBA.CLI.exe`. Gitignored under `tools/`.
- Verified commands:
  - `--export-data --table=units|classes|items --format=json --out=<path>`
    produces per-table JSON (units 255 entries, classes 128, items). Fields are
    hex strings, for example `"BaseHP": "0x00"`, and the unit `Index` field is
    `"0x00 Eirika"` (id plus name).
  - `--export-portrait-all --out=<dir>` writes portrait PNGs (96x80).
  - `--export-battle-anime --animation-id=<id> --gif --out=<file.gif>` writes an
    animated GIF for a section (default section 0 = attack body). This removes the
    handoff's highest-risk step: viewing animations needs no AAA, no ROM build,
    and no frame-format parsing.

FE6 and FE7 use the same commands; the CLI supports `--force-version FE6`,
`FE7J`, `FE7U`, `FE8J`, `FE8U`, and auto-detects version from the ROM header. FE6
and FE7 export is expected to work the same way but was not yet verified here,
since only the FE8 ROM is present. It is verified during implementation once their
clean ROMs are placed, and the gallery simply omits any game whose ROM is absent.

## 3. Success criteria

1. Double-clicking `Import Assets.cmd` imports every game whose clean ROM is
   present (`base/FE8_Clean.gba`, and `base/FE6_clean.gba` / `base/FE7_clean.gba`
   if placed), writing per-game `assets/reference/<game>/{units,classes,items}.json`
   plus `assets/reference/<game>/portraits/*.png`. It skips an absent game and
   fails with a clear message only if the CLI is missing or no ROM is found.
2. The normalized JSON has integer fields (hex strings parsed) and, for units,
   separate `id` and `name` fields split from the raw `Index`.
3. Double-clicking `Gallery.cmd` opens a local web gallery with a game selector
   (only games with imported data are offered) and four tabs: Units, Classes,
   Items, Animations.
4. Units tab shows each unit's portrait, name, class, base stats, growths, and
   weapon ranks, and is text-searchable.
5. Classes and Items tabs show their records in readable tables.
6. The Animations tab lets the owner pick an animation id and section and plays
   the GIF for the selected game. The GIF is produced on demand by the gallery
   server, cached under `assets/reference/<game>/anims/`, and served instantly on
   repeat views.
7. `assets/reference/` is gitignored (it derives from the copyrighted ROMs).
8. The sim, editor, and MCP server are unchanged and still pass their tests. The
   gallery and import runner add no npm dependency.

## 4. Architecture

Two cooperating pieces over a one-way flow from the ROM:

```
base/<game>_clean.gba  +  tools/febuilder-cli/FEBuilderGBA.CLI.exe
        |                              |
        v  (tools/assetgen/import.ts runs the CLI per present game)
  assets/reference/<game>/{units,classes,items}.json  (normalized)
  assets/reference/<game>/portraits/*.png             (bulk, once)
        |
        v  (gallery/ server serves these; lazily generates anim GIFs)
  gallery web app  <-- /anim?game=G&id=N&section=S  runs CLI, caches to <game>/anims/
```

`<game>` is one of `fe6`, `fe7`, `fe8`. The import runner discovers which games
have a ROM and imports each; the gallery offers only the games it finds imported.

- The **import runner** (`tools/assetgen/`) is the only writer of
  `assets/reference/`. It shells out to the CLI for data and portraits, and
  normalizes the raw JSON.
- The **gallery** (`gallery/`) is a small Node standard-library server plus a page.
  It serves the normalized JSON and portraits statically, and exposes one dynamic
  endpoint, `/anim`, that lazily runs `--export-battle-anime --gif` and caches the
  result. It is a separate app from the sim's server so the sim stays independent
  of the external toolchain.
- No npm dependencies: Node standard library only, same as the sim server. Node 24
  runs the TypeScript directly.

The CLI path (`tools/febuilder-cli/FEBuilderGBA.CLI.exe`) and the per-game ROM
paths are resolved from the project root, with environment overrides
(`FEA_FEBUILDER_CLI`, and `FEA_FE6_ROM` / `FEA_FE7_ROM` / `FEA_FE8_ROM`) for
different locations. The expected ROM filenames are `base/FE6_clean.gba`,
`base/FE7_clean.gba`, and `base/FE8_Clean.gba`; version is confirmed from the ROM
header, with `--force-version` passed when a game needs it.

## 5. Repository layout additions

| Path | Responsibility |
|------|----------------|
| `tools/assetgen/paths.ts` | Resolve the CLI path, the per-game ROM paths (fe6/fe7/fe8), and the per-game reference dir from the project root plus env overrides; report which games have a ROM. Pure given its inputs. |
| `tools/assetgen/normalize.ts` | Pure normalization: parse hex strings to integers, split `Index` into id and name, shape each table into the gallery's reference records. |
| `tools/assetgen/normalize.test.ts` | Tests for normalization with sample raw rows. |
| `tools/assetgen/import.ts` | The runner: invoke the CLI for data and portraits, normalize, write `assets/reference/`. Fails loudly on a missing CLI or ROM. |
| `gallery/galleryutil.ts` | Pure helpers: static path safety, the `/anim` cache key, and the CLI argument list for an anim export. |
| `gallery/galleryutil.test.ts` | Tests for the pure helpers. |
| `gallery/server.ts` | Node stdlib server: serve the page and `assets/reference/`, plus the lazy `/anim` endpoint. |
| `gallery/index.html` | The gallery page: four tabs. |
| `gallery/client.ts` | Browser side: fetch reference JSON, render tabs, request anim GIFs. |
| `Import Assets.cmd` | Double-click: run the import. |
| `Gallery.cmd` | Double-click: start the gallery server and open the browser. |
| `.gitignore` | MODIFY: add `assets/reference/`. |
| `README.md` | MODIFY: an asset gallery section. |

## 6. Data: raw export to reference records

The CLI emits hex-string fields. The normalizer converts them and keeps the fields
the gallery shows. Illustrative; exact field set confirmed against the real export
during implementation.

Raw unit row (from the CLI):

```jsonc
{ "Index": "0x00 Eirika", "ClassID": "0x02", "PortraitID": "0x0002",
  "Affinity": "0x06", "Level": "0x01", "BaseHP": "0x00", "BasePow": "0x00",
  "BaseSkl": "0x00", "BaseSpd": "0x00", "BaseDef": "0x00", "BaseRes": "0x00",
  "BaseLck": "0x05", "BaseCon": "0x00", "SwordRank": "0x01",
  "GrowthHP": "0x46" /* ...more... */ }
```

Normalized unit record (what the gallery reads):

```jsonc
{ "id": 0, "name": "Eirika", "classId": 2, "portraitId": 2, "affinity": 6,
  "level": 1,
  "bases": { "hp": 0, "pow": 0, "skl": 0, "spd": 0, "def": 0, "res": 0, "lck": 5, "con": 0 },
  "growths": { "hp": 70, "pow": 40, "skl": 60, "spd": 60, "def": 30, "res": 30, "lck": 60 },
  "ranks": { "sword": 1, "lance": 0, "axe": 0, "bow": 0, "staff": 0, "anima": 0, "light": 0, "dark": 0 } }
```

Classes and items normalize the same way: parse hex to int, split `Index` into id
and name, keep the stat, rank, movement, promotion, might, hit, crit, weight, and
rank fields the tab displays. Pointer fields (for example `BattleAnimePointer`)
are kept as their raw hex string, not followed, since the gallery does not need
them for v1.

## 7. Portraits

`--export-portrait-all` writes PNGs into `assets/reference/<game>/portraits/`. The
exact filename scheme (for example `{id}_{name}.png` or `{id}.png`) is read from
the tool's output during implementation, and the normalizer records, per unit, the
portrait filename to display. A unit whose portrait is missing shows a neutral
placeholder rather than a broken image.

## 8. Animations: lazy and cached

The gallery server owns animation generation.

- The Animations tab has an animation id input (0 based) and a section selector
  (0 to 11, default 0), and a Play control.
- Requesting an anim calls `/anim?game=G&id=N&section=S`. The server checks the
  cache at `assets/reference/<game>/anims/<id>_<section>.gif`. On a miss it runs
  `FEBuilderGBA.CLI --rom=<game rom> --export-battle-anime --animation-id=N --gif
  --section=S --out=<cache file>`, then serves the file. Errors (bad id, CLI
  failure) return a clear message the tab shows, not a crash.
- Ids are browsed by stepping the input. If an id is invalid the tab shows the
  error from the tool. v1 does not enumerate the valid id range up front.

## 9. Error handling

- `import.ts` checks the CLI and ROM exist before running and prints a clear path
  and fix if not. A nonzero CLI exit aborts with the tool's stderr surfaced.
- The gallery server validates `id` and `section` are integers in range, confines
  static reads to `gallery/` and `assets/reference/`, and confines anim writes to
  `assets/reference/anims/`. It returns structured errors, never raw stack traces,
  to the page.
- The gallery page degrades gracefully: a missing `assets/reference/` (import not
  run yet) shows a short "run Import Assets.cmd first" message rather than a blank
  screen.

## 10. Testing

- `normalize.ts`: parse hex to int, split `Index` into id and name, shape a unit,
  a class, and an item record from sample raw rows, and tolerate a missing
  optional field.
- `galleryutil.ts`: static path safety accepts `gallery/` and `assets/reference/`
  paths and rejects traversal; the anim cache key is stable for the same id and
  section; the CLI argument list for an anim export is built correctly.
- The CLI-dependent import and the gallery UI are verified by running the import in
  this environment once (the CLI works here) and eyeballing the gallery in a
  browser before handoff, the same way the sim views were verified.
- The existing sim, editor, and MCP suites still pass unchanged.

## 11. Out of scope

- **Unified-ROM asset porting (the named next big track).** Taking a class, a
  portrait, or a battle animation from FE6 or FE7 and installing it into an
  FE8-based ROM to build a single unified hack. This is the Tier 3 asset-porting
  and ROM-build world: FEBuilder's import commands (`--import-data`,
  `--import-portrait`, `--import-battle-anime`) or the Skill System buildfile plus
  Event Assembler and, for animations, the AAA pipeline. It also reopens the
  git-source-of-truth decision (buildfile versus editing a ROM in place). It gets
  its own spec after the gallery, and the multi-game gallery is the groundwork for
  it: you browse all three games and pick what to port.
- Mapping canon units or classes into the sim's data model (the Pow to str and mag
  split, movement type inference). The focused follow-up after the gallery.
- Map import, and pre-exporting all 12 sections of every animation.
- Any change to the sim, the editor, or the MCP server.
