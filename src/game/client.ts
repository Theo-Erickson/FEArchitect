// Play view: renders the grid with sprites, drives the two-click move (preview
// path with slide animation, confirm on second click), runs the enemy phase and
// optional auto-play, and shows a seeded combat log. Game logic lives in the
// pure grid modules; this file is rendering and input only.
//
// Browser-safe: imports the PURE resolver (resolve.ts), never the Node loader
// (datagen.ts). Config comes in over fetch.

import { resolveGridEncounter } from "../grid/resolve.ts";
import {
  createGame, reachableFor, pathFor, applyMove, applyAttack, endPhase, status, takeAiTurn,
  type GameState,
} from "../grid/game.ts";
import { tileKey, type PathResult } from "../grid/movement.ts";
import { pathOffsetAt } from "../grid/anim.ts";
import { terrainSprite, unitSprite, TILE_COLORS } from "../grid/render.ts";
import { weaponRange, manhattan } from "../grid/range.ts";
import { decideAction } from "../grid/ai.ts";
import type { TileVec, MovementType, ClassDef } from "../grid/types.ts";

let TILE = 56; // 56 for showcase maps, smaller for the denser chapter maps
const MOVE_BY_TYPE: Record<MovementType, number> = { foot: 5, cav: 7, fly: 7 };

let g: GameState;
let encPath = "/encounters/skirmish-01.json"; // the selected encounter
let isChapter = false; // true when playing on a real FE8 chapter (PNG backdrop)
let chapterPng = ""; // URL of the chapter map image when isChapter
let origPlayerCls: ClassDef;
let preview: { to: TileVec; path: PathResult } | null = null;
let busy = false; // true while an animation runs

const boardEl = document.getElementById("board") as unknown as SVGSVGElement;

// Fetch and resolve the grid encounter entirely in the browser (no node:fs).
async function fetchGridEncounter(path: string) {
  const enc = await fetch(path).then((r) => r.json());
  // A "terrain": "fe8" encounter plays on a real chapter: authentic terrain defs
  // and the per-chapter terrain grid, with the chapter PNG as the board backdrop.
  const fe8 = enc.terrain === "fe8";
  const mapId = String(enc.map).replace(/^fe8-/, "");
  const terrainUrl = fe8 ? "/assets/reference/fe8/terrain.json" : "/data/terrain.json";
  const mapUrl = fe8 ? `/assets/reference/fe8/terrain/${mapId}.json` : `/maps/${enc.map}.json`;
  const [units, weapons, terrain, classes, map] = await Promise.all([
    fetch("/data/units.json").then((r) => r.json()),
    fetch("/data/weapons.json").then((r) => r.json()),
    fetch(terrainUrl).then((r) => r.json()),
    fetch("/data/classes.json").then((r) => r.json()),
    fetch(mapUrl).then((r) => r.json()),
  ]);
  isChapter = fe8;
  chapterPng = fe8 ? `/assets/reference/fe8/maps/${mapId}.png` : "";
  TILE = fe8 ? 32 : 56;
  return resolveGridEncounter(enc, units, weapons, terrain, classes, map);
}

async function boot(): Promise<void> {
  const enc = await fetchGridEncounter(encPath);
  g = createGame(enc, readSeed());
  origPlayerCls = g.player.cls;
  wire();
  render();
}

function readSeed(): number { return Number((document.getElementById("seed") as HTMLInputElement).value) || 1; }

// The movement-type selector swaps the player's class so both the highlight and
// actual movement use it, which is how you compare foot vs cavalry vs flying on
// the same terrain. "(unit default)" restores the original class.
function applyTypeSelector(): void {
  const v = (document.getElementById("mtype") as HTMLSelectElement).value as MovementType | "";
  g.player.cls = v ? { name: v, movementType: v, move: MOVE_BY_TYPE[v] } : origPlayerCls;
}

