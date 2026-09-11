# FEArchitect MCP Server and CLI

Date: 2026-09-10
Status: Approved for planning
Author: Claude (Opus 4.8) with Theo (Technical Game Designer)

## Prose and code conventions

No em dashes or en dashes anywhere in this document or in code and comments.
Use colons or commas instead. Do not add Co-Authored-By or any attribution
trailer to commits (project owner preference).

## 1. Purpose

Give FEArchitect a validated operations layer over its data and its two cheap
evaluation tiers, exposed two ways:

1. An MCP server (stdio, TypeScript) that Claude Code and other MCP clients drive,
   so encounters, units, and weapons can be read, edited with schema validation,
   and evaluated through natural language instead of hand-editing JSON.
2. A plain CLI over the same logic, so the owner can read, edit, and simulate with
   deterministic commands and zero LLM usage (for example when Claude usage is
   exhausted).

The core logic lives in one place (`mcp/handlers.ts`); the MCP server and the CLI
are thin frontends over it. There is one source of combat truth: the handlers
import the existing pure engine (`src/combat.ts`, `src/grid/*`), never a reimplementation.

## 2. Success criteria

1. Running Claude Code in this repo, after approving the server once, exposes the
   tools `list`, `get`, `preview_encounter`, `simulate_skirmish`, `set_unit`,
   `set_weapon`, and `set_encounter`.
2. `preview_encounter` returns the Tier 1 deterministic breakdown plus a seeded
   Monte Carlo, matching what `src/preview.ts` prints for the same encounter and
   seed.
3. `simulate_skirmish` runs a grid encounter to a result headlessly and returns
   the winner, the turn count, and the combat log, deterministic for a fixed seed.
4. `set_unit`, `set_weapon`, and `set_encounter` validate the proposed change and
   either write the file or return a clear error with the file left unchanged.
5. The same operations are available from a CLI: `node mcp/cli.ts <command> ...`
   for list, get, preview, simulate, set-unit, set-weapon, set-encounter.
6. Every handler has a direct unit test. Write tests use a temporary project
   directory so the real `data/` is never modified by tests.
7. `src/` outside `mcp/` has no new dependencies. The sim and editor still run
   with zero dependencies and no build step.

## 3. Scope decisions and rationale

Decided during brainstorming.

- **TypeScript plus the official MCP SDK, quarantined in `mcp/`.** `mcp/` gets its
  own `package.json` declaring `@modelcontextprotocol/sdk` and `zod`. These are
  the project's first dependencies, confined to `mcp/`, so `src/`, the sim, and
  the editor stay zero-dependency. Node 24 runs the server as TypeScript with no
  build. The server imports the existing pure engine so combat and movement logic
  is never reimplemented.

- **Shared handlers plus two thin frontends.** Tool logic lives in `mcp/handlers.ts`
  as plain async functions `(projectRoot, args) => result`, with no SDK and no zod
  imports. `mcp/server.ts` wires them to MCP; `mcp/cli.ts` wires them to the
  command line. This makes the logic testable under plain `node --test` with no
  dependency install, and gives the owner an LLM-free way to work.

- **Extract `src/validate.ts`.** The unit, weapon, and encounter validators
  currently inside `src/datagen.ts` move to a new pure `src/validate.ts` that both
  `datagen.ts` and the handlers import. This is a mechanical refactor with no
  behavior change; existing tests must still pass.

- **Register via a project `.mcp.json`.** A repo-root `.mcp.json` registers the
  server so the tools are available when Claude Code runs in this repo, after the
  owner approves the server once. MCP servers are started by the client, so there
  is no launcher for the server itself. The CLI does get double-click `.cmd`
  wrappers for the common operations.

## 4. Architecture

```
                         mcp/handlers.ts  (pure logic, imports src/ engine)
                         /            \
           mcp/server.ts               mcp/cli.ts
           (MCP + zod schemas)         (argv parsing)
                |                          |
        MCP client (Claude)         terminal / .cmd / local model
```

The handlers read and write the same JSON files the editor and sim already use
(`data/*.json`, `encounters/*.json`, `maps/*.json`). Reads and evaluation call the
existing loaders and engine; writes validate in memory first, then write.

All handlers take a `projectRoot` and build absolute paths from it. The existing
loaders already accept path overrides (`loadBundle`, `loadGridEncounter`), so no
cwd guessing is needed. `server.ts` and `cli.ts` derive `projectRoot` from their
own location (the parent of `mcp/`).

## 5. Repository layout additions

