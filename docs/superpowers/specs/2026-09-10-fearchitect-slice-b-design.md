# FEArchitect Slice B: 1v1 Tactical Grid

Date: 2026-09-10
Status: Approved for planning
Author: Claude (Opus 4.8) with Theo (Technical Game Designer)

## Prose and code conventions

No em dashes or en dashes anywhere in this document or in code and comments.
Use colons or commas instead.

## 1. Purpose

Slice B grows the Tier 1 math preview into a small playable tactical encounter:
one player unit versus one enemy on a grid. It proves the new layer that a grid
adds over Slice A: movement across terrain, movement types, turn order, a simple
enemy AI, and live seeded combat resolved through the existing engine. It is
still 1v1, and it reuses `combat.ts`, `rng.ts`, and `types.ts` unchanged in
their combat role.

Rendering is deliberately abstract: colored tiles with simple inline vector
sprites (pine forests, waves, rocky peaks), and units drawn as tokens with an HP
number and a type mark. No image files, no framework.

## 2. Success criteria

Slice B is done when all of the following are true:

1. Double-clicking a launcher opens a grid encounter in the browser: a map of
   colored tiles with sprites, a player unit, and an enemy unit at their start
   positions.
2. The player unit shows its reachable tiles highlighted, computed from its
   movement type and the terrain movement costs.
3. Clicking a reachable tile previews the path and slides the unit along it to
   that tile. A second click confirms: on the destination tile it commits the
   move, on an adjacent enemy it commits an attack. Clicking another reachable
   tile re-picks the path. A cancel returns the unit to its pre-preview tile.
4. Attacking resolves one real combat exchange (initiator, counter if in range
   and alive, follow up if doubling) through `computeMatchup` and `roll2RN`,
   using a seeded RNG, and appends the result to a visible combat log.
5. Ending the turn runs the enemy phase: the enemy AI moves toward the player
   within its own movement range and attacks if the player is in range.
6. The encounter ends when one unit reaches 0 HP: a win if the enemy dies, a
   loss if the player dies. The result is shown.
7. Switching the player's movement type (foot, cavalry, flying) recomputes the
   reachable set live, so the terrain differences are visible.
8. An "auto play player" checkbox drives the player side with the same AI as the
   enemy, so the whole skirmish runs itself deterministically from the seed.
9. The seed is shown and can be re-rolled, and a fixed seed reproduces the same
   auto played skirmish exactly.

## 3. Scope decisions and rationale

Decided during brainstorming.

- **Second page in the same app.** The grid is a new "Play" view served by the
  existing server, reusing the combat engine directly. Not a separate project.
  A new launcher `Play Map.cmd` opens it, and the two pages link to each other.

- **Units gain a class.** `data/classes.json` defines classes with a movement
  type and base move points. `units.json` gains a `class` field. Eirika becomes
  foot, the Wyvern Rider becomes flying, so Slice A's `duel-01` keeps working and
  gains a movement type.

- **Live single rolls on the grid, Monte Carlo stays in the editor.** The grid
  plays real seeded rolls with a visible seed and a combat log. The Monte Carlo
  batch remains the Tier 1 editor's tool.

- **Movement types: foot, cavalry, flying.** Terrain movement cost is defined per
  movement type. Flying ignores terrain cost and crosses water and gaps. Cavalry
  is fast on open ground but blocked by mountains and slowed in forest. Foot is
  the baseline.

- **Hand-authored abstract JSON maps.** No FEBuilder map import in this slice.
  Terrain, costs, and maps are all tunable config.

- **Inline vector sprites, not image files.** Keeps the project dependency free
  and CSP safe, scales to any tile size, and is easy to tune. Swapping to image
  sprite sheets later would not touch grid or combat logic.

## 4. Architecture

The combat engine stays pure and unchanged in its role. New pure modules handle
the grid, movement, AI, and the turn state machine. A browser client renders the
grid and drives interaction. Data flows one way at load: config into a resolved
grid encounter, then the game state machine advances it.

