# FEArchitect Gallery Enhancements

Date: 2026-10-04
Status: Approved for planning
Author: Claude (Opus 4.8) with Theo (Technical Game Designer)

## Prose and code conventions

No em dashes or en dashes anywhere in this document or in code and comments.
Use colons or commas instead. Do not add Co-Authored-By or any attribution
trailer to commits (project owner preference).

## 1. Purpose

Make the FE asset gallery easier to explore. The battle-animation browser is blind
(a number id plus a numeric section dropdown), and unit cards show a bare class
number. This adds animation previews, human labels, class names, and a richer,
collapsible card view for classes and items. Work is ordered with the animations
grid first, as the owner's priority.

## 2. Toolchain feasibility (decided during brainstorming)

The CLI exports portraits and battle-animation GIFs only. It has no command to
export class icons, overworld map sprites, or item icons (raw graphics export
needs a hardcoded, version-specific ROM address per image, which is out of scope).
So:

- Class icons, class map sprites, and item icons are NOT included.
- A class's battle sprite is only available as its battle-animation GIF, and only
  if a class can be mapped to its animation id. Classes store a `BattleAnimePointer`
  (a ROM address), not a clean id, so this mapping is attempted during
  implementation and used only if it resolves reliably. If it does not, class cards
  show stats only, with no fabricated sprite.

## 3. Success criteria

Ordered by priority. Component 1 is built first.

1. **Animations tab preview grid.** The Animations tab has an animation id input
   with Prev and Next buttons. Selecting an id renders a grid of the 12 sections,
   each tile showing a human label and the section's GIF. Tiles load one at a time
   (progressively), using the existing `/anim?game&id&section` endpoint. A section
   that fails or is empty shows "none" rather than a broken image. The seed-blind
   section dropdown is gone.
2. **Units class label.** Each unit card shows `ClassName [id]` (for example
   `Paladin [7]`), resolved by joining the unit's `ClassID` to the game's
   `classes.json`. If a class id has no name, it shows `class [id]`.
3. **Classes tab card view.** The Classes tab has a Cards or Table toggle. Table is
   the current record table. Cards show each class's `name [id]` and key stats, plus
   its battle-animation GIF when the class to animation id mapping resolves,
   otherwise stats only.
4. **Items tab card view.** The Items tab has the same Cards or Table toggle. Cards
   show each item's `name [id]` and weapon stats (might, hit, crit, weight, rank,
   range). No icon.
5. The existing sim, editor, MCP, and gallery tests still pass. No new dependency.

## 4. Components

### Component 1: Animations preview grid (priority)

`renderAnims` in `gallery/client.ts` is rewritten:

- Controls: a numeric id input (default 0), Prev and Next buttons that decrement or
  increment the id (clamped at 0) and re-render, and a small caption that the first
  view of an id generates its GIFs and later views are instant.
- A grid of 12 tiles, one per section 0 to 11. Each tile has the section label (see
  section 5) and an `img`. The tiles are filled progressively: request section 0,
  wait for it to load or fail, then section 1, and so on, so only one CLI export
  runs at a time. A tile whose `img` errors shows the label plus "none".
- Each `img` src is `/anim?game=<game>&id=<id>&section=<n>&_=<cachebuster>`.

### Component 2: Units class label

The units renderer builds an id to name map from the game's `classes.json` (fetched
and cached like the other tables) and shows `ClassName [id]` on each card using the
`entityLabel` helper (section 6). The existing portrait and stat lines are kept.

### Component 3: Classes card view

The Classes tab gains a Cards or Table toggle (a small control above the view).
Table reuses the current `recordTable`. Cards render each class as a tile with
`name [id]`, key stats (HP, Pow, Skl, Spd, Def, Res, Mov), and, when the class to
animation id mapping resolves, the battle-animation GIF (section 0) lazily loaded;
otherwise no sprite.

### Component 4: Items card view

The Items tab gains the same Cards or Table toggle. Cards render each item as a tile
with `name [id]` and weapon stats: might, hit, crit, weight, rank, and the raw range
fields present in the data. No icon.

## 5. Section labels

Best-effort friendly names for sections 0 to 11, based on the GBAFE animation mode
convention. The GIF itself is the ground truth; the label is a hint:

```
0  Melee attack
1  Melee attack (behind)
2  Melee critical
3  Melee critical (behind)
4  Ranged attack
5  Ranged critical
6  Dodge (armed)
7  Dodge (unarmed)
8  Section 8
9  Section 9
10 Section 10
11 Section 11
```

These live in `gallery/format.ts` as a constant, so they are easy to refine later
without touching the client logic.

## 6. Pure helpers and the class to animation mapping

A small pure module `gallery/format.ts` holds the testable logic:

- `SECTION_LABELS: string[]` and `sectionLabel(n): string` (falls back to
  `Section n` for an out-of-range index).
- `idTag(id: number): string` returns `[id]`, for example `idTag(7)` is `[7]`.
  Callers compose labels like `${className} ${idTag(id)}` (so a unit shows
  `Paladin [7]`, or `class [7]` when the class name is unknown).

The class to animation id mapping is investigated in the plan: the candidate is to
derive an index from the class `BattleAnimePointer`, or to test whether the CLI
accepts a per-class animation reference. If no reliable mapping is found, Component
3 omits the GIF (stats only) and the plan records that finding. The mapping does not
block Components 1, 2, or 4.

## 7. Architecture

Almost all changes are in `gallery/client.ts` (the four tab renderers plus a view
toggle for classes and items), plus the new pure `gallery/format.ts`. The gallery
server and its `/anim` endpoint are unchanged. No npm dependency is added. Node 24
runs the TypeScript directly.

## 8. Testing

- `gallery/format.ts` is unit tested with the Node runner: `sectionLabel` returns
  the right label and falls back for out-of-range indices, and `idSuffix` formats
  `[id]`.
- The client UI (the grids, toggles, progressive loading) is browser-verified by
  running the gallery and eyeballing each tab, the same way the gallery was
  verified originally.
- The full existing suite still passes.

## 9. Out of scope

- Class icons, class map sprites, and item icons (no CLI export path; raw graphics
  extraction from hardcoded ROM addresses is a separate large track).
- Any change to the import runner, the server, the sim, the editor, or the MCP.
- Mapping canon entries into the sim data model, and unified-ROM asset porting
  (still their own future tracks).
