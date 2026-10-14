# FEArchitect Multi-Unit Tactical Play and Portrait Sprites

Date: 2026-10-14
Status: Approved for planning
Author: Claude (Opus 4.8) with Theo (Technical Game Designer)

## Prose and code conventions

No em dashes or en dashes anywhere in this document or in code and comments. Use
colons or commas instead. Do not add Co-Authored-By or any attribution trailer to
commits (project owner preference, recorded in memory).

## 1. Purpose

Make a scenario playable with several units per side, and give units a face. The
scenario viewer becomes a tactical map: select your unit, see its movement range over
real terrain, move it, and attack an enemy in range. End Turn runs the enemy AI. Units
are drawn as their portraits. This turns the authored units, skills, and terrain we
already have into an actual playable encounter, a step toward the scenario authoring
north star. The existing 1v1 Play Map is left untouched.

## 2. What exists and what changes

Exists and is reused unchanged:
- Pure movement: `computeReachable(map, defs, opts, blocked)` and
  `findPath(map, defs, opts, to, blocked)` in `src/grid/movement.ts` (blockers are a
  set of tile keys).
- Pure combat: `resolveExchange(...)` and `computeMatchup(...)` in `src/combat.ts`,
  now skill aware.
- Terrain: `terrainMod`, `enterCost`, `applyTileHeal` logic.
- Scenario resolve: `resolveScenario` and `loadScenario` produce a `ResolvedScenario`
  with placed `GridUnit`s (hp, pos, side, cls, weapon, skills).
- `unitSprite` and the map rendering in the scenario viewer.

New:
- A multi-unit game state and engine (`src/grid/multigame.ts`), orchestrating the pure
  pieces for N units per side.
- A small aggressive enemy AI for the multi-unit state.
- Portrait tokens: units render as their portrait image, with the colored sprite as a
  fallback.
- The scenario viewer (`src/game/scenario.ts`) becomes playable.

The 1v1 `GameState` and `Play Map` (`src/game/client.ts`) are not changed.

## 3. Success criteria

1. **Engine.** `src/grid/multigame.ts` exposes a `MultiGame` state and functions to
   get a unit's reachable tiles (other units block), move a unit, attack an adjacent
   or in-range enemy (resolving combat, applying HP, removing the dead), end a phase,
   heal on a healing tile at phase start, and report status (rout: player wins when no
   enemies remain, loses when no players remain). Each unit acts once per phase.
2. **AI.** On the enemy phase, each enemy either moves adjacent to the nearest player
   it can reach and attacks, or steps toward the nearest player. Stationary units hold.
3. **Sprites.** A unit with a `portrait` number draws its portrait
   (`/assets/reference/fe8/portraits/portrait_NNN.png`) as its token with a side-colored
   ring, HP shown; a unit without one draws the current colored sprite. Example authored
   units get portraits.
4. **Playable viewer.** In the scenario viewer: clicking a player unit that has not
   acted shows its move range; clicking a reachable tile moves it; clicking an adjacent
   or in-range enemy attacks (after moving, or in place); End Turn ends the player phase
   and runs the enemy AI; the status line shows whose phase it is and win or lose. Unit
   inspection and the matchup forecast remain available.
5. The engine logic (reachable with blockers, move, attack and death, win or lose, AI
   decision, acted tracking) is unit tested. The full existing suite still passes. No
   new dependency. The 1v1 Play Map still works.

## 4. Components

### Component 1: Multi-unit engine (`src/grid/multigame.ts`, pure logic)

State:

```
interface MultiGame {
  id: string;
  map: ResolvedMap;
  terrainDefs: Record<string, TerrainDef>;
  units: GridUnit[];   // live units; dead ones are removed
  phase: Side;         // "player" or "enemy"
  turn: number;
  acted: Set<string>;  // unit ids that have acted this phase
  rng: Rng;
  log: string[];
}
```

Functions (all operate on `MultiGame`):
- `createMultiGame(scenario: ResolvedScenario, seed: number): MultiGame`.
- `unitAt(g, x, y)` and `unitById(g, id)` helpers.
- `blockers(g, exceptId)`: tile keys of every unit except `exceptId`.
- `reachableFor(g, id)`: `computeReachable` with `opts` from the unit's class and
  `blocked = blockers(g, id)`. Empty if the unit is not the active side or has acted.
- `canAttack(g, attackerId, targetId)`: target is an enemy within the attacker's weapon
  range (Manhattan).
- `moveUnit(g, id, to)`: validate reachable, set `pos`. (Does not mark acted on its own;
  a move plus optional attack is one action, see `act`.)
- `attack(g, attackerId, targetId)`: resolve with `resolveExchange`, using each side's
  terrain mod and skills; apply HP; remove any unit at 0 HP; log.