```
config JSON (terrain, classes, maps, encounter)
        |
        v
  grid datagen (validate + resolve)  ->  GridEncounter
        |
        v
  game state machine (movement, ai, combat) <-> browser client (render + input)
        ^                                            |
        |                                            v
     seeded rng                                 combat log, result
```

Every new logic module is pure and DOM free so it is unit tested with the Node
test runner, exactly like Slice A. Rendering and input are the only browser only
parts and are verified in the browser.

## 5. Repository layout additions

| Path | Responsibility |
|------|----------------|
| `data/terrain.json` | Terrain types: move cost per movement type, avoid, def, passability. |
| `data/classes.json` | Classes: name, movement type, base move points. |
| `maps/showcase-terrain.json` | Preset map: bands of every terrain. |
| `maps/river-crossing.json` | Preset map: water with a narrow bridge. |
| `maps/forest-hills.json` | Preset map: forest plus mountains. |
| `encounters/skirmish-01.json` | Grid encounter: map ref, unit start positions, enemy ai. |
| `src/grid/types.ts` | Grid specific types: MovementType, TerrainDef, ClassDef, MapData, GridEncounter, GridUnit, TileVec, Path. |
| `src/grid/datagen.ts` | Load and validate terrain, classes, maps, and grid encounters into a GridEncounter. |
| `src/grid/terrain.ts` | Terrain cost, passability, and combat bonus lookups. |
| `src/grid/movement.ts` | Reachable tile set (Dijkstra) and pathfinding to a tile. |
| `src/grid/ai.ts` | Enemy or auto player decision: move toward target, attack if in range. |
| `src/grid/game.ts` | Turn state machine: apply move, apply attack, advance phase, check end. |
| `src/grid/render.ts` | Pure sprite and tile SVG builders, shared by the client and reusable for future previews. |
| `src/game/index.html` | The Play view page. |
| `src/game/client.ts` | Browser side: render grid, handle two click interaction, animation, auto play. |
| `Play Map.cmd` | Double-click: start the server, open the Play view. |

Note on `src/grid/render.ts`: the sprite builders are pure string producers, no
DOM, so they are unit testable and can be reused by tools later.

## 6. Data shapes

Illustrative. Field names may shift slightly during implementation.

```jsonc
// data/terrain.json
// moveCost is per movement type; null means impassable to that type.
{
  "plains":   { "name": "Plains",   "moveCost": { "foot": 1, "cav": 1,    "fly": 1 }, "avoid": 0,  "def": 0 },
  "forest":   { "name": "Forest",   "moveCost": { "foot": 2, "cav": 3,    "fly": 1 }, "avoid": 20, "def": 1 },
  "mountain": { "name": "Mountain", "moveCost": { "foot": 3, "cav": null, "fly": 1 }, "avoid": 30, "def": 2 },
  "water":    { "name": "Water",    "moveCost": { "foot": null, "cav": null, "fly": 1 }, "avoid": 0, "def": 0 },
  "wall":     { "name": "Wall",     "moveCost": { "foot": null, "cav": null, "fly": null }, "avoid": 0, "def": 0 }
}
```

```jsonc
// data/classes.json
{
  "infantry": { "name": "Infantry", "movementType": "foot", "move": 5 },
  "cavalier": { "name": "Cavalier", "movementType": "cav",  "move": 7 },
  "flier":    { "name": "Flier",    "movementType": "fly",  "move": 7 }
}
```

```jsonc
// units.json gains a class field (existing stat fields unchanged)
{
  "eirika-t": { "name": "Eirika", "class": "infantry", "hp": 24, "str": 9, "mag": 3, "skl": 13, "spd": 15, "lck": 12, "def": 7, "res": 6, "con": 5 },
  "wyvern-1": { "name": "Wyvern Rider", "class": "flier", "hp": 30, "str": 12, "mag": 0, "skl": 8, "spd": 9, "lck": 2, "def": 11, "res": 2, "con": 13 }
}
```

