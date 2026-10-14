// Scenario viewer: place authored units on a map, inspect their computed statblocks
// and skills, and forecast a matchup between any two. Static view (no turn play).
import { resolveScenario } from "../grid/resolve.ts";
import { computeMatchup } from "../combat.ts";
import { terrainMod } from "../grid/terrain.ts";
import { terrainSprite, unitSprite, TILE_COLORS } from "../grid/render.ts";
import type { ResolvedScenario, GridUnit } from "../grid/types.ts";
import type { Combatant } from "../types.ts";

const TILE = 48;
const board = document.getElementById("board") as unknown as SVGSVGElement;
const infoEl = document.getElementById("info")!;
const forecastEl = document.getElementById("forecast")!;

let sc: ResolvedScenario;
let selected: GridUnit | null = null; // first pick, acts as the attacker in a forecast

async function fetchJson(url: string, fallback?: any): Promise<any> {
  try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); }
  catch { return fallback; }
}

async function fetchScenario(path: string): Promise<ResolvedScenario> {
  const enc = await fetch(path).then((r) => r.json());
  const fe8 = enc.terrain === "fe8";
  const mapId = String(enc.map).replace(/^fe8-/, "");
  const [units, weapons, custom, fe8cls, skills, terrain] = await Promise.all([
    fetchJson("/data/units.json"),
    fetchJson("/data/weapons.json"),
    fetchJson("/data/classes.json"),
    fetchJson("/assets/reference/fe8/sim-classes.json", {}),
    fetchJson("/data/skills.json", {}),
    fetchJson(fe8 ? "/assets/reference/fe8/terrain.json" : "/data/terrain.json"),
  ]);
  const classes = { ...(fe8cls ?? {}), ...custom };
  const map = await fetchJson(fe8 ? `/assets/reference/fe8/terrain/${mapId}.json` : `/maps/${enc.map}.json`);
  return resolveScenario(enc, units, weapons, terrain, classes, map, skills ?? {});
}

function sideColor(side: string): string { return side === "enemy" ? "#e0453b" : "#2b6cff"; }

function render(): void {
  const w = sc.map.width * TILE, h = sc.map.height * TILE;
  board.setAttribute("width", String(w));
  board.setAttribute("height", String(h));
  board.setAttribute("viewBox", `0 0 ${w} ${h}`);
  let svg = "";
  for (let y = 0; y < sc.map.height; y++) {
    for (let x = 0; x < sc.map.width; x++) {
      const id = sc.map.terrain[y][x], px = x * TILE, py = y * TILE;
      svg += `<rect x="${px}" y="${py}" width="${TILE}" height="${TILE}" fill="${TILE_COLORS[id] ?? "#c9cfd6"}" stroke="#00000022"/>`;
      svg += terrainSprite(id, px, py, TILE, x, y);
    }
  }
  for (const u of sc.units) {
    const cx = u.pos.x * TILE + TILE / 2, cy = u.pos.y * TILE + TILE / 2;
    if (u === selected) svg += `<rect x="${u.pos.x * TILE}" y="${u.pos.y * TILE}" width="${TILE}" height="${TILE}" fill="none" stroke="#ffd23b" stroke-width="3"/>`;
    svg += unitSprite(u.cls.movementType, cx, cy, TILE, u.hp, sideColor(u.side));
  }
  board.innerHTML = svg;
}

function tileFromEvent(ev: MouseEvent): { x: number; y: number } {
  const rect = board.getBoundingClientRect();
  const sx = rect.width / sc.map.width, sy = rect.height / sc.map.height;
  return { x: Math.floor((ev.clientX - rect.left) / sx), y: Math.floor((ev.clientY - rect.top) / sy) };
}

function esc(s: unknown): string {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

function showInfo(u: GridUnit): void {
  const s = u.unit;
  const stats = [["HP", s.hp], ["Str", s.str], ["Mag", s.mag], ["Skl", s.skl], ["Spd", s.spd], ["Lck", s.lck], ["Def", s.def], ["Res", s.res], ["Con", s.con]];
  const skills = (u.skills ?? []).map((sk) => `<span class="skill">${esc(sk.name)}</span>`).join("") || `<span class="note">none</span>`;
  infoEl.innerHTML = `
    <h2>${esc(s.name)} <span class="note">(${esc(u.side)})</span></h2>
    <div class="note">${esc(u.cls.name)}${u.level ? ", level " + u.level : ""}, weapon ${esc(u.weapon.name)}</div>
    <div style="margin-top:0.4rem">${stats.map(([k, v]) => `<span class="stat">${k} ${v}</span>`).join("")}</div>
    <div style="margin-top:0.4rem"><strong>Skills:</strong> ${skills}</div>`;
}

function combatant(u: GridUnit): Combatant {
  return { id: u.id, unit: u.unit, weaponId: u.weapon.name, weapon: u.weapon, skills: u.skills };
}

function showForecast(atk: GridUnit, def: GridUnit): void {
  const defTerrainId = sc.map.terrain[def.pos.y][def.pos.x];
  const tmod = terrainMod(sc.terrainDefs, defTerrainId, def.cls.movementType);
  const m = computeMatchup(combatant(atk), combatant(def), tmod);
  const notes = (m.skillNotes ?? []).map((n) =>
    `<div class="note">${esc(n.skill)} ${n.rate}%${n.damage !== undefined ? `: ${n.damage} dmg` : ""}${n.note ? ": " + esc(n.note) : ""}</div>`).join("");
  forecastEl.hidden = false;
  forecastEl.innerHTML = `
    <h2>${esc(atk.unit.name)} vs ${esc(def.unit.name)}</h2>
    <div>Damage ${m.damage}${m.doubles ? " x2" : ""} &middot; Hit ${m.displayedHit}% (true ${m.trueHit}%) &middot; Crit ${m.displayedCrit}%</div>
    <div class="note">Defender on ${esc(sc.terrainDefs[defTerrainId]?.name ?? defTerrainId)}: +${tmod.def} def, +${tmod.avoid} avoid</div>
    ${notes ? `<div style="margin-top:0.35rem"><strong>Skills:</strong>${notes}</div>` : ""}`;
}

board.addEventListener("click", (ev) => {
  const t = tileFromEvent(ev);
  const u = sc.units.find((u) => u.pos.x === t.x && u.pos.y === t.y);
  if (!u) { selected = null; forecastEl.hidden = true; render(); return; }
  if (selected && selected !== u) {
    showForecast(selected, u);
    selected = null;
  } else {
    selected = u;
    showInfo(u);
    forecastEl.hidden = true;
  }
  render();
});

async function boot(): Promise<void> {
  const sel = document.getElementById("enc") as HTMLSelectElement;
  sel.addEventListener("change", async () => { sc = await fetchScenario(sel.value); selected = null; forecastEl.hidden = true; render(); });
  sc = await fetchScenario(sel.value);
  render();
}

boot();
