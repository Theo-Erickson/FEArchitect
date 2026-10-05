# FEArchitect Gallery Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the asset gallery explorable: an all-sections animation preview grid with labels (priority), class names on unit cards, and collapsible card/table views for classes and items.

**Architecture:** Almost all changes are in `gallery/client.ts` (the tab renderers), plus a new pure `gallery/format.ts` (section labels and an id tag) and one style rule in `gallery/index.html`. The gallery server and its `/anim` endpoint are unchanged. No new dependencies.

**Tech Stack:** TypeScript on Node 24 (no build, no deps), served by the existing gallery server which strips TS types for the browser. Node built-in test runner for the pure helper.

**Prose and code conventions:** No em dashes or en dashes anywhere. Use commas or colons. Comment new code well. Do NOT add Co-Authored-By or any attribution trailer to commits (project owner preference).

**Context (current `gallery/client.ts`):** exports nothing (a module run in the browser). It has module state `let game = ""; let tab = ...; const cache = {};`, and functions `boot`, `table(name)`, `esc(s)`, `render`, `portraitSrc(id)`, `unitCards(rows)`, `recordTable(rows)`, `renderAnims()`. `render()` dispatches by `tab` and, for non-anims tabs, does `const rows = await table(tab); ... view.innerHTML = tab === "units" ? unitCards(shown) : recordTable(shown)`. Each task below gives the complete replacement functions so the file stays coherent.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `gallery/format.ts` | Pure helpers: section labels, `sectionLabel(n)`, `idTag(id)`. |
| `gallery/format.test.ts` | Tests for the helpers. |
| `gallery/client.ts` | MODIFY: animations preview grid, class labels on units, card/table toggles for classes and items. |
| `gallery/index.html` | MODIFY: one style rule for animation section images. |

---

## Task 1: Pure format helpers

**Files:**
- Create: `gallery/format.ts`
- Test: `gallery/format.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `gallery/format.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTION_LABELS, sectionLabel, idTag } from "./format.ts";

test("SECTION_LABELS has 12 entries", () => {
  assert.equal(SECTION_LABELS.length, 12);
});

test("sectionLabel returns the label, or a fallback for out-of-range", () => {
  assert.equal(sectionLabel(0), "Melee attack");
  assert.equal(sectionLabel(6), "Dodge (armed)");
  assert.equal(sectionLabel(99), "Section 99");
});