function render(): void {
  const w = g.enc.map.width * TILE, h = g.enc.map.height * TILE;
  boardEl.setAttribute("width", String(w));
  boardEl.setAttribute("height", String(h));
  boardEl.setAttribute("viewBox", `0 0 ${w} ${h}`); // lets CSS scale the board to fit
  const reach = g.phase === "player" && status(g) === "ongoing" ? reachableFor(g, g.player.id) : new Set<string>();

  let svg = "";
  if (isChapter) {
    // The chapter PNG is the terrain; draw it once, then only the reach highlights.
    svg += `<image href="${chapterPng}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" style="image-rendering:pixelated"/>`;
    for (let y = 0; y < g.enc.map.height; y++) {
      for (let x = 0; x < g.enc.map.width; x++) {
        if (reach.has(`${x},${y}`)) svg += `<rect x="${x * TILE}" y="${y * TILE}" width="${TILE}" height="${TILE}" fill="#2b6cff40" stroke="#2b6cffcc" stroke-width="1.5"/>`;
      }
    }
  } else {
    for (let y = 0; y < g.enc.map.height; y++) {
      for (let x = 0; x < g.enc.map.width; x++) {
        const id = g.enc.map.terrain[y][x], px = x * TILE, py = y * TILE;
        svg += `<rect x="${px}" y="${py}" width="${TILE}" height="${TILE}" fill="${TILE_COLORS[id] ?? "#ccc"}" stroke="#00000022"/>`;
        svg += terrainSprite(id, px, py, TILE, x, y);
        if (reach.has(`${x},${y}`)) svg += `<rect x="${px}" y="${py}" width="${TILE}" height="${TILE}" fill="#2b6cff40" stroke="#2b6cffcc" stroke-width="1.5"/>`;
      }
    }
  }
  // Preview path dots and, if the enemy is attackable from the previewed tile, a marker.
  if (preview) {
    for (const t of preview.path.path) svg += `<circle cx="${t.x * TILE + TILE / 2}" cy="${t.y * TILE + TILE / 2}" r="${TILE * 0.1}" fill="#fff" pointer-events="none"/>`;
    if (manhattan(preview.to, g.enemy.pos) <= weaponRange(g.player.weapon)) {
      svg += `<rect x="${g.enemy.pos.x * TILE}" y="${g.enemy.pos.y * TILE}" width="${TILE}" height="${TILE}" fill="none" stroke="#ffd23b" stroke-width="3" pointer-events="none"/>`;
    }
  }
  // Units at their actual positions. Preview slide is applied via a transform on
  // #pUnit after this render (see onBoardClick), so the token is drawn at actual.
  svg += `<g id="pUnit">${unitSprite(g.player.cls.movementType, g.player.pos.x * TILE + TILE / 2, g.player.pos.y * TILE + TILE / 2, TILE, g.player.hp, "#2b6cff")}</g>`;
  svg += `<g id="eUnit">${unitSprite(g.enemy.cls.movementType, g.enemy.pos.x * TILE + TILE / 2, g.enemy.pos.y * TILE + TILE / 2, TILE, g.enemy.hp, "#e0453b")}</g>`;
  boardEl.innerHTML = svg;

  // The player token is drawn at its actual tile; the slide animation moves it
  // to the previewed tile. Do not teleport it here (that caused an instant jump
  // before the slide).

  renderLog();
  const s = status(g);
  document.getElementById("status")!.textContent =
    s === "player-won" ? "You win" : s === "player-lost" ? "You lose" : `${g.phase} phase, turn ${g.turn}`;
}

function setOffset(gid: string, to: TileVec, from: TileVec): void {
  const el = document.getElementById(gid);
  if (el) el.setAttribute("transform", `translate(${(to.x - from.x) * TILE},${(to.y - from.y) * TILE})`);
}

function renderLog(): void {
  const el = document.getElementById("log")!;
  el.textContent = g.log.join("\n");
  el.scrollTop = el.scrollHeight;
}

function tileFromEvent(ev: MouseEvent): TileVec {
  // Map screen pixels to tiles using the board's actual rendered size, so clicks
  // stay correct when CSS scales the board down to fit (large chapter maps).
  const rect = boardEl.getBoundingClientRect();
  const sx = rect.width / g.enc.map.width, sy = rect.height / g.enc.map.height;
  return { x: Math.floor((ev.clientX - rect.left) / sx), y: Math.floor((ev.clientY - rect.top) / sy) };
}

function onBoardClick(ev: MouseEvent): void {
  if (busy || g.phase !== "player" || status(g) !== "ongoing") return;
  const t = tileFromEvent(ev);
  const key = tileKey(t);

  // Second click: confirm.
  if (preview) {
    const canAttack = manhattan(preview.to, g.enemy.pos) <= weaponRange(g.player.weapon);
    if (t.x === preview.to.x && t.y === preview.to.y) { commitMove(preview.to, null); return; }
    if (canAttack && t.x === g.enemy.pos.x && t.y === g.enemy.pos.y) { commitMove(preview.to, g.enemy.id); return; }
  }
  // First click (or re-pick): must be a reachable tile.
  if (reachableFor(g, g.player.id).has(key)) {
    const path = pathFor(g, g.player.id, t);
    if (path) {
      preview = { to: t, path };
      render();                       // draws dots/marker; token starts at actual
      busy = true;
      animateUnit("pUnit", path.path, g.player.pos, () => { busy = false; setOffset("pUnit", t, g.player.pos); });
    }
  } else {
    preview = null;
    render();
  }
}

