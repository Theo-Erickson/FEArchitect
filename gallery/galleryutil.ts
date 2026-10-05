// Pure helpers for the gallery server: static path allow-listing, the animation
// cache path, the CLI argument list for an animation export, and request validation.
import { normalize } from "node:path";

export const GAMES = ["fe6", "fe7", "fe8"] as const;

export function staticAllowed(p: string): boolean {
  if (p.includes("..")) return false;
  const n = normalize(p).replace(/\\/g, "/");
  return n.startsWith("gallery/") || n.startsWith("assets/reference/");
}

export function animCacheRel(game: string, id: number, section: number): string {
  return `assets/reference/${game}/anims/${id}_${section}.gif`;
}

export function animArgs(rom: string, id: number, section: number, out: string): string[] {
  return [`--rom=${rom}`, "--export-battle-anime", `--animation-id=${id}`, "--gif", `--section=${section}`, `--out=${out}`];
}

// Every (id, section) pair to export when pre-caching a set of animation ids.
// Sections are 0..sectionCount-1 (12 by default), the same range the gallery shows.
export function animTargets(ids: number[], sectionCount = 12): { id: number; section: number }[] {
  const out: { id: number; section: number }[] = [];
  for (const id of ids) {
    for (let section = 0; section < sectionCount; section++) out.push({ id, section });
  }
  return out;
}

export function validAnimRequest(game: string, id: number, section: number): boolean {
  if (!(GAMES as readonly string[]).includes(game)) return false;
  if (!Number.isInteger(id) || id < 0) return false;
  if (!Number.isInteger(section) || section < 0 || section > 11) return false;
  return true;
}
