# FE8 map format findings (Task 1 spike)

Date: 2026-10-05
Status: GO. The full chapter to map-graphics recipe is resolved and verified against
Chapter 1 using the fireemblem8u decomp (same author as our CLI fork) plus live CLI
extraction. All later tasks use the constants and formats below.

## Source of truth

fireemblem8u decomp: `src/chapterdata.c`, `src/bmmap.c`, `include/chapterdata.h`, and
the symbol table (https://fireemblemuniverse.github.io/fireemblem8u/symbols.txt).

## Tables (FE8U, mapped ROM addresses; file offset = addr - 0x08000000)

- `gChapterDataTable`      = `0x088B0890`. Array of `struct ROMChapterData`, 148
  bytes (0x94) each. This is exactly what `--export-map-settings` dumps (79 entries).
  Chapter N record is at `0x088B0890 + N*0x94` (Ch1 = `0x008B0924`, verified).
- `gChapterDataAssetTable` = `0x088B363C`. Array of u32 pointers. Every map asset id
  below indexes it: `asset(id) = read_u32(gChapterDataAssetTable + id*4)`.

## struct ROMChapterData (only the fields we need)

- `+0x00` u32 `internalName` pointer (ASCII, e.g. "L01"). Not graphics.
- `+0x04` `struct ChapterMap map`:
  - `+0x04` u8 `obj1Id`      -> asset = OBJ tileset graphics (LZ77)
  - `+0x05` u8 `obj2Id`      -> second OBJ graphics (often 0; not needed for FE8 base)
  - `+0x06` u8 `paletteId`   -> asset = palette
  - `+0x07` u8 `tileConfigId`-> asset = tileset config (TSA + terrain), LZ77
  - `+0x08` u8 `mainLayerId` -> asset = tile layout (the .mar)
  - `+0x09` u8 `objAnimId`, `+0x0A` u8 `paletteAnimId`, `+0x0B` u8 `changeLayerId`

Chapter title shown to the user comes from the `--export-map-settings` Name column
(for example "01 Ch1 Escape!"); the runner uses that for display names.

## Extraction (verified on Ch1: obj1=1, pal=2, cfg=3, mainLayer=8)

Resolve the four pointers via the asset table, then:

```
--export-asset --kind=map           --addr=asset(mainLayerId)   --out=ch.mar
--export-asset --kind=objtiles      --addr=asset(obj1Id)        --out=ch.objtiles
--export-asset --kind=mapchipconfig --addr=asset(tileConfigId)  --out=ch.cfg
--export-palette --colors=256       --addr=asset(paletteId)     --out=ch.pal
```

The CLI also writes a `.json` sidecar for map/objtiles/cfg. The map sidecar gives
`width` and `height` in tiles (Ch1 = 15 x 10). Use the sidecar for dimensions.

## Blob formats (decompressed outputs)

- **ch.mar**: raw little-endian u16 per map cell, `width*height` cells, row major
  (Ch1: 15*10*2 = 300 bytes). Sidecar format id "febuilder-mar-u16-shl3". The stored
  u16 is `configOffset << 3`, so `configOffset = value >> 3`. All values are
  multiples of 8; max observed 4028 (< 4096), consistent with the config below.
- **ch.cfg** (mapchipconfig, decompressed): 9216 bytes = `0x1200` u16 =
  `0x1000` u16 of TSA (8192 bytes) followed by `0x200` u16 terrain lookup (1024
  bytes). Matches `EWRAM sTilesetConfig[0x1000 + 0x200]` in bmmap.c:47.
  - TSA = the first 4096 u16. Each map chip (16x16) is 4 consecutive u16 at
    `configOffset`: `tsa[configOffset + 0..3]` = top-left, top-right, bottom-left,
    bottom-right (sub index s: sx = s&1, sy = s>>1).
  - Each TSA u16 is a standard GBA screen entry: tile number bits 0..9, hflip bit 10,
    vflip bit 11, palette bank bits 12..15.
  - Terrain lookup = the last 512 u16 (bytes 8192..9215). Per bmmap.c:324, terrain
    type for a cell = `terrainLookup[(value >> 3) >> 2]`. NOT used in this
    sub-project; it is the hook for the future tactical-grid terrain track.
- **ch.objtiles** (decompressed): 4bpp 8x8 tiles, 32 bytes per tile (Ch1: 32768
  bytes = 1024 tiles; max tile number referenced by the TSA was 1023, a clean match).
- **ch.pal**: JASC-PAL text (`.pal`). With `--colors=256` it gives up to 16 banks of
  16 colors as "R G B" lines (0..255 per channel, already 8-bit). Ch1 TSA references
  palette banks up to 4; exporting 256 colors covers all banks safely.

## Compositor math (confirmed)

```
for cy in 0..height-1, cx in 0..width-1:
  off = mar[cy*width + cx] >> 3            // u16 offset into TSA
  for s in 0..3:
    e = tsa[off + s]
    tileNum = e & 0x3FF; hflip = (e>>10)&1; vflip = (e>>11)&1; bank = (e>>12)&0xF
    draw the 8x8 tile tileNum (4bpp, palette bank) at
      (cx*16 + (s&1)*8, cy*16 + (s>>1)*8), applying hflip/vflip
```

Palette: JASC "R G B" lines parsed to RGBA (opaque). Color index = bank*16 + nibble.

## Verified

Ch1 pointers resolved (layout 0x81B75D0, objtiles 0x8198D8C, config 0x81AB69C,
palette 0x81AEBF0); all four CLI exports succeeded; sizes and the tile/bank ranges
are internally consistent (1024 tiles, TSA offsets < 4096, banks <= 4). The actual
rendered PNG is the final visual check in the runner task.
