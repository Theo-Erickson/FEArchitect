// Decode an FE8 chapter's map asset pointers from its ROMChapterData record.
// The chapter table and the asset table addresses, the 148-byte record size, and the
// ChapterMap id offsets are all documented in docs/superpowers/notes/fe8-map-format.md
// (sourced from the fireemblem8u decomp). Each map asset id indexes gChapterDataAssetTable.
const ROM_BASE = 0x08000000;
export const CHAPTER_TABLE_ADDR = 0x088b0890; // gChapterDataTable
const ASSET_TABLE_ADDR = 0x088b363c;          // gChapterDataAssetTable
export const RECORD_SIZE = 0x94;              // sizeof(struct ROMChapterData) = 148

// ChapterMap sub-struct ids, as byte offsets within the 148-byte record.
const OFF_OBJ1 = 4;        // obj1Id       -> OBJ tileset graphics
const OFF_PALETTE = 6;     // paletteId    -> palette
const OFF_TILE_CONFIG = 7; // tileConfigId -> tileset config (TSA + terrain)
const OFF_MAIN_LAYER = 8;  // mainLayerId  -> tile layout (.mar)

export type MapPointers = {
  layoutPtr: number;
  objTilesPtr: number;
  tileConfigPtr: number;
  palettePtr: number;
};

// Resolve the four map asset pointers for one chapter record. `asset` maps an asset
// id to its ROM pointer (see makeAssetResolver); injected so this stays pure.
export function decodeChapterMap(record: Uint8Array, asset: (id: number) => number): MapPointers {
  return {
    layoutPtr: asset(record[OFF_MAIN_LAYER]),
    objTilesPtr: asset(record[OFF_OBJ1]),
    tileConfigPtr: asset(record[OFF_TILE_CONFIG]),
    palettePtr: asset(record[OFF_PALETTE]),
  };
}

// Build a resolver that reads gChapterDataAssetTable[id] (a u32 pointer) from the ROM.
export function makeAssetResolver(rom: Uint8Array): (id: number) => number {
  const dv = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
  const base = ASSET_TABLE_ADDR - ROM_BASE;
  return (id: number) => dv.getUint32(base + id * 4, true);
}
