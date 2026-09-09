// Browser client: fetch the config, build editable forms, run the same combat
// engine in the page, render results, and save edits back through the server.
// The engine modules are shared with Node, served as JavaScript by the server.

import type { DataBundle, UnitDef, WeaponDef, PreviewResult, Matchup } from "../types.ts";
import { buildDeterministic, runMonteCarlo } from "../combat.ts";
import { unitFields, applyUnitField } from "./formmodel.ts";

interface State {
  weapons: Record<string, WeaponDef>;
  units: Record<string, UnitDef>;
  encounter: DataBundle["encounter"];
  // Live, possibly edited copies:
  playerUnit: UnitDef; playerWeapon: string;
  enemyUnit: UnitDef; enemyWeapon: string;
}

let state: State;

async function boot(): Promise<void> {
  const [weapons, units, encounter] = await Promise.all([
    fetch("/data/weapons.json").then((r) => r.json()),
    fetch("/data/units.json").then((r) => r.json()),
    fetch("/encounters/duel-01.json").then((r) => r.json()),
  ]);
  state = {
    weapons, units, encounter,
    playerUnit: structuredClone(units[encounter.player.unit]),
    playerWeapon: encounter.player.weapon,
    enemyUnit: structuredClone(units[encounter.enemy.unit]),
    enemyWeapon: encounter.enemy.weapon,
  };
  renderForms();
  wireControls();
  recompute();
}

function combatant(id: string, unit: UnitDef, weaponId: string) {
  return { id, unit, weaponId, weapon: state.weapons[weaponId] };
}

function renderForms(): void {
  renderSide("playerForm", "Player", state.playerUnit, state.playerWeapon, (u) => (state.playerUnit = u), (w) => (state.playerWeapon = w));
  renderSide("enemyForm", "Enemy", state.enemyUnit, state.enemyWeapon, (u) => (state.enemyUnit = u), (w) => (state.enemyWeapon = w));
}

function renderSide(
  elId: string, label: string, unit: UnitDef, weaponId: string,
  setUnit: (u: UnitDef) => void, setWeapon: (w: string) => void,
): void {
  const host = document.getElementById(elId)!;
  host.innerHTML = `<strong>${label}: ${unit.name}</strong>`;
  const grid = document.createElement("div");
  grid.className = "grid";
  for (const field of unitFields()) {
    const lab = document.createElement("label");
    lab.textContent = field;
    const input = document.createElement("input");
    input.type = "number";
    input.value = String((unit as any)[field]);
    input.addEventListener("input", () => {
      setUnit(applyUnitField(unit, field, Number(input.value)));
      recompute();
    });
    lab.appendChild(input);
    grid.appendChild(lab);
  }
  host.appendChild(grid);

  const wlab = document.createElement("label");
  wlab.textContent = "weapon";
  const select = document.createElement("select");
  for (const [id, w] of Object.entries(state.weapons)) {
    const opt = document.createElement("option");
    opt.value = id; opt.textContent = w.name;
    if (id === weaponId) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => { setWeapon(select.value); recompute(); });
  wlab.appendChild(select);
  host.appendChild(wlab);
}

function currentSides() {
  const player = combatant("player", state.playerUnit, state.playerWeapon);
  const enemy = combatant("enemy", state.enemyUnit, state.enemyWeapon);
  const initiator = (document.getElementById("initiator") as HTMLSelectElement).value;
  return initiator === "enemy"
    ? { first: enemy, second: player, firstLabel: enemy.unit.name, secondLabel: player.unit.name }
    : { first: player, second: enemy, firstLabel: player.unit.name, secondLabel: enemy.unit.name };
}

function matchupHtml(atkName: string, defName: string, m: Matchup): string {
  const kill = m.roundsToKill === null ? "cannot kill" : `${m.hitsToKill} hits / ${m.roundsToKill} rounds`;
  return `<p><strong>${atkName} vs ${defName}</strong><br>
    damage ${m.damage}${m.doubles ? " (doubles)" : ""},
    hit ${m.displayedHit}% (true ${m.trueHit}%),
    crit ${m.displayedCrit}%, ${kill}</p>`;
}

function recompute(): void {
  const { first, second, firstLabel, secondLabel } = currentSides();
  const det = buildDeterministic(first, second);
  document.getElementById("deterministic")!.innerHTML =
    `<h3>Deterministic</h3>` +
    matchupHtml(firstLabel, secondLabel, det.playerVsEnemy) +
    matchupHtml(secondLabel, firstLabel, det.enemyVsPlayer);

  const seed = Number((document.getElementById("seed") as HTMLInputElement).value);
  const runs = Number((document.getElementById("runs") as HTMLInputElement).value);
  const mc = runMonteCarlo(first, second, { seed, runs });
  renderMonteCarlo(firstLabel, secondLabel, mc);
}

function renderMonteCarlo(firstLabel: string, secondLabel: string, mc: PreviewResult["monteCarlo"]): void {
  const host = document.getElementById("montecarlo")!;
  const maxBar = Math.max(1, ...mc.deathRoundHistogram);
  const bars = mc.deathRoundHistogram
    .map((count, round) => count === 0 ? "" :
      `<div title="round ${round}: ${count}"><div class="bar" style="width:${(count / maxBar) * 100}%"></div></div>`)
    .join("");
  host.innerHTML = `<h3>Monte Carlo (${mc.runs} duels, seed ${mc.seed})</h3>
    <p>${firstLabel} win ${mc.playerWinRate}% &middot; ${secondLabel} win ${mc.enemyWinRate}% &middot;
       stalemates ${mc.stalemates} &middot; avg rounds ${mc.averageRounds}</p>
    <div class="bars">${bars}</div>`;
}

function wireControls(): void {
  document.getElementById("initiator")!.addEventListener("change", recompute);
  document.getElementById("seed")!.addEventListener("input", recompute);
  document.getElementById("runs")!.addEventListener("input", recompute);
  document.getElementById("reroll")!.addEventListener("click", () => {
    (document.getElementById("seed") as HTMLInputElement).value = String(Math.floor(Math.random() * 1_000_000));
    recompute();
  });
  document.getElementById("save")!.addEventListener("click", save);
}

async function save(): Promise<void> {
  const status = document.getElementById("saveStatus")!;
  // Write the edited unit stats back into the units table under their ids.
  const units = structuredClone(state.units);
  units[state.encounter.player.unit] = state.playerUnit;
  units[state.encounter.enemy.unit] = state.enemyUnit;
  const encounter = structuredClone(state.encounter);
  encounter.player.weapon = state.playerWeapon;
  encounter.enemy.weapon = state.enemyWeapon;

  const r1 = await fetch("/save", { method: "POST", body: JSON.stringify({ path: "data/units.json", content: units }) });
  const r2 = await fetch("/save", { method: "POST", body: JSON.stringify({ path: `encounters/${encounter.id}.json`, content: encounter }) });
  if (r1.ok && r2.ok) {
    state.units = units; state.encounter = encounter;
    status.textContent = "saved";
    status.className = "saved";
  } else {
    status.textContent = "save failed";
    status.className = "";
  }
}

boot();
