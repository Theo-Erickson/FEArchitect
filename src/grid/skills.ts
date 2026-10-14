// Resolve skill ids to definitions and expose small helpers for statblock and combat.
import type { Skill, StatBlock } from "../types.ts";

// Unit skills plus class skills, resolved to defs; unknown ids are dropped.
export function resolveSkills(unitSkills: string[] = [], classSkills: string[] = [], defs: Record<string, Skill>): Skill[] {
  const ids = [...unitSkills, ...classSkills];
  const seen = new Set<string>();
  const out: Skill[] = [];
  for (const id of ids) {
    if (seen.has(id) || !defs[id]) continue;
    seen.add(id);
    out.push(defs[id]);
  }
  return out;
}

// Flat stat additions from statMod skills.
export function passiveStatMods(skills: Skill[]): Partial<StatBlock> {
  const out: Partial<StatBlock> = {};
  for (const s of skills) {
    if (s.kind !== "statMod" || !s.mods) continue;
    for (const [k, v] of Object.entries(s.mods)) out[k as keyof StatBlock] = (out[k as keyof StatBlock] ?? 0) + (v ?? 0);
  }
  return out;
}

export function hasEffect(skills: Skill[] | undefined, effect: Skill["effect"]): boolean {
  return !!skills?.some((s) => s.kind === "combat" && s.effect === effect);
}
