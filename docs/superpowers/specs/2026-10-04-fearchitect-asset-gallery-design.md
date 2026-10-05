# FEArchitect FE8 Asset Reference Gallery

Date: 2026-10-04
Status: Approved for planning
Author: Claude (Opus 4.8) with Theo (Technical Game Designer)

## Prose and code conventions

No em dashes or en dashes anywhere in this document or in code and comments.
Use colons or commas instead. Do not add Co-Authored-By or any attribution
trailer to commits (project owner preference).

## 1. Purpose

Let the owner browse the FE8 canon, units, classes, items, portraits, and battle
animations, imported from a clean FE8 ROM through `FEBuilderGBA.CLI`. The gallery
is a read-only reference. It stays separate from the sim's curated hand-authored
data so the clean `data/*.json` and encounters are never flooded with 255 canon
entries. Mapping a specific canon unit or class into the sim model is a later,
focused follow-up, out of scope here.

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

## 3. Success criteria

1. Double-clicking `Import Assets.cmd` runs the CLI against `base/FE8_Clean.gba`
   and writes `assets/reference/{units,classes,items}.json` plus
   `assets/reference/portraits/*.png`. It fails with a clear message if the CLI or
   the ROM is missing.
2. The normalized JSON has integer fields (hex strings parsed) and, for units,
   separate `id` and `name` fields split from the raw `Index`.
3. Double-clicking `Gallery.cmd` opens a local web gallery with four tabs: Units,
   Classes, Items, Animations.
4. Units tab shows each unit's portrait, name, class, base stats, growths, and
   weapon ranks, and is text-searchable.
5. Classes and Items tabs show their records in readable tables.
6. The Animations tab lets the owner pick an animation id and section and plays
   the GIF. The GIF is produced on demand by the gallery server, cached under
   `assets/reference/anims/`, and served instantly on repeat views.
7. `assets/reference/` is gitignored (it derives from the copyrighted ROM).
8. The sim, editor, and MCP server are unchanged and still pass their tests. The
   gallery and import runner add no npm dependency.

## 4. Architecture

Two cooperating pieces over a one-way flow from the ROM:

```
base/FE8_Clean.gba  +  tools/febuilder-cli/FEBuilderGBA.CLI.exe
        |                              |
        v  (tools/assetgen/import.ts runs the CLI)
  assets/reference/{units,classes,items}.json  (normalized)
  assets/reference/portraits/*.png             (bulk, once)
        |
        v  (gallery/ server serves these; lazily generates anim GIFs)
  gallery web app  <-- /anim?id=N&section=S  runs CLI, caches to anims/
```

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

The CLI path (`tools/febuilder-cli/FEBuilderGBA.CLI.exe`) and ROM path
(`base/FE8_Clean.gba`) are resolved from the project root, with environment
overrides (`FEA_FEBUILDER_CLI`, `FEA_FE8_ROM`) for a different location.

## 5. Repository layout additions

| Path | Responsibility |
|------|----------------|
| `tools/assetgen/paths.ts` | Resolve CLI path, ROM path, and the reference dir from the project root plus env overrides. Pure given its inputs. |
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

`--export-portrait-all` writes PNGs into `assets/reference/portraits/`. The exact
filename scheme (for example `{id}_{name}.png` or `{id}.png`) is read from the
tool's output during implementation, and the normalizer records, per unit, the
portrait filename to display. A unit whose portrait is missing shows a neutral
placeholder rather than a broken image.

## 8. Animations: lazy and cached

The gallery server owns animation generation.

- The Animations tab has an animation id input (0 based) and a section selector
  (0 to 11, default 0), and a Play control.
- Requesting an anim calls `/anim?id=N&section=S`. The server checks the cache at
  `assets/reference/anims/<id>_<section>.gif`. On a miss it runs
  `FEBuilderGBA.CLI --rom=<rom> --export-battle-anime --animation-id=N --gif
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

- Mapping canon units or classes into the sim's data model (the Pow to str and mag
  split, movement type inference). This is the focused follow-up after the gallery.
- Map import, importing portraits or animations back into a ROM, and pre-exporting
  all 12 sections of every animation.
- Any change to the sim, the editor, or the MCP server.
