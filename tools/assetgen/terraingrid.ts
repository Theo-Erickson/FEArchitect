// Per-tile terrain id for a chapter. The tileset config's terrain lookup is a u8
// array starting at byte 8192 (after the 0x1000 u16 TSA). For a cell, the terrain id
// is lookup[offset >> 2], where offset is the layout value already shifted right 3
// (what parseLayout returns). See docs/superpowers/notes/fe8-map-format.md and bmmap.c.
const TERRAIN_LOOKUP_OFFSET = 8192;

export function terrainGrid(config: Uint8Array, layout: Uint16Array, width: number, height: number): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const offset = layout[y * width + x];
      row.push(config[TERRAIN_LOOKUP_OFFSET + (offset >> 2)] ?? 0);
    }
    grid.push(row);
  }
  return grid;
}
