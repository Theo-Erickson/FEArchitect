// Hub page: renders the tool index, launches/stops tools through the hub server,
// and shows each tool's live output from the server's event stream.

interface Prereq { label: string; path?: string; ok: boolean }
interface ToolView {
  id: string; name: string; summary: string; when: string; launcher: string;
  interactive: boolean; url?: string; port?: number; command: string;
  prereqs: Prereq[]; state: string; code?: number | null;
}
interface LogLine { stream: "out" | "err" | "sys"; text: string }

const tools = new Map<string, ToolView>();
const logs = new Map<string, LogLine[]>();
let selected: string | null = null;

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const STATE_LABEL: Record<string, string> = {
  idle: "ready", running: "running", exited: "done", failed: "failed", stopped: "stopped", console: "own window",
};

/** A server page is open-able when any tool on the same port is running. */
function serving(t: ToolView): boolean {
  if (!t.port) return false;
  for (const o of tools.values()) if (o.port === t.port && o.state === "running") return true;
  return false;
}

function prereqChips(t: ToolView): string {
  if (!t.prereqs.length) return "";
  return `<div class="prereqs">${t.prereqs.map((p) => {
    const cls = !p.path ? "note" : p.ok ? "ok" : "miss";
    const mark = !p.path ? "i" : p.ok ? "✓" : "!";
    const title = !p.path ? "Can't be checked automatically" : p.ok ? "Found" : `Missing: ${p.path}`;
    return `<span class="chip ${cls}" title="${esc(title)}">${mark} ${esc(p.label)}</span>`;
  }).join("")}</div>`;
}

function actions(t: ToolView): string {
  const running = t.state === "running";
  const parts: string[] = [];
  if (t.url) {
    if (serving(t)) parts.push(`<button class="btn open" data-act="open" data-id="${t.id}">Open page</button>`);
    else parts.push(`<button class="btn primary" data-act="run" data-id="${t.id}">Start</button>`);
  } else {
    parts.push(`<button class="btn primary" data-act="run" data-id="${t.id}" ${running ? "disabled" : ""}>${t.state === "idle" || t.interactive ? "Run" : "Run again"}</button>`);
  }
  if (running) parts.push(`<button class="btn stop" data-act="stop" data-id="${t.id}">Stop</button>`);
  return parts.join("");
}

function cardHtml(t: ToolView): string {
  const state = t.state === "failed" && t.code != null ? `failed · ${t.code}` : STATE_LABEL[t.state] ?? t.state;
  return `
    <div class="top"><h3>${esc(t.name)}</h3><span class="pill ${t.state}">${esc(state)}</span></div>
    <p class="summary">${esc(t.summary)}</p>
    <p class="when"><b>WHEN</b>${esc(t.when)}</p>
    ${prereqChips(t)}
    <div class="actions">${actions(t)}</div>`;
}

function renderCard(id: string): void {
  const el = document.querySelector<HTMLElement>(`.card[data-id="${id}"]`);
  const t = tools.get(id);
  if (el && t) el.innerHTML = cardHtml(t);
}

function renderAllCards(): void {
  for (const id of tools.keys()) renderCard(id);
}

function renderGroups(groups: { group: string; tools: ToolView[] }[]): void {
  $("groups").innerHTML = groups.map((g) => `
    <section class="group">
      <h2>${esc(g.group)}</h2>
      <div class="cards">${g.tools.map((t) =>
        `<article class="card panel${t.id === selected ? " sel" : ""}" data-id="${t.id}" tabindex="0" aria-label="${esc(t.name)}">${cardHtml(t)}</article>`
      ).join("")}</div>
    </section>`).join("");
}