```jsonc
// maps/showcase-terrain.json
// tiles is a rectangular grid of terrain ids, row major. legend keeps files
// short and human editable.
{
  "id": "showcase-terrain",
  "legend": { ".": "plains", "f": "forest", "^": "mountain", "~": "water", "#": "wall" },
  "tiles": [
    ".....^...~.",
    "...ff^...~.",
    "...ff^...~.",
    "...ff^.....",
    "...ff^...~.",
    ".....^...~.",
    ".........~."
  ]
}
```

```jsonc
// encounters/skirmish-01.json
{
  "id": "skirmish-01",
  "map": "showcase-terrain",
  "notes": "Grid proof: reach the flying Wyvern across terrain.",
  "player": { "unit": "eirika-t", "weapon": "iron-sword", "at": [1, 3] },
  "enemy":  { "unit": "wyvern-1", "weapon": "iron-lance", "at": [9, 3], "ai": "aggressive" },
  "win": "rout"
}
```

## 7. Movement model

- A unit's movement budget is its class `move`. The reachable set is every tile
  whose least cost path from the start is within budget, computed with Dijkstra
  over per movement type terrain costs. Impassable tiles (null cost) are never
  entered. Flying uses cost 1 everywhere passable to it, so it crosses water and
  mountains.
- A unit cannot end its move on a tile occupied by another unit. For 1v1 this is
  just the other unit's tile. The unit may not pass through the enemy either, so
  the enemy tile is treated as blocked for pathing.
- Pathfinding returns the least cost path (a list of tiles) from the unit to a
  chosen reachable tile, used to animate the slide and to validate the move.

## 8. Combat on the grid

- Attacking is allowed when the target is within the attacker's weapon range of
  the attacker's current tile. Slice B weapons are melee, range 1, so the target
  must be orthogonally adjacent. Weapon range is read from the weapon, so range 2
  is a later addition without a model change.
- One attack resolves a single real exchange, reusing the Slice A rules:
  attacker strikes, defender counters if it is alive and the attacker is within
  the defender's range, then either side that doubles strikes again. Each strike
  uses `computeMatchup` for the numbers and `roll2RN` plus a crit roll for the
  outcome, drawing from the seeded RNG.
- Terrain under the defender contributes avoid and def, applied in the matchup.
  This is the one combat input the grid adds: `computeMatchup` gains optional
  terrain avoid and def for the defender's tile. Slice A callers pass zero, so
  the duel and its tests are unchanged.
- Every strike appends a line to the combat log: who hit whom, hit chance, damage
  or miss, crit, and remaining HP.

## 9. Enemy and auto player AI

`src/grid/ai.ts` produces a decision for a unit given the game state:

- If a target is within attack range from the unit's current tile, attack it.
- Otherwise, for `aggressive` AI, find the reachable tile adjacent to the target
  with the least path cost, move there, and attack if now in range. If no
  adjacent tile is reachable this phase, move along the cheapest path toward the
  target as far as the budget allows and do not attack.
- For `stationary` AI, never move: attack only if a target is already in range,
  otherwise hold.

Slice B implements `aggressive` and `stationary`, the two values the encounter
`ai` field can take. Aggressive always pursues, there is no aggro range in this
slice (a leash or aggro radius is a later refinement). The same function drives
the enemy phase and, when the auto play checkbox is on, the player phase, so an
auto played skirmish is fully deterministic given the seed.

## 10. Turn state machine

`src/grid/game.ts` holds the game state (units with current HP and position,
whose phase it is, the turn count, the RNG, the log) and exposes pure transitions:

- `reachable(unitId)`: the reachable set for that unit this phase.
- `path(unitId, to)`: the least cost path, or null if unreachable.
- `applyMove(unitId, to)`: move a unit to a reachable tile.
- `applyAttack(attackerId, targetId)`: resolve one exchange, append to the log,
  update HP.
