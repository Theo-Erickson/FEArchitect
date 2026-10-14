// Write assets/reference/fe8/sim-classes.json from the extracted FE8 classes.
// Gitignored (ROM derived). Run: node tools/assetgen/gensimclasses.ts
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { toSimClass } from "./simclasses.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

async function main(): Promise<void> {
  const src = join(ROOT, "assets/reference/fe8/classes.json");
  if (!existsSync(src)) throw new Error("Run Import Assets first: assets/reference/fe8/classes.json is missing.");
  const classes = JSON.parse(await readFile(src, "utf8"));
  const out: Record<string, any> = {};
  for (const c of classes) {
    const sim = toSimClass(c);
    if (!sim.name) continue;
    const id = sim.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `class-${c.id}`;
    out[id] = sim;
  }
  await writeFile(join(ROOT, "assets/reference/fe8/sim-classes.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${Object.keys(out).length} sim classes.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
