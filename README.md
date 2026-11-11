<p align="center">
  <img src=".github/readme/banner.gif" alt="FEArchitect: A sandbox for designing Fire Emblem 8 encounters" width="100%">
</p>

<p align="center">
  <img alt="version: 0.0.1" src="https://img.shields.io/badge/version-0.0.1-ff4fd8?style=flat-square">
  <img alt="made with: TypeScript" src="https://img.shields.io/badge/made%20with-TypeScript-ff4fd8?style=flat-square&logo=typescript&logoColor=white">
  <img alt="status: work in progress" src="https://img.shields.io/badge/status-work%20in%20progress-e5534b?style=flat-square">
  <img alt="ready to use: not yet" src="https://img.shields.io/badge/ready%20to%20use-not%20yet-e5534b?style=flat-square">
</p>

<p align="center">
  <a href="#what-it-does">What it does</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

<table>
<tr>
<td width="52%"><img src=".github/readme/hero.gif" alt="FEArchitect in action" width="100%"></td>
<td>

### A sandbox for designing Fire Emblem 8 encounters

**Work in progress.** FEArchitect is an early, personal sandbox for designing FE8 encounters: fight math ported from the decomp, a small tactical grid to play scenarios on, and a reference gallery built from your own ROMs.

It is groundwork, not a finished tool. The long-term goal is editing FE8 maps and scenarios with an MCP server as the authoring assistant; none of that write path exists yet.

</td>
</tr>
</table>

> [!NOTE]
> This project is a work in progress and is not ready to use as a tool. Features are incomplete, data formats change without notice, and nothing here writes to a ROM yet.

## What it does

- **Fight math from the decomp.** Hit, damage, crit and doubling follow the fireemblem8u source, including the 2RN hit model, so a duel previews the way the game would roll it.
- **A tactical grid to try scenarios on.** Multi-unit scenarios on a terrain grid, with class-based movement, an aggressive enemy AI and seeded auto play to rerun a fight exactly.
- **A reference gallery from your ROMs.** Units, classes, items, portraits, battle animations and chapter maps, imported locally from clean ROMs you supply. Nothing from the games is in this repo.
- **One operations layer, three ways in.** The same reads, edits, previews and simulations through a CLI, an MCP server for Claude, or a local Ollama bridge.

## Requirements

Node.js 24 or newer (it runs the TypeScript directly, no build step). Check with
`node --version`.

## Use it

Double-click **FEArchitect.cmd**. It opens the hub, a control panel in your
browser that lists every tool, says when to use it, checks what it needs (ROMs,
the asset CLI, imported data), and starts it for you with its output shown live
beside it. Leave the small console window open while you work; closing it stops
everything the hub started.

The single-tool launchers live in `launchers/` if you'd rather double-click one
directly:

- Double-click **Open Editor.cmd** to open the editor in your browser. Edit unit
  stats and weapons on the left, watch the fight math update on the right, and
  click Save to write your changes back into the config files.
- Double-click **Preview.cmd** to print the fight math for the baseline duel
  without opening a browser.
- Double-click **Test.cmd** to run the test suite.

### Map skirmish (Slice B)

- Double-click **Play Map.cmd** to open the 1v1 tactical grid in your browser.
  Move your unit within its highlighted range (movement depends on its class and
  the terrain), click a tile to preview the path, click again to confirm a move,
  or click an adjacent enemy to attack. Use "End turn" to pass to the enemy, the
  "Player type" selector to compare foot, cavalry, and flying movement, and
  "auto play player" to watch the whole fight run itself from the seed.
- Double-click **Play Scenario.cmd** for multi-unit scenarios with unit
  inspection, matchup forecasts and the enemy AI.

Grid data lives in `data/terrain.json`, `data/classes.json`, `maps/*.json`, and
`encounters/skirmish-01.json`.

## Where the data lives

- `data/units.json`: unit stats.
- `data/weapons.json`: weapon stats.
- `encounters/duel-01.json`: which units and weapons face off.

You can edit these by hand, but the editor is the easy path and it validates as
it loads.

## What this does and does not tell you

