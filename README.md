# FEArchitect

An FE8 encounter design sandbox. This is Slice A: a Tier 1 math preview for a
single player unit versus a single enemy. No ROM, no emulator, no grid.

## Requirements

Node.js 24 or newer (it runs the TypeScript directly, no build step). Check with
`node --version`.

## Use it

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

Or double-click `Preview (CLI).cmd` and `Simulate.cmd`.

### MCP server (for Claude)

One-time: `cd mcp && npm install`. The repo's `.mcp.json` registers the server,
so running Claude Code in this folder makes the tools available after you approve
the server once. Then you can ask in natural language to read, edit, preview, and
simulate.

### Local bridge (natural language with a local model, no cloud)

One-time: install Ollama (ollama.com) and run `ollama pull qwen2.5`. Then
double-click `Bridge.cmd` (or `node mcp/bridge.ts`) and type requests like
"raise Eirika's speed to 17 and simulate the skirmish". Set `FEA_OLLAMA_MODEL` or
`FEA_OLLAMA_HOST` to use a different model or endpoint.

## Combat formulas

Ported from the fireemblem8u decomp (`src/bmbattle.c` ComputeBattleUnit
functions and `include/bmbattle.h`), including the two random number (2RN) hit
model and the attack speed difference of 4 needed to double. See comments in
`src/combat.ts` and `src/rng.ts` for the exact citations.
