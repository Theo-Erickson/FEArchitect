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

## Combat formulas

Ported from the fireemblem8u decomp (`src/bmbattle.c` ComputeBattleUnit
functions and `include/bmbattle.h`), including the two random number (2RN) hit
model and the attack speed difference of 4 needed to double. See comments in
`src/combat.ts` and `src/rng.ts` for the exact citations.