test("idTag formats the id in brackets", () => {
  assert.equal(idTag(7), "[7]");
  assert.equal(idTag(0), "[0]");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test gallery/format.test.ts`
Expected: FAIL, `./format.ts` not found.

- [ ] **Step 3: Implement `gallery/format.ts`**

```ts
// Pure display helpers for the gallery client. Kept out of the DOM so they can be
// unit tested.

// Best-effort friendly names for the 12 battle-animation sections, by the GBAFE
// animation mode convention. The GIF itself is the ground truth; these are hints,
// and the trailing few are left generic.
export const SECTION_LABELS: string[] = [
  "Melee attack",
  "Melee attack (behind)",
  "Melee critical",
  "Melee critical (behind)",
  "Ranged attack",
  "Ranged critical",
  "Dodge (armed)",
  "Dodge (unarmed)",
  "Section 8",
  "Section 9",
  "Section 10",
  "Section 11",
];

export function sectionLabel(n: number): string {
  return SECTION_LABELS[n] ?? `Section ${n}`;
}

export function idTag(id: number): string {
  return `[${id}]`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test gallery/format.test.ts`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add gallery/format.ts gallery/format.test.ts
git commit -m "feat: gallery format helpers (section labels, id tag)"
```

---

## Task 2: Animations preview grid (priority)

**Files:**
- Modify: `gallery/client.ts`
- Modify: `gallery/index.html`

- [ ] **Step 1: Add the animation-section image style to `gallery/index.html`**

In the `<style>` block, add this rule right after the existing `.anim img { ... }` line:

```css
    .anim-sec { image-rendering: pixelated; max-width: 120px; height: auto; display: block; margin-top: 4px; background: #0001; }
```

- [ ] **Step 2: Add the format import and animation state to `gallery/client.ts`**

At the very top of `gallery/client.ts`, add the import (keep the existing `type Row` line below it):

```ts
import { SECTION_LABELS } from "./format.ts";
```

Then, next to the existing `let game = "";` and `let tab = ...;` state lines, add:

```ts
let currentAnimId = 0; // the animation id shown in the Animations tab
let animGen = 0;       // bumped each anim render so a stale progressive load stops
```

- [ ] **Step 3: Replace `renderAnims` in `gallery/client.ts`**

Replace the entire existing `renderAnims` function with:

```ts
// Animations tab: an id stepper plus a grid of the 12 sections, each a labeled GIF.
// The tiles load one at a time so only one CLI export runs at a time, and a stale
// load (the user stepped to another id) stops when animGen changes.
function renderAnims(): void {
  const id = currentAnimId;
  const gen = ++animGen;
  view.innerHTML = `
    <div class="anim">
      <button id="aprev">Prev</button>
      <label>Animation id <input id="aid" type="number" value="${id}" min="0" style="width:6rem"></label>
      <button id="anext">Next</button>
      <span class="note">First view of an id generates its GIFs, then they are cached.</span>
    </div>
    <div class="grid" id="secgrid">${SECTION_LABELS.map((lab, s) =>
      `<div class="card">
        <div><strong>${esc(lab)}</strong> <span class="note">#${s}</span></div>
        <img id="sec_${s}" class="anim-sec" alt="">
        <div class="note" id="secst_${s}">loading...</div>
      </div>`).join("")}</div>`;

  const setId = (v: number) => { currentAnimId = Math.max(0, v); renderAnims(); };
  ($("aprev") as HTMLButtonElement).addEventListener("click", () => setId(currentAnimId - 1));
  ($("anext") as HTMLButtonElement).addEventListener("click", () => setId(currentAnimId + 1));
  ($("aid") as HTMLInputElement).addEventListener("change", (e) => setId(Number((e.target as HTMLInputElement).value)));

  void loadSectionsProgressively(id, gen);
}

// Load the 12 section GIFs one after another, stopping if a newer render started.
async function loadSectionsProgressively(id: number, gen: number): Promise<void> {
  for (let s = 0; s < 12; s++) {
    if (gen !== animGen) return;
    const img = document.getElementById(`sec_${s}`) as HTMLImageElement | null;
    const status = document.getElementById(`secst_${s}`);
    if (!img || !status) return;
    await new Promise<void>((resolve) => {
      img.onload = () => { status.textContent = ""; resolve(); };
      img.onerror = () => { status.textContent = "none"; img.removeAttribute("src"); resolve(); };
      img.src = `/anim?game=${game}&id=${id}&section=${s}&_=${Date.now()}`;
    });
  }
}
```

- [ ] **Step 4: Verify component 1 in the browser**

Run: `node --no-warnings gallery/server.ts`
In the gallery, open the Animations tab. Confirm:
- There is an id input with Prev and Next buttons (no more section dropdown).
- The 12 section tiles appear, each labeled (Melee attack, Melee critical, Dodge, etc.), and the GIFs fill in one by one.
- Prev and Next step the id and reload the grid; empty sections show "none".
Stop the server by closing its window (or kill the listener on port 5174).

- [ ] **Step 5: Commit**

```bash
git add gallery/client.ts gallery/index.html
git commit -m "feat: animations tab all-sections preview grid with labels"
```

---

## Task 3: Class name on unit cards

**Files:**
- Modify: `gallery/client.ts`

- [ ] **Step 1: Import `idTag` and replace the units rendering**

Change the format import at the top of `gallery/client.ts` to also bring in `idTag`:

```ts
import { SECTION_LABELS, idTag } from "./format.ts";
```

Replace the entire `render` function with this version, which loads classes alongside
units and passes a class id to name map to `unitCards`:

```ts
async function render(): Promise<void> {
  if (!game) return;
  if (tab === "anims") return renderAnims();
  const rows = await table(tab);
  const q = search.value.trim().toLowerCase();
  const shown = q ? rows.filter((r) => String(r.name ?? "").toLowerCase().includes(q)) : rows;
  if (tab === "units") {
    const classes = await table("classes");
    const classMap: Record<number, string> = {};
    for (const c of classes) classMap[c.id] = c.name;
    view.innerHTML = unitCards(shown, classMap);
    return;
  }
  view.innerHTML = recordTable(shown);
}
```

Replace the entire `unitCards` function with:

```ts
function unitCards(rows: Row[], classMap: Record<number, string>): string {
  return `<div class="grid">` + rows.map((u) => {
    const cls = `${classMap[u.ClassID] ?? "class"} ${idTag(u.ClassID)}`;
    return `<div class="card">
      <img src="${portraitSrc(u.PortraitID ?? 0)}" alt="" onerror="this.style.visibility='hidden'">
      <div><strong>${esc(u.name)}</strong> <span class="note">#${u.id}</span></div>
      <div>${esc(cls)} lvl ${u.Level ?? "?"}</div>
      <div>HP ${u.BaseHP} Pow ${u.BasePow} Skl ${u.BaseSkl} Spd ${u.BaseSpd}</div>
      <div>Def ${u.BaseDef} Res ${u.BaseRes} Lck ${u.BaseLck} Con ${u.BaseCon}</div>
    </div>`;
  }).join("") + `</div>`;
}
```

- [ ] **Step 2: Verify in the browser**

Run: `node --no-warnings gallery/server.ts`
On the Units tab, confirm each card shows the class by name and id, for example a
Paladin unit shows `Paladin [7]` instead of `class 7`. Search still filters by name.
Stop the server.

- [ ] **Step 3: Commit**

```bash
git add gallery/client.ts
git commit -m "feat: show class name and id on unit cards"
```

---

## Task 4: Card/table toggle for classes and items

**Files:**
- Modify: `gallery/client.ts`

- [ ] **Step 1: Add per-tab view state**

Next to the other state lines near the top of `gallery/client.ts`, add:

```ts
const viewMode: Record<"classes" | "items", "cards" | "table"> = { classes: "cards", items: "cards" };
```

- [ ] **Step 2: Replace `render` to add the toggle for classes and items**

Replace the entire `render` function with this version (it keeps the units handling
from Task 3 and adds a Cards or Table toggle for classes and items):

```ts
async function render(): Promise<void> {
  if (!game) return;
  if (tab === "anims") return renderAnims();
  const rows = await table(tab);
  const q = search.value.trim().toLowerCase();
  const shown = q ? rows.filter((r) => String(r.name ?? "").toLowerCase().includes(q)) : rows;

  if (tab === "units") {
    const classes = await table("classes");
    const classMap: Record<number, string> = {};
    for (const c of classes) classMap[c.id] = c.name;
    view.innerHTML = unitCards(shown, classMap);
    return;
  }

  // classes and items: a Cards or Table toggle.
  const kind = tab as "classes" | "items";
  const mode = viewMode[kind];
  const body = mode === "table" ? recordTable(shown) : (kind === "classes" ? classCards(shown) : itemCards(shown));
  view.innerHTML = `<div class="bar" id="vtoggle">
      <button data-v="cards" class="${mode === "cards" ? "active" : ""}">Cards</button>
      <button data-v="table" class="${mode === "table" ? "active" : ""}">Table</button>
    </div>${body}`;
  for (const b of view.querySelectorAll<HTMLButtonElement>("#vtoggle button")) {
    b.addEventListener("click", () => { viewMode[kind] = b.dataset.v as "cards" | "table"; render(); });
  }
}
```

- [ ] **Step 3: Add `classCards` and `itemCards`**

Add these two functions to `gallery/client.ts` (next to `unitCards`):

```ts
function classCards(rows: Row[]): string {
  return `<div class="grid">` + rows.map((c) =>
    `<div class="card">
      <div><strong>${esc(c.name)}</strong> <span class="note">${idTag(c.id)}</span></div>
      <div>HP ${c.BaseHP} Pow ${c.BasePow} Skl ${c.BaseSkl} Spd ${c.BaseSpd}</div>
      <div>Def ${c.BaseDef} Res ${c.BaseRes} Mov ${c.BaseMov ?? "?"}</div>
    </div>`).join("") + `</div>`;
}

function itemCards(rows: Row[]): string {
  return `<div class="grid">` + rows.map((i) =>
    `<div class="card">
      <div><strong>${esc(i.name)}</strong> <span class="note">${idTag(i.id)}</span></div>
      <div>Mt ${i.Might} Hit ${i.Hit} Crit ${i.Crit}</div>
      <div>Wt ${i.Weight} Rank ${i.WeaponRank ?? "?"}</div>
    </div>`).join("") + `</div>`;
}
```

- [ ] **Step 4: Verify in the browser**

Run: `node --no-warnings gallery/server.ts`
On the Classes tab, confirm a Cards or Table toggle appears, Cards shows class
tiles with name, id, and stats, and Table shows the previous table. Same on the
Items tab (tiles show Mt/Hit/Crit/Wt/Rank). Search still filters both. Stop the server.

- [ ] **Step 5: Run the full suite and commit**

Run: `node --test`
Expected: PASS, the full suite including the new `gallery/format` tests and all
prior tests.

```bash
git add gallery/client.ts
git commit -m "feat: card and table toggle for classes and items"
```

---

## Self-review notes (for the implementer)

- Component 1 (the animations grid) is Task 2 and is verified before the rest, per
  the owner's priority.
- The class battle-animation GIF on class cards was deliberately left out: no
  reliable class to animation-id mapping was established, and the spec's degradation
  path is stats-only class cards. The Animations tab remains the way to view battle
  animations by id.
- `render` is rewritten twice (Task 3 then Task 4). Use the Task 4 version as the
  final one; it supersedes Task 3's.
- The client has no `import type`, so the server serves it fine after stripping (the
  gallery server strips TypeScript types for `.ts`).
