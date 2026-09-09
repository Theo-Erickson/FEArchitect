// Seeded pseudo random number generator so every playtest is replayable.
// mulberry32: a small, fast, well distributed 32 bit PRNG. The specific
// algorithm does not matter for game fidelity, only that it is seeded and
// deterministic. Fidelity comes from roll2RN below, which mirrors the GBA
// two random number (2RN) hit check.

export interface Rng {
  // Returns an integer in 0..99 inclusive, matching NextRN_100 in the decomp.
  next100(): number;
}

export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  function nextFloat(): number {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next100(): number {
      return Math.floor(nextFloat() * 100);
    },
  };
}

// 2RN hit determination, ported from the GBA behavior used by Roll2RN, which
// is reached via BattleRoll2RN in fireemblem8u/src/bmbattle.c. Two rolls in
// 0..99 are averaged with integer division and compared against the displayed
// hit rate. A displayed rate of 0 never hits, 100 always hits.
export function roll2RN(displayedHit: number, rng: Rng): boolean {
  if (displayedHit <= 0) return false;
  if (displayedHit >= 100) return true;
  const roll = Math.floor((rng.next100() + rng.next100()) / 2);
  return roll < displayedHit;
}
