// Compute a unit's effective statblock from its class, bases, growths, and level.
// Averaged (deterministic) or rolled from a seed. A flat-stat unit (no class, no
// bases) is returned unchanged. See the units/skills spec.
import type { UnitDef, StatBlock } from "../types.ts";
import type { ClassDef } from "./types.ts";
import { makeRng } from "../rng.ts";

const GROWABLE: (keyof StatBlock)[] = ["hp", "str", "mag", "skl", "spd", "lck", "def", "res"];

export interface StatOpts { level?: number; mode?: "avg" | "rolled"; seed?: number; }

export function computeStatblock(unit: any, cls: ClassDef | undefined, opts: StatOpts = {}): UnitDef {
  // Flat-stat unit: no class and no authored bases -> return its stats as is.
  if (!cls && !unit.bases) {
    return { name: unit.name, hp: unit.hp, str: unit.str, mag: unit.mag, skl: unit.skl, spd: unit.spd, lck: unit.lck, def: unit.def, res: unit.res, con: unit.con };
  }
  const level = opts.level ?? unit.level ?? 1;
  const baseLevel = unit.baseLevel ?? level;
  const levels = Math.max(0, level - baseLevel);
  const mode = opts.mode ?? "avg";
  const rng = makeRng(opts.seed ?? 0);
  const baseOf = (s: keyof StatBlock) => unit.bases?.[s] ?? cls?.bases?.[s] ?? 0;
  const growthOf = (s: keyof StatBlock) => (unit.growths?.[s] ?? 0) + (cls?.growths?.[s] ?? 0);
  const capOf = (s: keyof StatBlock) => cls?.caps?.[s] ?? Infinity;

  const out: any = { name: unit.name };
  out.con = Math.min(baseOf("con"), capOf("con"));
  for (const s of GROWABLE) {
    let v = baseOf(s);
    const g = growthOf(s);
    if (mode === "avg") {
      v += Math.floor((g * levels) / 100);
    } else {
      for (let i = 0; i < levels; i++) {
        v += Math.floor(g / 100);
        if (rng.next100() < g % 100) v += 1;
      }
    }
    out[s] = Math.min(v, capOf(s));
  }
  return out as UnitDef;
}
