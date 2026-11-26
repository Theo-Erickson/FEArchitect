// Playable scenario: multiple units per side drawn as GBA map sprites (or portraits /
// class tokens). Select a unit, see its move range over terrain, move, and attack an
// enemy in range. End Turn runs the enemy AI. Inspection and the matchup forecast are
// shown in the side panel.
import { resolveScenario } from "../grid/resolve.ts";
import { computeMatchup } from "../combat.ts";
import { terrainMod } from "../grid/terrain.ts";
import { unitSprite, terrainLayer } from "../grid/render.ts";
import { loadTilesetIndex, pickSheet, tileBackdrop, type SheetInfo, type Backdrop } from "./tilebackdrop.ts";
import { weaponRange, manhattan } from "../grid/range.ts";
import { tileKey } from "../grid/movement.ts";
import {
  createMultiGame, reachableFor, canAttack, moveUnit, attack, endPhase, status, unitAt, unitById, type MultiGame,
} from "../grid/multigame.ts";
import { decideMultiAction } from "../grid/multiai.ts";
import { loadMapSprites, spriteUrl, frameCount, frameSize } from "./mapsprite-loader.ts";
import type { ResolvedScenario, GridUnit, TileVec } from "../grid/types.ts";
import type { Combatant } from "../types.ts";

const TILE = 48;
const board = document.getElementById("board") as unknown as SVGSVGElement;
const infoEl = document.getElementById("info")!;
const statusEl = document.getElementById("status")!;
const waitBtn = document.getElementById("wait") as HTMLButtonElement;

let scRaw: ResolvedScenario;
let g: MultiGame;
let sel: GridUnit | null = null; // selected player unit this phase
let moved = false;               // the selected unit has repositioned, now may attack or wait
let busy = false;                // true while the enemy AI runs
type SpriteMode = "map" | "portrait" | "class";
let spriteMode: SpriteMode = "map"; // map sprite, portrait face, or class token
// Map sprites are drawn at a uniform scale: one GBA tile (16px) fills one board tile.
const GBA_TILE = 16;
const SPRITE_SCALE = Math.max(1, Math.floor(TILE / GBA_TILE));
// GBA-like idle bob: frame sequence and how long each step holds (ms).
const IDLE_SEQ = [0, 1, 2, 1];
const IDLE_MS = [520, 70, 520, 70];
let idleStep = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let chapterPng = "";                    // FE8 chapter encounters: the ROM-rendered map image
let sheets: SheetInfo[] | null = null;  // indexed terrain tilesets, null when not installed
let tilesetName = "";                   // "" = placeholder SVG terrain
let backdrop: Backdrop | null = null;   // composed chips for the current map and sheet
let backdropToken = 0;                  // ignores stale backdrop loads
const tilesetSel = document.getElementById("tileset") as HTMLSelectElement;
const tilesetLabel = document.getElementById("tilesetlabel")!;

async function fetchJson(url: string, fallback?: any): Promise<any> {
  try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); }
  catch { return fallback; }
}

async function fetchScenario(path: string): Promise<{ sc: ResolvedScenario; png: string }> {
  const enc = await fetch(path).then((r) => r.json());
  const fe8 = enc.terrain === "fe8";
  const mapId = String(enc.map).replace(/^fe8-/, "");
  const png = fe8 ? `/assets/reference/fe8/maps/${mapId}.png` : "";
  const [units, weapons, custom, fe8cls, skills, terrain] = await Promise.all([
    fetchJson("/data/units.json"), fetchJson("/data/weapons.json"), fetchJson("/data/classes.json"),
    fetchJson("/assets/reference/fe8/sim-classes.json", {}), fetchJson("/data/skills.json", {}),
    fetchJson(fe8 ? "/assets/reference/fe8/terrain.json" : "/data/terrain.json"),
  ]);
  const classes = { ...(fe8cls ?? {}), ...custom };
  const map = await fetchJson(fe8 ? `/assets/reference/fe8/terrain/${mapId}.json` : `/maps/${enc.map}.json`);
  return { sc: resolveScenario(enc, units, weapons, terrain, classes, map, skills ?? {}), png };
}

function sideColor(side: string): string { return side === "enemy" ? "#e0453b" : "#2b6cff"; }
function esc(s: unknown): string { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)); }
function combatant(u: GridUnit): Combatant { return { id: u.id, unit: u.unit, weaponId: u.weapon.name, weapon: u.weapon, skills: u.skills }; }

