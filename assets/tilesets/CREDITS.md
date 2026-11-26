# Terrain tileset credits

The FE8 (Fire Emblem: The Sacred Stones) terrain chip sheets used by the map viewers
come from **Feaw's Tileset Collection** (folder `FE 8/`), a community rip shared on
FEUniverse. Fire Emblem art is the property of Nintendo / Intelligent Systems. The
sheets are not committed to this repository; only this note is.

Each sheet is 512x512: 32x32 map chips of 16x16 px, in the ROM's own chip order offset
by one (sheet position `p` holds ROM chip `p + 1`). The chip index files next to the
sheets (`index.json`, one `<sheet>.json` each) are mined from the FE8 ROM's chapter
maps and are also local only.

To restore everything:

1. Put `Feaws Tileset Collection.zip` at the repo root (or pass its path).
2. Make sure `base/FE8_Clean.gba`, `tools/febuilder-cli/` and the chapter maps
   (Generate Maps) are in place.
3. Run `node --no-warnings tools/assetgen/tilesets.ts [path/to/zip]`, or double-click
   `launchers/Build Tilesets.cmd`.

Only `FE 8/*.png` entries are copied out of the zip; nothing else in it is extracted
or run.
