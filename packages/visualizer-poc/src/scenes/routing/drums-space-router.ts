/**
 * Drums/Space shader routing — A+++ curated pools per sub-phase.
 *
 * Drums/Space is the sacred ritual moment of every Dead show. The pools
 * here are not "atmospheric defaults" — they are hand-curated visual
 * counterparts to each musical phase, optimized to feel transcendent
 * rather than suppressed.
 *
 * Quality bar:
 *   - DEPTH (volumetric raymarching, never flat 2D)
 *   - RESTRAINED PALETTES (max 2-3 colors, atmospheric)
 *   - FEELS LIKE A PLACE (cathedral, void, drift)
 *   - NO BUSTED tier (>66ms p95 @ 360p ≈ >2.4s @ 4K — murder during
 *     5-minute Space holds)
 *   - NO banned shaders per shader-quality LAW
 *     (fractal_flames, reaction_diffusion, oil_projector, liquid_light,
 *      acid_melt, plasma_field, creation, combustible_voronoi, tie_dye)
 *
 * Single source of truth — both the manifest-generator (production Rust
 * pipeline) and shader-variety.ts (runtime/Remotion path) consume this.
 */

import type { VisualMode } from "../../data/types";
import { seededLCG as seededRandom } from "../../utils/seededRandom";
import type { SongIdentity } from "../../data/song-identities";
import type { DrumsSpaceSubPhase } from "../../utils/drums-space-phase";

/** Curated shader pools per Drums/Space sub-phase. */
export const DRUMS_SPACE_SHADER_POOLS: Record<DrumsSpaceSubPhase, VisualMode[]> = {
  // DRUMS_TRIBAL — heavy percussion, ritual, geometric.
  // Beat-locked, percussive imagery. Excludes inferno (BUSTED 80ms — at
  // 4K = 2.9s/frame, drums sections of 2-3min would single-handedly
  // bottleneck a 4K render).
  drums_tribal: [
    "mandala_engine",            // sacred geometric mandala, percussive ritual
    "kaleidoscope",              // UV folding, beat-stable
    "electric_arc",              // arcs of light pulse with beats
    "sacred_geometry",           // hex lattice + FFT, ritual feel
    "dance_floor_prism",         // bright Veneta-era ritual prism
    "clockwork_temple",          // tribal gear/temple architecture
  ],

  // TRANSITION — drums thinning, void emerging.
  // Bridge from heat to cold. Atmospheric drift.
  transition: [
    "aurora",
    "nimitz_aurora",
    "aurora_curtains",
    "fractal_temple",
    "stained_glass_dissolution",
  ],

  // SPACE_AMBIENT — pure void, the still center, transcendent.
  // The most sacred moment of the show. Cosmic / void / deep.
  // Excludes memorial_drift (BUSTED 103ms — 5min holds at 4K = stall) and
  // psychedelic_garden (top-3 BUSTED at 353ms).
  space_ambient: [
    "deep_ocean",                // bar-setter, caustics + bioluminescence
    "cosmic_dust",               // atmospheric drift
    "void_light",                // pure void
    "nimitz_aurora",             // bar-setter cosmic drift
    "fractal_temple",            // bar-setter cathedral, accepts any energy
    "honeycomb_cathedral",       // bar-setter geometric depth
    "aurora",                    // soft atmospheric drift
  ],

  // SPACE_TEXTURAL — percussive effects in space.
  // Soft motion + subtle texture. Drift / curtains / dust.
  space_textural: [
    "aurora_curtains",
    "cosmic_dust",
    "void_light",
    "nimitz_aurora",
    "fractal_temple",
  ],

  // SPACE_MELODIC — guitar/keys returning, tonal content.
  // Warmer, more melodic. Intimate void with melody emerging.
  space_melodic: [
    "porch_twilight",            // intimate warm melodic
    "ember_meadow",              // warm melodic emergence
    "aurora",
    "nimitz_aurora",
    "void_light",
    "honeycomb_cathedral",       // bar-setter, tonal returning
  ],

  // REEMERGENCE — band returning, light coming back.
  // Warming up, brightening. Cathedral majesty + pattern returning
  // (echo of drums_tribal closes the ritual arc).
  // Excludes psychedelic_garden, lava_flow (both BUSTED).
  reemergence: [
    "aurora",
    "nimitz_aurora",
    "ember_meadow",
    "fractal_temple",
    "mandala_engine",            // pattern returning, echoes drums_tribal
  ],
};

