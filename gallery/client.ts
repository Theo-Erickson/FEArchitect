// Gallery browser client: pick a game, browse Units/Classes/Items as tables or
// cards, and play battle animations (fetched lazily from the server).
type Row = Record<string, any>;

let game = "";
let tab: "units" | "classes" | "items" | "anims" = "units";
const cache: Record<string, Row[]> = {}; // key `${game}/${table}`

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
  view.innerHTML = tab === "units" ? unitCards(shown) : recordTable(shown);
}

function portraitSrc(id: number): string {
  return `/assets/reference/${game}/portraits/portrait_${String(id).padStart(3, "0")}.png`;
}

function unitCards(rows: Row[]): string {
  return `<div class="grid">` + rows.map((u) =>
    `<div class="card">
      <img src="${portraitSrc(u.PortraitID ?? 0)}" alt="" onerror="this.style.visibility='hidden'">
      <div><strong>${esc(u.name)}</strong> <span class="note">#${u.id}</span></div>
      <div>class ${u.ClassID ?? "?"} lvl ${u.Level ?? "?"}</div>
      <div>HP ${u.BaseHP} Pow ${u.BasePow} Skl ${u.BaseSkl} Spd ${u.BaseSpd}</div>
      <div>Def ${u.BaseDef} Res ${u.BaseRes} Lck ${u.BaseLck} Con ${u.BaseCon}</div>
    </div>`).join("") + `</div>`;
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

function renderAnims(): void {
  view.innerHTML = `
    <div class="anim">
      <label>Animation id <input id="aid" type="number" value="0" min="0" style="width:6rem"></label>
      <label>Section <select id="asec">${Array.from({ length: 12 }, (_, i) => `<option value="${i}">${i}</option>`).join("")}</select></label>
      <button id="aplay">Play</button>
      <span id="astatus" class="note"></span>
    </div>
    <div style="margin-top:0.75rem"><img id="agif" alt=""></div>`;
  const play = () => {
    const id = Number(($("aid") as HTMLInputElement).value);
    const sec = Number(($("asec") as HTMLSelectElement).value);
    const img = $("agif") as HTMLImageElement;
    $("astatus").textContent = "exporting...";
    img.onload = () => { $("astatus").textContent = `id ${id} section ${sec}`; };
    img.onerror = () => { $("astatus").textContent = "export failed for that id/section"; img.removeAttribute("src"); };
    img.src = `/anim?game=${game}&id=${id}&section=${sec}&_=${Date.now()}`;
  };
  $("aplay").addEventListener("click", play);
}

boot();