The math preview is authoritative for encounter pacing and difficulty only. It is
not authoritative for engine behavior: animations, menus, skill interactions, and
crashes are decided by a real ROM build, which is a later tier of this project.

## MCP server, CLI, and local bridge

FEArchitect has a shared operations layer (`mcp/handlers.ts`) exposed three ways.

### CLI (no AI, always available)

Run commands directly, for example:

    node mcp/cli.ts list units
    node mcp/cli.ts preview duel-01 --seed 42
    node mcp/cli.ts simulate skirmish-01 --seed 5
    node mcp/cli.ts set-unit eirika-t str=12 spd=16

Or run them from the hub, or double-click `launchers/Preview (CLI).cmd` and
`launchers/Simulate.cmd`.

### MCP server (for Claude)

One-time: `cd mcp && npm install`. The repo's `.mcp.json` registers the server,
so running Claude Code in this folder makes the tools available after you approve
the server once. Then you can ask in natural language to read, edit, preview, and
simulate.

### Local bridge (natural language with a local model, no cloud)

One-time: install Ollama (ollama.com) and run `ollama pull qwen2.5`. Then
start the Local AI Bridge from the hub (or `node mcp/bridge.ts`) and type requests like
"raise Eirika's speed to 17 and simulate the skirmish". Set `FEA_OLLAMA_MODEL` or
`FEA_OLLAMA_HOST` to use a different model or endpoint.

## Combat formulas

Ported from the fireemblem8u decomp (`src/bmbattle.c` ComputeBattleUnit
functions and `include/bmbattle.h`), including the two random number (2RN) hit
model and the attack speed difference of 4 needed to double. See comments in
`src/combat.ts` and `src/rng.ts` for the exact citations.

## FE asset gallery

Browse the GBA Fire Emblem canon (units, classes, items, portraits, battle
animations) imported from your clean ROMs.

One-time setup:
- Install the `FEBuilderGBA.CLI` (laqieer fork release, the `cli-win-x64` asset)
  into `tools/febuilder-cli/`.
- Place clean ROMs in `base/`: `FE8_Clean.gba`, and optionally `FE6_clean.gba`
  and `FE7_clean.gba`. These and the imported assets are gitignored.

Then:
- Double-click **Import Assets.cmd** to import every game whose ROM is present.
- Double-click **Gallery.cmd** to open the gallery. Pick a game, browse the tabs
  (Units show class names; Classes and Items have a Cards or Table toggle, and in
  Table view hovering a cell shows the column name, the value, and a decoded reading
  such as a weapon rank letter). On the Animations tab, search the id picker by
  class name (each option has a thumbnail) or step with Prev and Next to see all 12
  battle sections as labeled GIFs, and use Zoom to enlarge the tiles. Each GIF is
  generated on first view and cached.
- Double-click **Cache Animations.cmd** (optional) to pre-generate every battle
  animation up front so the Animations tab is instant. It is safe to re-run: it
  skips anything already cached. The cache lives under `assets/reference/` and is
  gitignored.
- Double-click **Generate Maps.cmd** to render every FE8 chapter map into the
  gallery, then browse them under the Maps tab (searchable by chapter name, with a
  zoom). Images are cached under `assets/reference/` and are gitignored. The maps are
  composited from the ROM tileset, tile arrangement, and palette; see
  `docs/superpowers/notes/fe8-map-format.md` for the format.

## See it in action

Every clip is the real project, recorded with Readmotion. Nothing is mocked up.

<table>
<tr>
<td align="center"><img src=".github/readme/clip_math.gif" width="400" alt="Math: Editing a unit's stats updates the fight math live"><br><b>Math</b>: Editing a unit's stats updates the fight math live</td>
<td align="center"><img src=".github/readme/clip_grid.gif" width="400" alt="Grid: Auto play running a seeded 1v1 skirmish"><br><b>Grid</b>: Auto play running a seeded 1v1 skirmish</td>
<td align="center"><img src=".github/readme/clip_scenario.gif" width="400" alt="Scenario: A multi-unit scenario: move, end turn, enemy AI attacks"><br><b>Scenario</b>: A multi-unit scenario: move, end turn, enemy AI attacks</td>
</tr>
</table>

