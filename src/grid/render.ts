// Pure SVG builders for tiles, terrain sprites, and unit sprites. No DOM. The
// client stitches these into a board. Terrain sprites carry small deterministic
// per-tile variation so the map does not look stamped.

export const TILE_COLORS: Record<string, string> = {
  plains: "#bcd98f", forest: "#7ba85f", mountain: "#b9a684", water: "#5fa8e0", wall: "#5b524a",
};

// Deterministic 0..1 variation from tile coordinates and a salt.
function vary(x: number, y: number, salt: number): number {
  const h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(salt + 1, 83492791)) >>> 0;
  return (h % 1000) / 1000;
}

function pine(cx: number, footY: number, s: number, v: number, hue: string): string {
  const u = s / 64, H0 = (30 + v * 12) * u, halfW = (13 + v * 3) * u;
  let out = `<rect x="${cx - 2 * u}" y="${footY - 2 * u}" width="${4 * u}" height="${9 * u}" fill="#6b4a2b"/>`;
  for (let i = 0; i < 3; i++) {
    const by = footY - i * (H0 * 0.30), ty = by - H0 * 0.55, hw = halfW * (1 - i * 0.24);
    out += `<polygon points="${cx - hw},${by} ${cx + hw},${by} ${cx},${ty}" fill="${hue}"/>`;
  }
  return out;
}

// A terrain sprite positioned at tile origin (ox, oy) of size s, for tile (x, y).
export function terrainSprite(id: string, ox: number, oy: number, s: number, x: number, y: number): string {
  const u = s / 64, S = (n: number) => n * u;
  const g = (inner: string) => `<g transform="translate(${ox},${oy})">${inner}</g>`;
  if (id === "plains") {
    const n = 2 + Math.floor(vary(x, y, 1) * 3);
    let t = "";
    for (let i = 0; i < n; i++) {
      const gx = S(10 + vary(x, y, i + 2) * 44), gy = S(46 + vary(x, y, i + 7) * 8), hh = S(6 + vary(x, y, i + 5) * 5);
      t += `<path d="M${gx},${gy} l${S(2.5)},${-hh} l${S(2.5)},${hh}" stroke="#7fae55" stroke-width="${S(2)}" fill="none"/>`;
    }
    return g(t);
  }
  if (id === "forest") {
    const hue = ["#2f5d2a", "#356a30", "#295426"][Math.floor(vary(x, y, 9) * 3)];
    let out = pine(S(32) + (vary(x, y, 3) - 0.5) * S(6), S(56), s, vary(x, y, 4), hue);
    if (vary(x, y, 8) > 0.55) out += pine(S(16 + vary(x, y, 6) * 8), S(54), s * 0.7, vary(x, y, 5), hue);
    return g(out);
  }
  if (id === "mountain") {
    const a = vary(x, y, 1), b = vary(x, y, 2);
    return g(
      `<polygon points="${S(8)},${S(54)} ${S(24 + a * 4)},${S(16 + a * 8)} ${S(40)},${S(54)}" fill="#7d7266"/>` +
      `<polygon points="${S(30)},${S(54)} ${S(44 + b * 4)},${S(26 + b * 6)} ${S(58)},${S(54)}" fill="#8a7f72"/>` +
      `<polygon points="${S(19 + a * 4)},${S(29)} ${S(24 + a * 4)},${S(16 + a * 8)} ${S(29 + a * 4)},${S(29)}" fill="#f4f4f2"/>`,
    );
  }
  if (id === "water") {
    const ph = vary(x, y, 1) * 8;
    const wave = (yy: number) => `<path d="M${S(6 + ph)},${S(yy)} q${S(8)},${S(-6)} ${S(16)},0 q${S(8)},${S(6)} ${S(16)},0 q${S(8)},${S(-6)} ${S(16)},0" stroke="#cdeafd" stroke-width="${S(2.5)}" fill="none" stroke-linecap="round"/>`;
    return g(wave(22 + ph) + wave(38) + wave(52 - ph * 0.5));
  }
  if (id === "wall") {
    return g(`<g stroke="#3f3831" stroke-width="${S(2)}"><line x1="0" y1="${S(21)}" x2="${s}" y2="${S(21)}"/><line x1="0" y1="${S(42)}" x2="${s}" y2="${S(42)}"/><line x1="${S(20)}" y1="0" x2="${S(20)}" y2="${S(21)}"/><line x1="${S(44)}" y1="0" x2="${S(44)}" y2="${S(21)}"/><line x1="${S(32)}" y1="${S(21)}" x2="${S(32)}" y2="${S(42)}"/><line x1="${S(20)}" y1="${S(42)}" x2="${S(20)}" y2="${s}"/><line x1="${S(44)}" y1="${S(42)}" x2="${S(44)}" y2="${s}"/></g>`);
  }
  return "";
}