- `act(g, id, to, targetId?)`: move then optionally attack, then add `id` to `acted`.
  The UI calls this; the AI calls this.
- `endPhase(g)`: switch phase, increment turn after the enemy phase, clear `acted`, and
  heal the newly active side's units standing on healing tiles.
- `status(g)`: "player-won" if no enemy units, "player-lost" if no player units, else
  "ongoing".

### Component 2: Enemy AI (`src/grid/multiai.ts`, pure)

`decideMultiAction(g, id): { to: TileVec; attackTargetId: string | null }`:
- Gather living players. If none, hold.
- If any player is attackable from the unit's current tile, attack it (nearest, then
  lowest HP as a tiebreak), staying put.
- Else, among reachable tiles, find one adjacent to (in weapon range of) a player, prefer
  the one reaching the nearest player; move there and attack.
- Else, step toward the nearest player along `findPath` as far as the move allows.
- A `stationary` unit holds and only attacks from its tile.

The engine applies the action via `act`.

### Component 3: Portrait tokens

- Add an optional `portrait?: number` to the authored unit shape (`UnitAuthor`) and
  carry it onto `GridUnit` during resolve.
- A render helper draws a unit token: if `portrait` is set, an `image` of
  `/assets/reference/fe8/portraits/portrait_<NNN>.png` clipped to a rounded box with a
  side-colored border and the HP number; otherwise the existing `unitSprite`.
- Example authored units (`data/units.json`) get a `portrait` number from the 240
  available.

### Component 4: Playable scenario viewer (`src/game/scenario.ts`, `scenario.html`)

The viewer builds a `MultiGame` from the loaded scenario and plays it:
- Render the map, portrait tokens, the selected unit's reachable tiles (blue), and
  attackable enemies (red outline) when a unit is selected.
- Click handling: select an un-acted player unit to show its range; click a reachable
  tile to move (then the unit stays selected to pick an attack, or confirm); click an
  enemy in range to attack. A simple two-step move-then-attack, with a way to wait
  (act with no attack).
- An End Turn button ends the player phase and runs the enemy AI unit by unit (with a
  short delay per action for readability), then returns control.
- A status line shows the phase, turn, and win or lose. Inspection and the matchup
  forecast (from this slice's predecessor) remain, shown for the selected or hovered
  unit.

## 5. Architecture

The engine and AI are new pure modules under `src/grid/`, reusing the existing pure
movement, range, combat, and terrain helpers. No change to the 1v1 `GameState`,
`game.ts`, or `client.ts`. The scenario viewer client grows the play loop. Portraits
are served from `assets/reference/fe8/portraits/` (the game server already serves
`assets/reference/`). Portrait images are ROM derived and gitignored; the example units
reference portrait numbers but the images themselves are produced by Import Assets.

## 6. Data shapes

A unit may carry a portrait:

```
"seth": { "name": "Seth", "class": "paladin", ..., "portrait": 129 }
```

`MultiGame` and `decideMultiAction` as in section 4.

## 7. Testing

- `multigame`: reachable excludes tiles occupied by other units; `moveUnit` rejects an
  unreachable or occupied tile; `attack` applies damage, removes a unit at 0 HP, and
  logs; `status` reports rout win and loss; `endPhase` toggles side, clears acted, and
  heals on a healing tile; a unit cannot act twice in a phase.
- `multiai`: attacks in place when a player is adjacent, moves adjacent and attacks when
  one is reachable, steps toward the nearest otherwise, and a stationary unit holds.
- The playable viewer is browser verified: select, move, attack, enemy AI on End Turn,
  and a win and a loss, with portrait tokens.
- The full existing suite still passes, and the 1v1 Play Map still plays.

## 8. Out of scope now, planned next

- Real overworld map sprites (still their own reverse-engineering track; portraits are
  used here).
- Inventories and multiple weapons per unit, weapon rank effects, canto, rescue, and
  1 to 2 range subtleties beyond `weapon.range`.
- Fog of war, reinforcements, and objectives other than rout.
- Move and attack animations beyond a simple step delay.
- A unit and scenario editor UI, and MCP-driven authoring (the north star).

## 9. Risks

- Engine scope: generalizing to N units is mostly orchestration since the hard parts
  (movement, pathing, combat, skills, terrain) already exist and are tested. Mitigation:
  each engine function is small and unit tested before the UI is built.
- AI quality: a simple aggressive AI can make weak moves. Mitigation: it is deliberately
  simple and deterministic for v1, with smarter behavior a later refinement; it is unit
  tested for the core cases.
- Portraits are stand-ins for authored custom characters (they are FE8 faces).
  Mitigation: the `portrait` field is optional and purely cosmetic, and real map sprites
  remain the eventual authentic option.
