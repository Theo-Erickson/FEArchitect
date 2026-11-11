// Shared helper for MCP tests: a throwaway copy of the project data so write tests
// never touch real files. FE8 reference data is copied when present (it is
// gitignored and derived from the ROM), so FE8 tests can skip cleanly without it.
import { mkdtemp, cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
export const HAS_FE8 = existsSync(join(ROOT, "assets/reference/fe8/terrain/1.json"));

const FE8_FILES = ["terrain.json", "terrain", "sim-classes.json", "maps.json"];

export async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fea-mcp-"));
  for (const sub of ["data", "maps", "encounters"]) {
    await cp(join(ROOT, sub), join(dir, sub), { recursive: true });
  }
  if (HAS_FE8) {
    await mkdir(join(dir, "assets/reference/fe8"), { recursive: true });
    for (const f of FE8_FILES) {
      const from = join(ROOT, "assets/reference/fe8", f);
      if (existsSync(from)) await cp(from, join(dir, "assets/reference/fe8", f), { recursive: true });
    }
  }
  return dir;
}
