// Playable scenario: multiple units per side drawn as portraits. Select a unit, see
// its move range over terrain, move, and attack an enemy in range. End Turn runs the
// enemy AI. Inspection and the matchup forecast are shown in the side panel.
import { resolveScenario } from "../grid/resolve.ts";
import { computeMatchup } from "../combat.ts";
import { terrainMod } from "../grid/terrain.ts";
import { terrainSprite, unitSprite, TILE_COLORS } from "../grid/render.ts";
import { weaponRange, manhattan } from "../grid/range.ts";
import { tileKey } from "../grid/movement.ts";
import {
  createMultiGame, reachableFor, canAttack, moveUnit, attack, endPhase, status, unitAt, unitById, type MultiGame,
} from "../grid/multigame.ts";
import { decideMultiAction } from "../grid/multiai.ts";
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
let spriteMode: "portrait" | "class" = "portrait"; // toggle: portrait face vs class token

async function fetchJson(url: string, fallback?: any): Promise<any> {
  try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); }
  catch { return fallback; }
}

async function fetchScenario(path: string): Promise<ResolvedScenario> {
  const enc = await fetch(path).then((r) => r.json());
  const fe8 = enc.terrain === "fe8";
  const mapId = String(enc.map).replace(/^fe8-/, "");
  const [units, weapons, custom, fe8cls, skills, terrain] = await Promise.all([
    fetchJson("/data/units.json"), fetchJson("/data/weapons.json"), fetchJson("/data/classes.json"),
    fetchJson("/assets/reference/fe8/sim-classes.json", {}), fetchJson("/data/skills.json", {}),
    fetchJson(fe8 ? "/assets/reference/fe8/terrain.json" : "/data/terrain.json"),
  ]);
  const classes = { ...(fe8cls ?? {}), ...custom };
  const map = await fetchJson(fe8 ? `/assets/reference/fe8/terrain/${mapId}.json` : `/maps/${enc.map}.json`);
  return resolveScenario(enc, units, weapons, terrain, classes, map, skills ?? {});
}

function sideColor(side: string): string { return side === "enemy" ? "#e0453b" : "#2b6cff"; }
function esc(s: unknown): string { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)); }
function combatant(u: GridUnit): Combatant { return { id: u.id, unit: u.unit, weaponId: u.weapon.name, weapon: u.weapon, skills: u.skills }; }

function unitToken(u: GridUnit): string {
  const color = sideColor(u.side);
  const dim = g.acted.has(u.id) ? ` opacity="0.5"` : "";
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
  for (let y = 0; y < g.map.height; y++) {
    for (let x = 0; x < g.map.width; x++) {
      const id = g.map.terrain[y][x], px = x * TILE, py = y * TILE;
      svg += `<rect x="${px}" y="${py}" width="${TILE}" height="${TILE}" fill="${TILE_COLORS[id] ?? "#c9cfd6"}" stroke="#00000022"/>`;
      svg += terrainSprite(id, px, py, TILE, x, y);
    }
  }
  if (sel && !moved) {
    for (const key of reachableFor(g, sel.id)) {
      const [x, y] = key.split(",").map(Number);
      svg += `<rect x="${x * TILE}" y="${y * TILE}" width="${TILE}" height="${TILE}" fill="#2b6cff40" stroke="#2b6cffcc" stroke-width="1.5" pointer-events="none"/>`;
    }
  }
  if (sel) {
    for (const t of targetsFor(sel)) svg += `<rect x="${t.pos.x * TILE}" y="${t.pos.y * TILE}" width="${TILE}" height="${TILE}" fill="none" stroke="#ffd23b" stroke-width="3" pointer-events="none"/>`;
  }
  for (const u of g.units) svg += unitToken(u);
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

function start(): void {
  g = createMultiGame(scRaw, 1);
  clearSel(); busy = false;
  render(); updateStatus();
  infoEl.innerHTML = `<span class="note">Click a unit to inspect. Click your unit to move and attack.</span>`;
}

document.getElementById("restart")!.addEventListener("click", start);

document.getElementById("spritemode")!.addEventListener("change", (e) => {
  spriteMode = (e.target as HTMLInputElement).checked ? "class" : "portrait";
  render();
});

async function boot(): Promise<void> {
  const sel2 = document.getElementById("enc") as HTMLSelectElement;
  sel2.addEventListener("change", async () => { scRaw = await fetchScenario(sel2.value); start(); });
  scRaw = await fetchScenario(sel2.value);
  start();
}

boot();
