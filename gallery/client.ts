// Gallery browser client: pick a game, browse Units/Classes/Items as tables or
// cards, and play battle animations (fetched lazily from the server).
import { SECTION_LABELS, idTag, cellTitle } from "./format.ts";
type Row = Record<string, any>;
type AnimEntry = { cls: string; modes: number[] };

let game = "";
let tab: "units" | "classes" | "items" | "anims" | "maps" = "units";
const cache: Record<string, Row[]> = {}; // key `${game}/${table}`
let currentAnimId = 0; // the animation id shown in the Animations tab
let animGen = 0;       // bumped each anim render so a stale progressive load stops
let animScale = 1;     // zoom factor for the section tiles
const animMaps: Record<string, Record<number, AnimEntry>> = {}; // per-game id -> class
const viewMode: Record<"classes" | "items", "cards" | "table"> = { classes: "cards", items: "cards" };

// Fetch (once per game) the animation id -> class map used to label the id picker.
async function ensureAnimMap(g: string): Promise<Record<number, AnimEntry>> {
  if (!animMaps[g]) {
    try { animMaps[g] = await fetch(`/animmap?game=${g}`).then((r) => r.json()); }
    catch { animMaps[g] = {}; }
  }
  return animMaps[g];
}

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
  if (tab === "maps") return renderMaps();
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

// A generic table of the most useful columns for classes/items, name first.
function recordTable(rows: Row[]): string {
  if (rows.length === 0) return `<p class="note">nothing to show</p>`;
  const skip = new Set(["name"]);
  const cols = Object.keys(rows[0]).filter((k) => k !== "id" && !skip.has(k) && !k.endsWith("Pointer") && !k.endsWith("TextID")).slice(0, 12);
  const head = `<tr><th>name</th><th>id</th>` + cols.map((c) => `<th>${esc(c)}</th>`).join("") + `</tr>`;
  // Each cell carries a title tooltip: the column name and value, plus a decoded
  // reading (for example a weapon rank number shown as its letter).
  const body = rows.map((r) =>
    `<tr><td title="name: ${esc(r.name)}">${esc(r.name)}</td><td title="id: ${r.id}">${r.id}</td>` +
    cols.map((c) => `<td title="${esc(cellTitle(c, r[c]))}">${esc(r[c])}</td>`).join("") + `</tr>`).join("");
  return `<table>${head}${body}</table>`;
}

// Animations tab: a searchable id picker (each option labeled by class, with a
// static section-10 thumbnail), a zoom control, and a grid of the 12 sections,
// each a labeled GIF. Tiles load one at a time so only one CLI export runs at a
// time, and a stale load (the user stepped to another id) stops when animGen
// changes.
async function renderAnims(): Promise<void> {
  const id = currentAnimId;
  const gen = ++animGen;
  const map = await ensureAnimMap(game);
  if (gen !== animGen) return; // superseded while the map was fetching
  const curCls = map[id]?.cls;
  view.innerHTML = `
    <div class="anim">
      <button id="aprev">Prev</button>
      <div class="combo">
        <input id="aid" autocomplete="off" placeholder="id or class name"
               value="${id}${curCls ? ` — ${esc(curCls)}` : ""}">
        <div id="animdd" class="dropdown" hidden></div>
      </div>
      <button id="anext">Next</button>
      <label>Zoom <input id="azoom" type="range" min="1" max="4" step="0.5" value="${animScale}"></label>
      <span id="azoomval" class="note">${animScale}x</span>
    </div>
    <div class="note" id="acur">${curCls ? `id ${id} — ${esc(curCls)}` : `id ${id} (no class mapped)`} &middot; first view of an id generates its GIFs, then they are cached.</div>
    <div class="grid secgrid" id="secgrid" style="--anim-scale:${animScale}">${SECTION_LABELS.map((lab, s) =>
      `<div class="card">
        <div><strong>${esc(lab)}</strong> <span class="note">#${s}</span></div>
        <img id="sec_${s}" class="anim-sec" alt="">
        <div class="note" id="secst_${s}">loading...</div>
      </div>`).join("")}</div>`;

  const setId = (v: number) => { if (Number.isFinite(v)) { currentAnimId = Math.max(0, v); void renderAnims(); } };
  ($("aprev") as HTMLButtonElement).addEventListener("click", () => setId(currentAnimId - 1));
  ($("anext") as HTMLButtonElement).addEventListener("click", () => setId(currentAnimId + 1));

  // Zoom just restyles the grid; it does not reload the GIFs.
  ($("azoom") as HTMLInputElement).addEventListener("input", (e) => {
    animScale = Number((e.target as HTMLInputElement).value);
    ($("secgrid") as HTMLElement).style.setProperty("--anim-scale", String(animScale));
    $("azoomval").textContent = `${animScale}x`;
  });

  buildAnimDropdown(map, setId);
  void loadSectionsProgressively(id, gen);
}