- `endPhase()`: switch player and enemy phase, refresh who may act.
- `status()`: ongoing, player won, or player lost.
- `takeAiTurn(unitId)`: consult `ai.ts` and apply the resulting move and attack.

The client calls these; it never mutates state directly. State transitions are
where the tests concentrate.

## 11. Interaction and animation

- On the player phase, the active unit's reachable tiles are tinted and outlined.
- First click on a reachable tile: compute the path, animate the unit sliding
  tile by tile along it to the destination (a short tween per step), and mark the
  destination as previewed. Enemies attackable from the previewed tile get a
  marker.
- Second click:
  - on the previewed destination tile, commit the move and end the unit's action;
  - on a marked adjacent enemy, commit the move to the previewed tile (if not
    already there) and then the attack;
  - on a different reachable tile, discard the preview and pick that path instead.
- A cancel control (right click, Escape, or clicking the unit) returns the unit
  to its pre preview tile and clears the preview.
- End Turn runs the enemy phase: for each enemy, `takeAiTurn` is applied, with
  the same slide animation, then control returns to the player.
- Auto play player: when checked, the player phase is also run by `takeAiTurn`,
  and phases advance automatically with a short delay between actions so the run
  is watchable. The run stops at a result.

Side panel controls: the seed (with a re-roll button), the combat log, an End
Turn button, the auto play player checkbox, and a movement type selector (foot,
cavalry, flying). The selector overrides the active player unit's class for the
reachable computation and display, so the terrain differences can be explored on
the same map without editing config. It is a showcase and preview aid; the unit's
saved class in `units.json` is unchanged unless edited in the Tier 1 editor.

Animation is purely visual. The authoritative position is the game state; the
tween only interpolates between the old and new tiles.

## 12. Rendering and sprites

- The map is a grid of colored tiles, each with an inline vector sprite for its
  terrain: grass tufts for plains, pine trees for forest, rocky snow capped peaks
  for mountain, waves for water, bricks for wall. Sprites have small per tile
  deterministic variation so tiles do not look stamped.
- Units are tokens with an HP number and a movement type mark: a plain token for
  foot, a horse silhouette with a rider for cavalry, a winged token with a hover
  shadow for flying. Player and enemy differ by color.
- Tile size is configurable, defaulting large enough to read the sprites (for
  example 48 to 64 pixels). Sprite builders are pure and live in
  `src/grid/render.ts`.
- The "math preview is not engine truth" note from Slice A carries over onto this
  view as well.

## 13. Testing

- `terrain.ts`: cost and passability per movement type, including impassable and
  flying crossing water.
- `movement.ts`: reachable set correctness on a known small map for foot, cavalry,
  and flying (cavalry blocked by mountain, flying crossing water); pathfinding
  returns a least cost path and null for unreachable tiles; the enemy tile blocks
  pathing.
- `ai.ts`: attacks when in range, moves to the least cost adjacent tile when not,
  holds when stationary.
- `game.ts`: applyMove rejects an unreachable tile, applyAttack resolves an
  exchange and updates HP and the log, status detects win and loss, a seeded auto
  played skirmish is deterministic (same seed yields the same log).
- `combat.ts`: a new test that terrain avoid and def change the matchup, and a
  regression test that Slice A callers passing zero terrain get the old numbers.
- `render.ts`: sprite builders return SVG containing the expected shapes for each
  terrain and unit type.

## 14. Out of scope for Slice B

- More than one unit per side. The state machine is written to iterate units so
  this grows later without a rewrite.
- Ranged weapons (bows, magic at range 2), although weapon range is read from the
  weapon so the model already allows it.
- Seize and survive win conditions, although the `win` field is present.
- Real FE8 map import, healing, staves, status effects, and animations beyond the
  slide tween.
- The MCP server, still deferred until after this slice.
```
