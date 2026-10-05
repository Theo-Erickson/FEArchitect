// Gallery browser client: pick a game, browse Units/Classes/Items as tables or
// cards, and play battle animations (fetched lazily from the server).
import { SECTION_LABELS, idTag } from "./format.ts";
type Row = Record<string, any>;

let game = "";
let tab: "units" | "classes" | "items" | "anims" = "units";
const cache: Record<string, Row[]> = {}; // key `${game}/${table}`
let currentAnimId = 0; // the animation id shown in the Animations tab
let animGen = 0;       // bumped each anim render so a stale progressive load stops

const $ = (id: string) => document.getElementById(id)!;
const view = $("view");
const search = $("search") as HTMLInputElement;

async function boot(): Promise<void> {
  const games: string[] = await fetch("/games").then((r) => r.json());
  const sel = $("game") as HTMLSelectElement;
  if (games.length === 0) { $("empty").hidden = false; return; }
  for (const g of games) { const o = document.createElement("option"); o.value = g; o.textContent = g.toUpperCase(); sel.appendChild(o); }
  game = games[0];
  sel.addEventListener("change", () => { game = sel.value; render(); });
  for (const b of document.querySelectorAll<HTMLButtonElement>("#tabs button")) {
    b.addEventListener("click", () => {
      tab = b.dataset.tab as typeof tab;
      for (const x of document.querySelectorAll("#tabs button")) x.classList.toggle("active", x === b);
      render();
    });
  }
  search.addEventListener("input", render);
  render();
}

async function table(name: string): Promise<Row[]> {
  const key = `${game}/${name}`;
  if (!cache[key]) cache[key] = await fetch(`/assets/reference/${game}/${name}.json`).then((r) => r.json());
  return cache[key];
}

function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

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

function portraitSrc(id: number): string {
  return `/assets/reference/${game}/portraits/portrait_${String(id).padStart(3, "0")}.png`;
}

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

// A generic table of the most useful columns for classes/items, name first.
function recordTable(rows: Row[]): string {
  if (rows.length === 0) return `<p class="note">nothing to show</p>`;
  const skip = new Set(["name"]);
  const cols = Object.keys(rows[0]).filter((k) => k !== "id" && !skip.has(k) && !k.endsWith("Pointer") && !k.endsWith("TextID")).slice(0, 12);
  const head = `<tr><th>name</th><th>id</th>` + cols.map((c) => `<th>${esc(c)}</th>`).join("") + `</tr>`;
  const body = rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.id}</td>` + cols.map((c) => `<td>${esc(r[c])}</td>`).join("") + `</tr>`).join("");
  return `<table>${head}${body}</table>`;
}

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

boot();