function renderLog(): void {
  const pre = $("log");
  if (!selected) return;
  const t = tools.get(selected)!;
  $("ctitle").textContent = t.name;
  $("ccmd").textContent = `$ ${t.command}`;
  $("claunch").innerHTML = `Double-click equivalent: <code>${esc(t.launcher)}</code>`;
  const lines = logs.get(selected) ?? [];
  const nearBottom = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
  pre.innerHTML = lines.length
    ? lines.map((l) => `<span class="${l.stream}">${esc(l.text)}</span>`).join("\n")
    : `<span class="empty">${t.interactive ? "This tool opens in its own console window." : "Not run yet. Press Run or Start."}</span>`;
  if (nearBottom) pre.scrollTop = pre.scrollHeight;
}

function select(id: string): void {
  selected = id;
  document.querySelectorAll(".card").forEach((c) => c.classList.toggle("sel", (c as HTMLElement).dataset.id === id));
  const pre = $("log");
  renderLog();
  pre.scrollTop = pre.scrollHeight;
}

async function post(act: "run" | "stop", id: string): Promise<{ ok: boolean; open?: string; error?: string }> {
  const r = await fetch(`/api/${act}/${id}`, { method: "POST", headers: { "x-fea-hub": "1" } });
  return r.json();
}

async function onAction(act: string, id: string): Promise<void> {
  const t = tools.get(id)!;
  select(id);
  if (act === "open") { window.open(t.url, "_blank"); return; }
  const r = await post(act as "run" | "stop", id);
  if (r.open) window.open(r.open, "_blank");
  if (!r.ok && r.error) {
    (logs.get(id) ?? logs.set(id, []).get(id)!).push({ stream: "sys", text: `Hub: ${r.error}` });
    renderLog();
  }
}

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const btn = target.closest<HTMLButtonElement>("button[data-act]");
  if (btn) { void onAction(btn.dataset.act!, btn.dataset.id!); return; }
  const go = target.closest<HTMLButtonElement>("button[data-go]");
  if (go) {
    const card = document.querySelector<HTMLElement>(`.card[data-id="${go.dataset.go}"]`);
    select(go.dataset.go!);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    card?.focus({ preventScroll: true });
    return;
  }
  const card = target.closest<HTMLElement>(".card");
  if (card) select(card.dataset.id!);
});
document.addEventListener("keydown", (e) => {
  const card = (e.target as HTMLElement).closest?.(".card") as HTMLElement | null;
  if (card && (e.key === "Enter" || e.key === " ") && e.target === card) { e.preventDefault(); select(card.dataset.id!); }
});
$("clear").addEventListener("click", () => { if (selected) { logs.set(selected, []); renderLog(); } });

function connect(): void {
  const es = new EventSource("/api/events");
  const conn = $("conn");
  es.onopen = () => { conn.innerHTML = `<span class="dot live"></span>hub online`; };
  es.onerror = () => { conn.innerHTML = `<span class="dot"></span>hub offline: is the FEArchitect window still open?`; };
  es.addEventListener("log", (ev) => {
    const { id, lines } = JSON.parse((ev as MessageEvent).data) as { id: string; lines: LogLine[] };
    const arr = logs.get(id) ?? [];
    arr.push(...lines);
    if (arr.length > 2000) arr.splice(0, arr.length - 2000);
    logs.set(id, arr);
    if (id === selected) renderLog();
  });
  es.addEventListener("reset", (ev) => {
    const { id } = JSON.parse((ev as MessageEvent).data) as { id: string };
    logs.set(id, []);
    if (id === selected) renderLog();
  });
  es.addEventListener("state", (ev) => {
    const { id, state, code } = JSON.parse((ev as MessageEvent).data) as { id: string; state: string; code?: number | null };
    const t = tools.get(id);
    if (!t) return;
    t.state = state; t.code = code;
    // A server starting or stopping changes the Open button on every page it serves.
    if (t.port) renderAllCards(); else renderCard(id);
  });
}

async function init(): Promise<void> {
  const groups = (await (await fetch("/api/tools")).json()) as { group: string; tools: ToolView[] }[];
  for (const g of groups) for (const t of g.tools) tools.set(t.id, t);
  renderGroups(groups);
  connect();
}

void init();