// Wire the searchable id dropdown: a filterable list of `id - class` rows, each
// with a lazily loaded section-10 thumbnail, plus free-form numeric entry.
function buildAnimDropdown(map: Record<number, AnimEntry>, setId: (v: number) => void): void {
  const input = $("aid") as HTMLInputElement;
  const panel = $("animdd") as HTMLElement;
  const ids = Object.keys(map).map(Number).sort((a, b) => a - b);

  // One row per mapped id. Icons load only when scrolled into view (see observer).
  panel.innerHTML = ids.map((aid) =>
    `<div class="ddrow" data-id="${aid}" data-text="${esc(`${aid} ${map[aid].cls}`.toLowerCase())}">
      <img class="ddicon" data-anim="${aid}" alt="">
      <span>${aid} &mdash; ${esc(map[aid].cls)}</span>
    </div>`).join("") || `<div class="ddrow">no class map for this game</div>`;

  // Lazy-load each row's thumbnail (static section 10) when it becomes visible, so
  // opening the list does not export every animation at once.
  const io = new IntersectionObserver((entries, obs) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const img = en.target as HTMLImageElement;
      const aid = img.dataset.anim;
      img.onerror = () => { img.style.visibility = "hidden"; };
      img.src = `/anim?game=${game}&id=${aid}&section=10`;
      obs.unobserve(img);
    }
  }, { root: panel });
  for (const img of panel.querySelectorAll<HTMLImageElement>(".ddicon")) io.observe(img);

  const open = () => { panel.hidden = false; };
  const close = () => { panel.hidden = true; };
  const filter = () => {
    const q = input.value.trim().toLowerCase();
    for (const row of panel.querySelectorAll<HTMLElement>(".ddrow")) {
      const t = row.dataset.text ?? "";
      row.hidden = q !== "" && !t.includes(q);
    }
    open();
  };

  input.addEventListener("focus", () => { input.select(); open(); });
  input.addEventListener("input", filter);
  // Enter or leaving the field commits a leading number typed directly.
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { close(); setId(parseInt(input.value, 10)); } });
  input.addEventListener("blur", () => { setTimeout(close, 150); }); // let a row click land first
  // mousedown (not click) so it fires before the input blur closes the panel.
  panel.addEventListener("mousedown", (e) => {
    const row = (e.target as HTMLElement).closest(".ddrow") as HTMLElement | null;
    if (!row || !row.dataset.id) return;
    e.preventDefault();
    close();
    setId(Number(row.dataset.id));
  });
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

// Maps tab: the rendered chapter maps from maps.json, searchable, with a zoom.
type MapRow = { index: number; name: string; width: number; height: number; file: string };
let mapScale = 1;

async function renderMaps(): Promise<void> {
  let maps: MapRow[] = [];
  try { maps = await fetch(`/assets/reference/${game}/maps.json`).then((r) => r.json()); }
  catch { maps = []; }
  if (maps.length === 0) {
    view.innerHTML = `<p class="note">No maps imported for ${esc(game.toUpperCase())}. Run Generate Maps.cmd.</p>`;
    return;
  }
  const q = search.value.trim().toLowerCase();
  const shown = q ? maps.filter((m) => m.name.toLowerCase().includes(q)) : maps;
  view.innerHTML = `
    <div class="anim">
      <label>Zoom <input id="mzoom" type="range" min="1" max="4" step="0.5" value="${mapScale}"></label>
      <span id="mzoomval" class="note">${mapScale}x</span>
    </div>
    <div class="grid" id="mapgrid" style="--anim-scale:${mapScale}">${shown.map((m) =>
      `<div class="card">
        <div><strong>${esc(m.name)}</strong> <span class="note">#${m.index} ${m.width}x${m.height}</span></div>
        <img class="map-img" src="/assets/reference/${game}/${esc(m.file)}" alt="" loading="lazy">
      </div>`).join("")}</div>`;
  ($("mzoom") as HTMLInputElement).addEventListener("input", (e) => {
    mapScale = Number((e.target as HTMLInputElement).value);
    ($("mapgrid") as HTMLElement).style.setProperty("--anim-scale", String(mapScale));
    $("mzoomval").textContent = `${mapScale}x`;
  });
}

boot();
