// Parse the blobs the CLI produces into the shapes the compositor wants. The exact
// raw forms are documented in docs/superpowers/notes/fe8-map-format.md.

const TSA_ENTRIES = 0x1000; // the config's first 4096 u16 are TSA; the rest is terrain

// JASC-PAL text: a header ("JASC-PAL", a version line, a count line), then one
// "R G B" line per color with 8-bit channels. Returns opaque RGBA.
export function parsePalette(text: string): Uint8Array {
  const lines = text.split(/\r?\n/);
  const colors: number[] = [];
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/\s+/).map(Number);
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) continue;
    colors.push(parts[0], parts[1], parts[2], 255);
  }
  return Uint8Array.from(colors);
}

// Tile layout: little-endian u16 per cell. The stored value is (tsaOffset << 3), so
// the TSA offset is value >> 3 (see bmmap.c: the map value indexes sTilesetConfig).
export function parseLayout(blob: Uint8Array, width: number, height: number): Uint16Array {
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const out = new Uint16Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = dv.getUint16(i * 2, true) >> 3;
  return out;
}

// Tileset config: the first 0x1000 u16 are TSA screen entries (a chip is four of
// them); the trailing 0x200 u16 are the terrain lookup, excluded here.
export function parseTsa(blob: Uint8Array): Uint16Array {
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const count = Math.min(TSA_ENTRIES, Math.floor(blob.length / 2));
  const out = new Uint16Array(count);
  for (let i = 0; i < count; i++) out[i] = dv.getUint16(i * 2, true);
  return out;
}
