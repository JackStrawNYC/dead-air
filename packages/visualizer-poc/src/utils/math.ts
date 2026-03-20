/**
 * Shared math utilities — single source of truth for smoothstep, lerp, clamp.
 *
 * Previously duplicated across overlay-rotation.ts, SceneVideoLayer.tsx,
 * energy.ts, and climax-state.ts. Consolidated here for DRY-ness.
 */

/** Hermite smoothstep: maps x from [edge0, edge1] to [0, 1] with smooth ease. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Simplified smoothstep for a pre-normalized 0-1 input. */
export function smoothstepSimple(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** Linear interpolation between a and b by factor t. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp value to [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Energy gate: smoothstep that suppresses transient effects during quiet passages.
 *  Returns 0 below lo, 1 above hi, smooth Hermite between. */
export function energyGate(energy: number, lo = 0.05, hi = 0.15): number {
  return smoothstep(lo, hi, energy);
}
