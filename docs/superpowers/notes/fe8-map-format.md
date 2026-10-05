# FE8 map format findings (Task 1 spike, in progress)

Date: 2026-10-05
Status: PARTIAL. The chapter settings record is decoded, but the chapter to map
graphics (tileset) pointer chain is not yet resolved. Go/no-go is currently NO-GO
pending resolution of the tileset pointer system (see "Open question").

## What `--export-map-settings` gives

`--export-map-settings --rom=FE8_Clean.gba` reports "Found 79 maps (entry size: 148
bytes)". Each row has an Index, a Name, an Address, and raw offset columns.

Important: the Address column is a RAW FILE OFFSET (for example Chapter 1 is
`0x008B0924`), not a mapped `0x08......` pointer. Pointers stored INSIDE the record
are mapped (subtract `0x08000000` to get a file offset). FE8U is 16MB, so a valid
ROM pointer is `0x08000000` to `0x08FFFFFF`; a `0x09xxxxxx` value is out of range and
is data, not a pointer.

## Chapter 1 ("01 Ch1 Escape!") record at file 0x008B0924 (148 bytes)

Decoded fields of interest:

- `+0x00` = `0x081C32CC`  pointer. Target is an ASCII label table: bytes
  `4c 30 31 00` = "L01", next entry "L02", etc. This is the map label string, NOT
  graphics. (Chapter 0 points one entry earlier, "L00".)
- `+0x08` = `0x09000508`  out of ROM range: this is data, not a pointer.
- `+0x14` = u16 pair (16, 9): very likely the map width and height in tiles (Ch1 is
  a small map, consistent).
- `+0x18` = u16 pair (19, 15), `+0x1C` = (9, 19): likely camera or bounds.

So the 148-byte "map settings" record holds the chapter's settings (label, bounds,
dimensions), and does NOT directly hold the tileset graphics or tile layout pointers.

## Open question (the wall)

FE8 reaches map graphics through a tileset system, not a direct pointer in this
record. The CLI help confirms it: `--kind=objtiles` says the address must be the
"DEREFERENCED OBJ LZ77 stream", "NOT RomInfo.map_obj_pointer", and mentions a
`map_config_pointer` and "anime-1/anime-2 entry tables". So the chain is roughly:

  chapter -> tileset id -> (RomInfo.map_obj_pointer table) -> obj tiles stream
                        -> (map_config_pointer table)      -> chip config (TSA)
                        -> palette
  chapter -> tile layout (.mar) pointer (per chapter)

To extract a chapter's map we still need: (a) which field carries the tileset id and
the tile-layout pointer, and (b) the FE8U base addresses of `map_obj_pointer` and
`map_config_pointer` and how a tileset id indexes them. These are version-specific
constants FEBuilder knows internally (RomInfo); they are not in the exported data.

## Resolution options

1. Look up the documented FE8U map/tileset structure (the fireemblem8u decomp and
   FEBuilder RomInfo define `map_obj_pointer`, `map_config_pointer`, the tileset
   data struct, and the chapter map-data pointer). Fastest reliable path.
2. Continue reverse-engineering from the ROM (slower, we have the record and dims
   as a start).
3. Pause the maps track.

## Reusable so far

- Record address is a raw file offset; inner pointers are mapped; 16MB bound check.
- Chapter dimensions appear at record `+0x14` as a u16 (width, height) pair (to be
  confirmed once a full render validates).
