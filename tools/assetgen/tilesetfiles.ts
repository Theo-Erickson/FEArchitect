// Where the FE8 terrain tileset sheets live and how zip entries map to local files.
// The sheets are fan-ripped art: gitignored, never committed (see CREDITS.md there).

export const TILESET_DIR = "assets/tilesets/fe8"; // repo-relative
export const DEFAULT_ZIP = "Feaws Tileset Collection.zip"; // looked for at the repo root

// "FE 8/Castle Blue.png" -> { name: "Castle Blue", file: "castle-blue.png" }. Anything
// outside the FE 8 folder, nested deeper, not a .png, or that slugs to nothing -> null.
export function sheetFileName(entry: string): { name: string; file: string } | null {
  const m = /^FE 8\/([^/\\]+)\.png$/i.exec(entry);
  if (!m) return null;
  const name = m[1];
  if (name.includes("..")) return null;
  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
  if (!slug) return null;
  return { name, file: `${slug}.png` };
}

export function dataFileFor(file: string): string {
  return file.replace(/\.png$/i, ".json");
}
