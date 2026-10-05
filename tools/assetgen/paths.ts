// Resolve the external tool and per-game ROM/reference paths from the project
// root, with environment overrides. Game detection takes an injectable `exists`
// predicate so it can be tested without touching the filesystem.
import { join } from "node:path";
import { existsSync } from "node:fs";

export const GAMES = ["fe6", "fe7", "fe8"] as const;
export type Game = (typeof GAMES)[number];

const ROM_FILE: Record<Game, string> = {
  fe6: "FE6_clean.gba",
  fe7: "FE7_clean.gba",
  fe8: "FE8_Clean.gba",
};
const ROM_ENV: Record<Game, string> = {
  fe6: "FEA_FE6_ROM",
  fe7: "FEA_FE7_ROM",
  fe8: "FEA_FE8_ROM",
};

export function cliPath(root: string): string {
  return process.env.FEA_FEBUILDER_CLI ?? join(root, "tools/febuilder-cli/FEBuilderGBA.CLI.exe");
}

export function romPath(root: string, game: Game): string {
  return process.env[ROM_ENV[game]] ?? join(root, "base", ROM_FILE[game]);
}

export function referenceDir(root: string): string {
  return join(root, "assets/reference");
}

export function gameDir(root: string, game: Game): string {
  return join(referenceDir(root), game);
}

// Which games have a ROM available. `exists` defaults to a real filesystem check.
export function presentGames(root: string, exists: (p: string) => boolean = existsSync): Game[] {
  return GAMES.filter((g) => exists(romPath(root, g)));
}
