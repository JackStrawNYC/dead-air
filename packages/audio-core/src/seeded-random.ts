/**
 * Shared PRNG utilities — single source of truth for deterministic randomness.
 *
 * Two algorithms available:
 *   - seeded() — mulberry32, better distribution, preferred for new code
 *   - seededLCG() — linear congruential, used by overlay-rotation/selector
 *
 * Previously duplicated as local `seededRandom()` functions across
 * overlay-rotation.ts, overlay-selector.ts, and SceneRouter.tsx.
 */

/** Mulberry32 PRNG — good distribution, preferred for general use. */
export function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linear congruential PRNG — Lehmer/Park-Miller. Used by overlay scheduling. */
export function seededLCG(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Fisher-Yates shuffle with seeded PRNG. */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  const rng = seeded(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
