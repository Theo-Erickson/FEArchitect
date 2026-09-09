import type { DataBundle, PreviewResult } from "./types.ts";
import { buildDeterministic, runMonteCarlo, type MonteCarloOptions } from "./combat.ts";

export function buildPreview(bundle: DataBundle, mc: MonteCarloOptions): PreviewResult {
  return {
    encounterId: bundle.encounter.id,
    deterministic: buildDeterministic(bundle.player, bundle.enemy),
    monteCarlo: runMonteCarlo(bundle.player, bundle.enemy, mc),
  };
}
