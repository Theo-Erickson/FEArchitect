// Composite a GBAFE map into an RGBA buffer. A map is a grid of 16x16 chips. Each
// cell of the layout is a TSA offset (the stored map u16 shifted right 3, done by the
// layout parser). The four 8x8 subtiles of a chip are tsa[offset + 0..3], arranged
// top-left, top-right, bottom-left, bottom-right. Each TSA u16 is a GBA screen entry:
// tile number (bits 0..9), horizontal flip (bit 10), vertical flip (bit 11), palette
// bank (bits 12..15). Tiles are 4bpp (32 bytes per 8x8 tile, two pixels per byte, low
// nibble first). The palette is RGBA with 16 colors per bank.
// See docs/superpowers/notes/fe8-map-format.md for the confirmed format.

export type ComposeInput = {
  widthChips: number;
  heightChips: number;
  layout: Uint16Array;  // widthChips*heightChips TSA offsets, row major
  tsa: Uint16Array;     // screen entries; a chip is tsa[offset + 0..3]
  tiles: Uint8Array;    // 4bpp tile data, 32 bytes per 8x8 tile
  palette: Uint8Array;  // RGBA, 16 colors (64 bytes) per bank
};

export function composeMap(input: ComposeInput): { width: number; height: number; rgba: Uint8Array } {
  const { widthChips, heightChips, layout, tsa, tiles, palette } = input;
  const width = widthChips * 16;
  const height = heightChips * 16;
  const rgba = new Uint8Array(width * height * 4);

  for (let cy = 0; cy < heightChips; cy++) {
    for (let cx = 0; cx < widthChips; cx++) {
      const offset = layout[cy * widthChips + cx];
      for (let sub = 0; sub < 4; sub++) {
        const sx = sub & 1;
        const sy = (sub >> 1) & 1;
        const entry = tsa[offset + sub] ?? 0;
        const tileNum = entry & 0x3ff;
        const hflip = (entry >> 10) & 1;
        const vflip = (entry >> 11) & 1;
        const bank = (entry >> 12) & 0xf;
        const tileBase = tileNum * 32;
        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            const srcx = hflip ? 7 - px : px;
            const srcy = vflip ? 7 - py : py;
            const byte = tiles[tileBase + srcy * 4 + (srcx >> 1)] ?? 0;
            const nib = (srcx & 1) ? (byte >> 4) : (byte & 0xf);
            const color = (bank * 16 + nib) * 4;
            const destx = cx * 16 + sx * 8 + px;
            const desty = cy * 16 + sy * 8 + py;
            const d = (desty * width + destx) * 4;
            rgba[d] = palette[color] ?? 0;
            rgba[d + 1] = palette[color + 1] ?? 0;
            rgba[d + 2] = palette[color + 2] ?? 0;
            rgba[d + 3] = palette[color + 3] ?? 255;
          }
        }
      }
    }
  }
  return { width, height, rgba };
}