// A unit token centered at (cx, cy) in a tile of size s, with an HP number and a
// movement-type mark. kind is "foot" | "cav" | "fly".
export function unitSprite(kind: string, cx: number, cy: number, s: number, hp: number, color: string): string {
  const u = s / 64, S = (n: number) => n * u;
  const dark = color === "#2b6cff" ? "#1f4fbf" : "#a82f27";
  if (kind === "cav") {
    const body = `<g fill="${dark}">
      <ellipse cx="${cx}" cy="${cy + S(9)}" rx="${S(20)}" ry="${S(9)}"/>
      <path d="M${cx + S(14)},${cy + S(4)} q${S(10)},${S(-2)} ${S(11)},${S(-14)} l${S(-5)},${S(-1)} q${S(-2)},${S(9)} ${S(-10)},${S(9)} z"/>
      <rect x="${cx - S(15)}" y="${cy + S(14)}" width="${S(3.5)}" height="${S(12)}"/>
      <rect x="${cx - S(6)}" y="${cy + S(14)}" width="${S(3.5)}" height="${S(12)}"/>
      <rect x="${cx + S(4)}" y="${cy + S(14)}" width="${S(3.5)}" height="${S(12)}"/>
      <rect x="${cx + S(13)}" y="${cy + S(14)}" width="${S(3.5)}" height="${S(12)}"/></g>`;
    const token = `<circle cx="${cx}" cy="${cy - S(6)}" r="${S(13)}" fill="${color}" stroke="#0006" stroke-width="${S(1.5)}"/>`;
    return `${body}${token}<text x="${cx}" y="${cy - S(2)}" font-size="${S(12)}" fill="#fff" text-anchor="middle" font-family="system-ui" font-weight="600">${hp}</text>`;
  }
  if (kind === "fly") {
    const body = `<ellipse cx="${cx}" cy="${cy + S(22)}" rx="${S(15)}" ry="${S(4)}" fill="#00000033"/>
      <path d="M${cx - S(4)},${cy} q${S(-26)},${S(-16)} ${S(-30)},${S(4)} q${S(18)},${S(2)} ${S(30)},${S(6)} z" fill="${dark}"/>
      <path d="M${cx + S(4)},${cy} q${S(26)},${S(-16)} ${S(30)},${S(4)} q${S(-18)},${S(2)} ${S(-30)},${S(6)} z" fill="${dark}"/>`;
    const token = `<circle cx="${cx}" cy="${cy}" r="${S(15)}" fill="${color}" stroke="#0006" stroke-width="${S(1.5)}"/>`;
    return `${body}${token}<text x="${cx}" y="${cy + S(5)}" font-size="${S(14)}" fill="#fff" text-anchor="middle" font-family="system-ui" font-weight="600">${hp}</text>`;
  }
  // foot
  const token = `<circle cx="${cx}" cy="${cy}" r="${S(18)}" fill="${color}" stroke="#0006" stroke-width="${S(1.5)}"/>`;
  return `${token}<text x="${cx}" y="${cy + S(5)}" font-size="${S(14)}" fill="#fff" text-anchor="middle" font-family="system-ui" font-weight="600">${hp}</text>`;
}