<p align="center">
  <img src=".github/readme/screenshot_editor.png" alt="Editor" width="820"><br>
  <sub>The stat editor and fight math preview, after raising Eirika's Spd and Str</sub>
</p>

<p align="center">
  <img src=".github/readme/screenshot_scenario.png" alt="Scenario" width="820"><br>
  <sub>A multi-unit scenario: move, end turn, enemy AI attacks</sub>
</p>

<p align="center">
  <img src=".github/readme/screenshot_skirmish.png" alt="Skirmish" width="820"><br>
  <sub>The 1v1 skirmish after an auto played fight, with its combat log</sub>
</p>

## How it's built

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#121a2e','primaryTextColor':'#f2efff','primaryBorderColor':'#e8c15a','lineColor':'#e8c15a','secondaryColor':'#1c2742','tertiaryColor':'#0c0f1a'}}}%%
flowchart LR
    root(["FEArchitect"])
    root --> d_data["data/<br/><small>5 files</small>"]
    root --> d_docs["docs/<br/><small>22 files</small>"]
    d_docs --> d_docs_superpowers["superpowers/"]
    root --> d_encounters["encounters/<br/><small>4 files</small>"]
    root --> d_gallery["gallery/<br/><small>9 files</small>"]
    root --> d_hub["hub/<br/><small>7 files</small>"]
    root --> d_launchers["launchers/<br/><small>12 files</small>"]
    root --> d_maps["maps/<br/><small>3 files</small>"]
    root --> d_mcp["mcp/<br/><small>10 files</small>"]
    root --> d_src["src/<br/><small>51 files</small>"]
    d_src --> d_src_editor["editor/"]
    d_src --> d_src_game["game/"]
    d_src --> d_src_grid["grid/"]
    root --> d_tools["tools/<br/><small>23 files</small>"]
    d_tools --> d_tools_assetgen["assetgen/"]
    d_tools --> d_tools_readmotion["readmotion/"]
```

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#121a2e','primaryTextColor':'#f2efff','primaryBorderColor':'#e8c15a','lineColor':'#e8c15a','secondaryColor':'#1c2742','tertiaryColor':'#0c0f1a','pie1':'#e8c15a','pie2':'#5aa0e8','pie3':'#b8c4dc','pie4':'#1c2742','pie5':'#121a2e','pieTitleTextColor':'#f2efff','pieSectionTextColor':'#0c0f1a','pieLegendTextColor':'#f2efff','pieStrokeColor':'#0c0f1a'}}}%%
pie showData
    title Languages, by size
    "TypeScript" : 92.3
    "HTML" : 6.4
    "Batch" : 1.3
```

<details>
<summary><b>The project in numbers</b></summary>

| | |
| --- | --- |
| **What it is** | A command line project |
| **Written in** | TypeScript (92.3%), HTML (6.4%), Batch (1.3%) |
| **Version** | `0.0.1` |
| **Run it with** | `FEArchitect.cmd` |
| **Size** | 152 files, 102 commits since 2026-09-09 |

</details>

## Development

```
data/         units, weapons, classes, terrain, skills
docs/         design specs, plans and format notes
encounters/   duels, skirmishes and scenarios
gallery/      the FE asset gallery
hub/          the one-click control panel
launchers/    double-click launchers for each tool
maps/         hand-made grid maps
mcp/          the CLI, MCP server and Ollama bridge
src/          fight math, grid engine, editor and game pages
tools/        asset import and Readmotion config
```

### Recording the README media

The GIFs above are made with Readmotion from `tools/readmotion/readmotion.json`. Open it in the Readmotion app and click **Record all**, then **Create README**, or from a terminal:

```
readmotion-cli capture tools/readmotion/readmotion.json
readmotion-cli build tools/readmotion/readmotion.json
```

## Roadmap

- [x] Tier 1 duel math preview
- [x] Tactical grid skirmish and multi-unit scenarios
- [x] Asset gallery and FE8 chapter map rendering
- [ ] Unit and enemy placements, and an encounter browser
- [ ] A unit editor and a starter skills system
- [ ] Writing maps, data and events back to a ROM
- [ ] MCP-assisted authoring of maps and scenarios
