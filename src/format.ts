// Pure text rendering of a preview result for the headless launcher.
import type { DataBundle, PreviewResult, Matchup } from "./types.ts";

function killLine(m: Matchup): string {
  if (m.roundsToKill === null) return "cannot kill";
  return `${m.hitsToKill} hits, ${m.roundsToKill} rounds to kill`;
}

function matchupBlock(attackerName: string, defenderName: string, m: Matchup): string {
  return [
    `  ${attackerName} vs ${defenderName}:`,
    `    damage ${m.damage} per hit${m.doubles ? " (doubles)" : ""}`,
    `    displayed hit ${m.displayedHit}%, true hit ${m.trueHit}%`,
    `    crit ${m.displayedCrit}%`,
    `    ${killLine(m)}`,
  ].join("\n");
}

export function formatPreview(bundle: DataBundle, r: PreviewResult): string {
  const p = bundle.player.unit.name;
  const e = bundle.enemy.unit.name;
  const mc = r.monteCarlo;
  return [
    `Encounter: ${r.encounterId}`,
    `${p} (${bundle.player.weapon.name}) vs ${e} (${bundle.enemy.weapon.name})`,
    ``,
    `Deterministic breakdown:`,
    matchupBlock(p, e, r.deterministic.playerVsEnemy),
    matchupBlock(e, p, r.deterministic.enemyVsPlayer),
    ``,
    `Monte Carlo (${mc.runs} duels, seed ${mc.seed}):`,
    `  ${p} win rate: ${mc.playerWinRate}%`,
    `  ${e} win rate: ${mc.enemyWinRate}%`,
    `  stalemates: ${mc.stalemates}`,
    `  average rounds to resolve: ${mc.averageRounds}`,
    ``,
    `Note: this is a math preview. It is authoritative for pacing and difficulty`,
    `only, not for engine behavior such as animations, menus, or crashes.`,
  ].join("\n");
}