function commitMove(to: TileVec, attackId: string | null): void {
  preview = null;
  applyMove(g, g.player.id, to);
  if (attackId) applyAttack(g, g.player.id, attackId);
  render();
  endPhase(g);
  runEnemyPhase();
}

function runEnemyPhase(): void {
  if (status(g) !== "ongoing") { render(); return; }
  busy = true;
  const before = { ...g.enemy.pos };
  const target = decideAction(g.enc, g.enemy.id).to;
  const finish = () => {
    takeAiTurn(g, g.enemy.id);
    endPhase(g);
    busy = false;
    render();
    if (autoOn() && status(g) === "ongoing") setTimeout(autoStep, 250);
  };
  if (target.x !== before.x || target.y !== before.y) {
    const path = pathFor(g, g.enemy.id, target);
    animateUnit("eUnit", path ? path.path : [before, target], before, finish);
  } else {
    finish();
  }
}

function autoOn(): boolean { return (document.getElementById("autoPlayer") as HTMLInputElement).checked; }

// One auto step for whichever side has the phase, then advance.
function autoStep(): void {
  if (status(g) !== "ongoing") { render(); return; }
  busy = true;
  const id = g.phase === "player" ? g.player.id : g.enemy.id;
  const unit = id === g.player.id ? g.player : g.enemy;
  const before = { ...unit.pos };
  const target = decideAction(g.enc, id).to;
  const gid = id === g.player.id ? "pUnit" : "eUnit";
  const done = () => {
    takeAiTurn(g, id);
    endPhase(g);
    busy = false;
    render();
    if (autoOn() && status(g) === "ongoing") setTimeout(autoStep, 250);
  };
  if (target.x !== before.x || target.y !== before.y) {
    const path = pathFor(g, id, target);
    animateUnit(gid, path ? path.path : [before, target], before, done);
  } else {
    done();
  }
}

// Slide a unit's token along the path, one tile per ~120ms, then call done.
// When the page is hidden, requestAnimationFrame is paused, so skip the visual
// slide and finish immediately: this keeps auto-play advancing in a background
// tab instead of stalling behind an animation that will never run.
function animateUnit(gid: string, path: TileVec[], from: TileVec, done: () => void): void {
  const el = document.getElementById(gid);
  if (!el || path.length < 2 || document.hidden) { done(); return; }
  const stepMs = 120;
  const start = performance.now();
  function frame(now: number): void {
    const el2 = document.getElementById(gid);
    if (!el2) { done(); return; }
    // pathOffsetAt clamps a possibly-negative elapsed, so it never indexes the
    // path out of bounds (which previously threw and stalled the whole game).
    const o = pathOffsetAt(path, from, now - start, stepMs, TILE);
    el2.setAttribute("transform", `translate(${o.x},${o.y})`);
    if (o.done) { done(); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function wire(): void {
  boardEl.addEventListener("click", onBoardClick);
  boardEl.addEventListener("contextmenu", (e) => { e.preventDefault(); preview = null; render(); });
  document.getElementById("endTurn")!.addEventListener("click", () => {
    if (!busy && g.phase === "player" && status(g) === "ongoing") { preview = null; endPhase(g); runEnemyPhase(); }
  });
  document.getElementById("reroll")!.addEventListener("click", () => {
    (document.getElementById("seed") as HTMLInputElement).value = String(Math.floor(Math.random() * 1_000_000));
    restart();
  });
  document.getElementById("seed")!.addEventListener("change", restart);
  document.getElementById("enc")!.addEventListener("change", (e) => {
    encPath = (e.target as HTMLSelectElement).value;
    restart();
  });
  document.getElementById("mtype")!.addEventListener("change", () => { preview = null; applyTypeSelector(); render(); });
  document.getElementById("autoPlayer")!.addEventListener("change", () => { if (autoOn() && !busy && status(g) === "ongoing") autoStep(); });
}

async function restart(): Promise<void> {
  const enc = await fetchGridEncounter(encPath);
  g = createGame(enc, readSeed());
  origPlayerCls = g.player.cls;
  applyTypeSelector();
  preview = null;
  render();
  if (autoOn()) autoStep();
}

await boot();