| Path | Responsibility |
|------|----------------|
| `mcp/package.json` | ESM, declares `@modelcontextprotocol/sdk` and `zod`. |
| `mcp/handlers.ts` | The operations as pure async functions. No SDK, no zod. |
| `mcp/schemas.ts` | zod input schemas for the tools (imported by server.ts). |
| `mcp/server.ts` | MCP server: registers tools, connects stdio transport. |
| `mcp/cli.ts` | Command-line frontend over the same handlers. |
| `mcp/handlers.test.ts` | Direct tests for every handler. |
| `src/validate.ts` | Pure unit/weapon/encounter validators, shared. |
| `src/datagen.ts` | MODIFY: import validators from `src/validate.ts`. |
| `.mcp.json` | Project MCP registration for the server. |
| `Preview (CLI).cmd`, `Simulate.cmd` | Double-click wrappers over `cli.ts`. |
| `README.md` | MODIFY: an MCP and CLI section. |

## 6. Operations (tools and CLI commands)

Each is one handler, surfaced as both an MCP tool and a CLI command.

- `list(kind)`: ids for `units | weapons | classes | terrain | encounters | maps`.
  Reads the table file, or lists the `encounters/` or `maps/` directory.
- `get(kind, id)`: the JSON for one record, or the file contents for an encounter
  or map.
- `preview_encounter(id, seed?, runs?)`: load the encounter (duel or skirmish),
  resolve the two combatants, and return `buildDeterministic` plus `runMonteCarlo`
  results. Positions are ignored: this is the gridless "if they stand and fight"
  math. Defaults: seed 42, runs 1000.
- `simulate_skirmish(id, seed?)`: requires a grid encounter (one with a `map`).
  `loadGridEncounter` then `createGame(seed)`, then loop `takeAiTurn` for the
  active side and `endPhase` until `status` is not `ongoing` or a turn cap is hit.
  Returns `{ status, turns, log }`. Errors clearly if the encounter has no map.
- `set_unit(id, fields)`: merge `fields` into the unit record (create if absent),
  validate the merged unit, write `data/units.json` only if valid.
- `set_weapon(id, fields)`: same for `data/weapons.json`.
- `set_encounter(id, spec)`: write `encounters/<id>.json`. Validate first: a duel
  spec checks that referenced unit and weapon ids exist; a skirmish spec (one with
  a `map`) is validated by running it through `resolveGridEncounter` against the
  current data and map, which throws on any bad reference or out-of-bounds start.

Tools return their result as JSON text content. The CLI prints the same JSON, or a
human-readable summary for `preview` and `simulate`.

## 7. Validation

Writes never corrupt data. The handler constructs the proposed record or file in
memory, runs it through the shared pure validators (`src/validate.ts`) and, for
grid encounters, through `resolveGridEncounter` using the current on-disk data and
map. If validation throws, the handler returns an error result naming the problem
and does not write. Only on success does it write the file. This reuses the exact
checks the loaders already apply, so the MCP, the CLI, datagen, and the sim all
agree on what valid data is.

## 8. Registration and use

`.mcp.json` at the repo root:

```jsonc
{
  "mcpServers": {
    "fearchitect": {
      "command": "node",
      "args": ["--no-warnings", "mcp/server.ts"]
    }
  }
}
```

Claude Code reads this when run in the repo and prompts the owner to approve the
server once. The tools are then callable by Claude in that repo. The tools cannot
be called from the session that builds them: they become available to Claude
running in the repo after registration.

CLI use, no LLM required:

```
node mcp/cli.ts preview duel-01 --seed 42
node mcp/cli.ts simulate skirmish-01 --seed 5
node mcp/cli.ts set-unit eirika-t str=12 spd=16
node mcp/cli.ts set-weapon iron-sword might=6
node mcp/cli.ts get unit wyvern-1
node mcp/cli.ts list encounters
```

`Preview (CLI).cmd` and `Simulate.cmd` wrap the common commands for double-click use.

## 9. Testing

- Handlers are tested directly, no transport. `list` and `get` run against the
  real `data/` (read-only). `preview_encounter` and `simulate_skirmish` assert
  structure and determinism (same seed yields the same result), and that
  `preview_encounter` agrees with the Tier 1 numbers.
- `set_unit`, `set_weapon`, and `set_encounter` run against a temporary project
  directory seeded with fixture copies of the data, so tests never touch the real
  files. Each has a reject-invalid case and an accept-valid case, and confirms the
  file is unchanged after a rejected write.
- A test confirms `src/validate.ts` extraction did not change behavior: the Slice A
  and Slice B suites still pass.

## 10. Out of scope and deferred tracks

- `set_class`, `set_terrain`, `set_map`, and all ROM tools (`build`, `playtest`,
  `port_asset`).
- Pointing a local model at the server. Noted as a later experiment: the server is
  model agnostic, and because the CLI and handlers exist, a local-model bridge (a
  small agent loop against an Ollama or LM Studio endpoint) is a separate small
  project when wanted.
- Asset import (canon unit and weapon numbers, real maps, sprites and portraits,
  and battle animations). This is its own next track and is gated on installing
  the asset toolchain (FEBuilderGBA.CLI, and for animations the AAA pipeline plus
  the format spike the handoff flags as highest risk). Once the CLI exists, table
  and map import can be added as commands over the same handler layer.