/** Available GPU blend modes (must match Rust renderer transition.rs). */
export type DrumsSpaceBlendMode = "dissolve" | "additive" | "luminance_key" | "noise_dissolve";

/**
 * Per-phase entry blend mode — when routing first switches into a
 * sub-phase, the GPU blend style reflects the musical character of
 * the entry. These are NOT generic dissolves; they are intentional
 * sacred-ritual transitions:
 *
 *   drums_tribal   → additive       (heat erupting, light layered on)
 *   transition     → dissolve       (soft cooling fade)
 *   space_ambient  → luminance_key  (light dissolving into dark void)
 *   space_textural → dissolve       (soft texture emergence)
 *   space_melodic  → dissolve       (tonal content emerging)
 *   reemergence    → additive       (light returning, band re-blooming)
 */
export const DRUMS_SPACE_ENTRY_BLEND: Record<DrumsSpaceSubPhase, DrumsSpaceBlendMode> = {
  drums_tribal: "additive",
  transition: "dissolve",
  space_ambient: "luminance_key",
  space_textural: "dissolve",
  space_melodic: "dissolve",
  reemergence: "additive",
};

/** Stable per-phase hash for deterministic seeded picks. Avoids the
 *  collision in length-based seeding where space_ambient and space_melodic
 *  (both 13 chars) would share a seed. Returns a non-negative uint32; a
 *  signed `| 0` here propagates negatives through the seed and makes the
 *  LCG output negative, which floors to -1 and indexes pool[-1]. */
function phaseHash(phase: string): number {
  let h = 0;
  for (let i = 0; i < phase.length; i++) {
    h = (h * 31 + phase.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Pick a shader for a Drums/Space sub-phase.
 *
 * Priority:
 *   1. Song identity drumsSpaceShaders[phase] override (curated per song,
 *      gated on activeShaderPool when provided).
 *   2. Pool pick (seeded, deterministic) filtered to activeShaderPool.
 *   3. Pool pick without filter (when no shader survives the filter).
 *   4. Safe fallback (aurora, then cosmic_voyage).
 *
 * @param activeShaderPool When provided, candidates are filtered to this
 *                         set so we never pick a shader that won't render
 *                         in this show (e.g. blocklisted variants).
 */
export function pickDrumsSpaceMode(
  phase: DrumsSpaceSubPhase | string,
  seed: number,
  songIdentity?: SongIdentity,
  activeShaderPool?: ReadonlyArray<string>,
): VisualMode {
  // 1. Song identity override (gated on active pool)
  const identityPick = songIdentity?.drumsSpaceShaders?.[phase as DrumsSpaceSubPhase];
  if (identityPick && (!activeShaderPool || activeShaderPool.includes(identityPick))) {
    return identityPick;
  }

  const pool = DRUMS_SPACE_SHADER_POOLS[phase as DrumsSpaceSubPhase];
  if (!pool || pool.length === 0) {
    // Unknown phase → safe atmospheric default
    if (activeShaderPool?.includes("aurora")) return "aurora";
    return "cosmic_voyage";
  }

  // 2. Filter to active pool when provided
  const filtered = activeShaderPool
    ? pool.filter((m) => activeShaderPool.includes(m))
    : pool;

  // 3. If filter starved the pool, fall back to the unfiltered curated pool
  //    (better to risk a blocklisted shader than to render the wrong feel).
  const finalPool = filtered.length > 0 ? filtered : pool;

  const rng = seededRandom(seed + 31337 + phaseHash(phase) * 17);
  // Defensive clamp: even with normalized rng, never index out of bounds
  // if a future PRNG variant returns negative or ≥1.0.
  const idx = Math.max(0, Math.min(finalPool.length - 1, Math.floor(rng() * finalPool.length)));
  return finalPool[idx];
}

/**
 * Legacy alias — kept for SceneRouter.tsx and existing tests.
 * @deprecated Prefer pickDrumsSpaceMode for the activeShaderPool-aware variant.
 */
export function getDrumsSpaceMode(
  phase: string,
  seed?: number,
  songIdentity?: SongIdentity,
): VisualMode {
  return pickDrumsSpaceMode(phase, seed ?? 0, songIdentity, undefined);
}