// The unit's GBA map sprite at a uniform scale, centered on the tile horizontally and
// bottom-aligned, so larger (mounted/monster) sprites overflow upward and sideways as in
// GBAFE. Null when the class has no usable sprite, so the caller falls back.
function mapSpriteToken(u: GridUnit): string | null {
  const size = frameSize(u.classId);
  const n = frameCount(u.classId);
  if (!size || !n) return null;
  const acted = g.acted.has(u.id);
  const href = spriteUrl(u.classId, u.side, acted, IDLE_SEQ[idleStep] % n);
  if (!href) return null;
  const w = size.w * SPRITE_SCALE, h = size.h * SPRITE_SCALE;
  const x = u.pos.x * TILE + (TILE - w) / 2, y = (u.pos.y + 1) * TILE - h;
  const cx = u.pos.x * TILE + TILE / 2, by = (u.pos.y + 1) * TILE - 2;
  return `<g pointer-events="none"><image class="mapsprite" data-sprite="${esc(u.classId)}|${u.side}|${acted ? 1 : 0}" href="${href}" x="${x}" y="${y}" width="${w}" height="${h}"/>` +
    `<rect x="${cx - 11}" y="${by - 13}" width="22" height="13" rx="3" fill="#000b"/>` +
    `<text x="${cx}" y="${by - 3}" font-size="11" fill="#fff" text-anchor="middle" font-family="system-ui" font-weight="700">${u.hp}</text></g>`;
}

// Advance the idle animation by swapping hrefs in place; no full re-render.
function tickIdle(): void {
  idleStep = (idleStep + 1) % IDLE_SEQ.length;
  for (const img of board.querySelectorAll<SVGImageElement>("image.mapsprite")) {
    const [classId, side, acted] = img.dataset.sprite!.split("|");
    const n = frameCount(classId);
    if (!n) continue;
    const href = spriteUrl(classId, side as "player" | "enemy", acted === "1", IDLE_SEQ[idleStep] % n);
    if (href) img.setAttribute("href", href);
  }
  idleTimer = setTimeout(tickIdle, IDLE_MS[idleStep]);
}

function syncIdleTimer(): void {
  if (spriteMode === "map" && !idleTimer) idleTimer = setTimeout(tickIdle, IDLE_MS[idleStep]);
  if (spriteMode !== "map" && idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

function unitToken(u: GridUnit): string {
  const color = sideColor(u.side);
  const dim = g.acted.has(u.id) ? ` opacity="0.5"` : "";
  if (spriteMode === "map") {
    const token = mapSpriteToken(u);
    if (token) return token;
  }
  if (spriteMode === "portrait" && u.portrait != null) {
    const s = TILE - 6, x = u.pos.x * TILE + 3, y = u.pos.y * TILE + 2, cx = u.pos.x * TILE + TILE / 2;
    const clip = `clip_${u.id.replace(/[^a-z0-9]/gi, "")}`;
    const src = `/assets/reference/fe8/portraits/portrait_${String(u.portrait).padStart(3, "0")}.png`;
    return `<g${dim}><clipPath id="${clip}"><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="6"/></clipPath>` +
      `<image href="${src}" x="${x}" y="${y}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>` +
      `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="6" fill="none" stroke="${color}" stroke-width="3"/>` +
      `<rect x="${cx - 11}" y="${y + s - 13}" width="22" height="13" rx="3" fill="#000b"/>` +
      `<text x="${cx}" y="${y + s - 3}" font-size="11" fill="#fff" text-anchor="middle" font-family="system-ui" font-weight="700">${u.hp}</text></g>`;
  }
  return `<g${dim}>${unitSprite(u.cls.movementType, u.pos.x * TILE + TILE / 2, u.pos.y * TILE + TILE / 2, TILE, u.hp, color)}</g>`;
}

// A reachable tile from which `sel` can hit `enemy`, closest to sel's current tile, or null.
function tileToAttack(unit: GridUnit, enemy: GridUnit): TileVec | null {
  const reach = reachableFor(g, unit.id);
  let best: TileVec | null = null, bestCost = Infinity;
  for (const key of reach) {
    const [x, y] = key.split(",").map(Number);
    if (manhattan({ x, y }, enemy.pos) <= weaponRange(unit.weapon)) {
      const c = manhattan(unit.pos, { x, y });
      if (c < bestCost) { bestCost = c; best = { x, y }; }
    }
  }
  return best;
}

// Enemies the selected unit can hit: in range from its current tile (after moving) or
// via some reachable tile (before moving).
function targetsFor(unit: GridUnit): GridUnit[] {
  const foes = g.units.filter((u) => u.side === "enemy");
  if (moved) return foes.filter((f) => canAttack(g, unit.id, f.id));
  return foes.filter((f) => canAttack(g, unit.id, f.id) || tileToAttack(unit, f));
}

function render(): void {
  const w = g.map.width * TILE, h = g.map.height * TILE;
  board.setAttribute("width", String(w)); board.setAttribute("height", String(h)); board.setAttribute("viewBox", `0 0 ${w} ${h}`);
  let svg = "";
  // A chapter draws its ROM-rendered image over the placeholder, so a missing PNG
  // still leaves a readable board.
  svg += chapterPng
    ? terrainLayer(g.map.terrain, TILE, null) + `<image href="${chapterPng}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" style="image-rendering:pixelated" pointer-events="none"/>`
    : terrainLayer(g.map.terrain, TILE, backdrop);
  if (sel && !moved) {
    for (const key of reachableFor(g, sel.id)) {
      const [x, y] = key.split(",").map(Number);
      svg += `<rect x="${x * TILE}" y="${y * TILE}" width="${TILE}" height="${TILE}" fill="#2b6cff40" stroke="#2b6cffcc" stroke-width="1.5" pointer-events="none"/>`;
    }
  }
  if (sel) {
    for (const t of targetsFor(sel)) svg += `<rect x="${t.pos.x * TILE}" y="${t.pos.y * TILE}" width="${TILE}" height="${TILE}" fill="none" stroke="#ffd23b" stroke-width="3" pointer-events="none"/>`;
  }
  for (const u of [...g.units].sort((a, b) => a.pos.y - b.pos.y)) svg += unitToken(u);
  board.innerHTML = svg;
  waitBtn.hidden = !(sel && g.phase === "player" && status(g) === "ongoing");
}

function updateStatus(): void {
  const st = status(g);
  statusEl.textContent = st === "player-won" ? "Victory: all enemies routed" : st === "player-lost" ? "Defeat: all your units fell" : `${g.phase} phase, turn ${g.turn}`;
}

function statblockHtml(u: GridUnit): string {
  const s = u.unit;
  const stats = [["HP", u.hp + "/" + s.hp], ["Str", s.str], ["Mag", s.mag], ["Skl", s.skl], ["Spd", s.spd], ["Lck", s.lck], ["Def", s.def], ["Res", s.res]];
  const skills = (u.skills ?? []).map((sk) => `<span class="skill">${esc(sk.name)}</span>`).join("") || `<span class="note">none</span>`;
  return `<h2>${esc(s.name)} <span class="note">(${esc(u.side)})</span></h2>
    <div class="note">${esc(u.cls.name)}${u.level ? ", level " + u.level : ""}, ${esc(u.weapon.name)}</div>
    <div style="margin-top:0.35rem">${stats.map(([k, v]) => `<span class="stat">${k} ${v}</span>`).join("")}</div>
    <div style="margin-top:0.35rem"><strong>Skills:</strong> ${skills}</div>`;
}

function showInfo(u: GridUnit): void {
  infoEl.innerHTML = statblockHtml(u);
}

// The selected player unit's panel: statblock plus a clickable forecast per target.
function showSelected(): void {
  if (!sel) return;
  let html = statblockHtml(sel);
  const targets = targetsFor(sel);
  if (targets.length) {
    html += `<div style="margin-top:0.4rem"><strong>Attack:</strong></div>`;
    for (const t of targets) {
      const m = computeMatchup(combatant(sel), combatant(t), terrainMod(g.terrainDefs, g.map.terrain[t.pos.y][t.pos.x], t.cls.movementType));
      const notes = (m.skillNotes ?? []).map((n) => `${esc(n.skill)} ${n.rate}%`).join(", ");
      html += `<div class="target" data-target="${esc(t.id)}">vs ${esc(t.unit.name)}: ${m.damage}${m.doubles ? "x2" : ""} dmg, ${m.displayedHit}% hit${notes ? " [" + notes + "]" : ""}</div>`;
    }
  } else if (!moved) {
    html += `<div class="note" style="margin-top:0.35rem">Click a highlighted tile to move, or Wait.</div>`;
  }
  infoEl.innerHTML = html;
  for (const el of infoEl.querySelectorAll<HTMLElement>(".target")) {
    el.addEventListener("click", () => doAttack(unitById(g, el.dataset.target!)!));
  }
}

function clearSel(): void { sel = null; moved = false; }

function doAttack(enemy: GridUnit): void {
  if (!sel) return;
  if (!canAttack(g, sel.id, enemy.id)) {
    const dest = tileToAttack(sel, enemy);
    if (!dest) return;
    moveUnit(g, sel.id, dest);
  }
  attack(g, sel.id, enemy.id);
  g.acted.add(sel.id);
  clearSel();
  render(); updateStatus();
  infoEl.innerHTML = `<span class="note">${g.log.slice(-2).map(esc).join("<br>")}</span>`;
}

function finalizeWait(): void {
  if (!sel) return;
  g.acted.add(sel.id);
  clearSel();
  render(); updateStatus();
}

function tileFromEvent(ev: MouseEvent): TileVec {
  const rect = board.getBoundingClientRect();
  const sx = rect.width / g.map.width, sy = rect.height / g.map.height;
  return { x: Math.floor((ev.clientX - rect.left) / sx), y: Math.floor((ev.clientY - rect.top) / sy) };
}

board.addEventListener("click", (ev) => {
  if (busy) return;
  const t = tileFromEvent(ev);
  const u = unitAt(g, t.x, t.y);
  if (status(g) !== "ongoing" || g.phase !== "player") { if (u) showInfo(u); return; }

  if (!sel) {
    if (u && u.side === "player" && !g.acted.has(u.id)) { sel = u; moved = false; render(); showSelected(); }
    else if (u) showInfo(u);
    return;
  }
  // a unit is selected
  if (u && u.side === "enemy" && targetsFor(sel).some((f) => f.id === u.id)) { doAttack(u); return; }
  if (!moved && !u && reachableFor(g, sel.id).has(tileKey(t))) {
    moveUnit(g, sel.id, t); moved = true; render(); showSelected(); return;
  }
  if (u === sel) { finalizeWait(); return; }
  if (!moved) { clearSel(); render(); } // deselect before moving
});

waitBtn.addEventListener("click", finalizeWait);

async function runEnemyPhase(): Promise<void> {
  busy = true;
  endPhase(g); updateStatus(); render();
  const ids = g.units.filter((u) => u.side === "enemy").map((u) => u.id);
  for (const id of ids) {
    if (status(g) !== "ongoing") break;
    const u = unitById(g, id);
    if (!u || g.acted.has(id)) continue;
    const a = decideMultiAction(g, id);
    try { if (a.attackTargetId) { moveUnit(g, id, a.to); attack(g, id, a.attackTargetId); g.acted.add(id); } else { moveUnit(g, id, a.to); g.acted.add(id); } }
    catch { g.acted.add(id); }
    render(); updateStatus();
    await new Promise((r) => setTimeout(r, 450));
  }
  if (status(g) === "ongoing") endPhase(g);
  busy = false;
  updateStatus(); render();
}

document.getElementById("endturn")!.addEventListener("click", () => {
  if (busy || g.phase !== "player" || status(g) !== "ongoing") return;
  clearSel();
  void runEnemyPhase();
});

// Show the Tileset picker for custom maps when tilesets are installed, and select the
// map's own sheet (or the default).
function syncTilesetControl(): void {
  const show = !!sheets && !chapterPng;
  tilesetLabel.hidden = !show;
  if (!show) { tilesetName = ""; return; }
  tilesetName = pickSheet(sheets!, scRaw.map.tileset)?.name ?? "";
  tilesetSel.value = tilesetName;
}

async function refreshBackdrop(): Promise<void> {
  const token = ++backdropToken;
  backdrop = null; render(); // drop the previous map/sheet backdrop at once
  const info = sheets && !chapterPng && tilesetName ? sheets.find((s) => s.name === tilesetName) : undefined;
  if (!info) return;
  const b = await tileBackdrop(scRaw.map, scRaw.terrainDefs, info);
  if (token !== backdropToken) return; // a newer map or sheet was chosen meanwhile
  backdrop = b;
  render();
}

function start(): void {
  g = createMultiGame(scRaw, 1);
  clearSel(); busy = false;
  render(); updateStatus();
  infoEl.innerHTML = `<span class="note">Click a unit to inspect. Click your unit to move and attack.</span>`;
}

document.getElementById("restart")!.addEventListener("click", start);

document.getElementById("spritemode")!.addEventListener("change", (e) => {
  spriteMode = (e.target as HTMLSelectElement).value as SpriteMode;
  syncIdleTimer();
  render();
});

async function boot(): Promise<void> {
  const sel2 = document.getElementById("enc") as HTMLSelectElement;
  let encToken = 0; // ignores a slower earlier load when the scenario is switched quickly
  sel2.addEventListener("change", async () => {
    const tok = ++encToken;
    const r = await fetchScenario(sel2.value);
    if (tok !== encToken) return;
    scRaw = r.sc; chapterPng = r.png;
    syncTilesetControl(); start(); void refreshBackdrop();
  });
  const [first] = await Promise.all([fetchScenario(sel2.value), loadMapSprites()]);
  ({ sc: scRaw, png: chapterPng } = first);
  sheets = await loadTilesetIndex();
  if (sheets) {
    tilesetSel.innerHTML = `<option value="">Placeholder (SVG)</option>` +
      sheets.map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");
  }
  syncTilesetControl();
  start();
  syncIdleTimer();
  void refreshBackdrop();
}

tilesetSel.addEventListener("change", () => { tilesetName = tilesetSel.value; void refreshBackdrop(); });

boot();
