/**
 * Stem dominance → shader family mapping.
 *
 * Audit identified that stems were a COSMETIC signal — `stemDominant` weighted
 * existing pools by 2-3x but never picked the shader family. When Phil drops
 * bombs and bass dominates, the visual should become indigo-deep; when Jerry
 * soars on guitar, golden-warmth. This module makes that structural.
 *
 * Two-tier strategy:
 *   • CONFIDENCE > 0.6 (strong dominance): hard-restrict pool to the family.
 *     The musician's signature is unmistakable, so the visuals follow.
 *   • CONFIDENCE 0.0–0.6: existing weighted-bias path in shader-variety.ts
 *     remains in charge — soft hint, not a forced pivot.
 *
 * Song identity (preferredModes) still wins over both — a song's curated
 * visual world is the strongest signal in the system.
 */

import type { VisualMode } from "../../data/types";

export type StemDominant = "jerry" | "phil" | "drums" | "bobby" | "vocals" | "ensemble";

/** Per-musician shader family. All entries are non-blocked, non-BUSTED. */
export const STEM_FAMILY_POOLS: Record<StemDominant, VisualMode[]> = {
  // Jerry Garcia — soaring leads, golden warmth, fluid ascent
  jerry: [
    "aurora",
    "nimitz_aurora",
    "fractal_temple",         // bar-setter, golden cathedral
    "sacred_geometry",
    "honeycomb_cathedral",    // bar-setter, tonal warmth
    "ember_meadow",
  ],

  // Phil Lesh — indigo cosmic depth, bass bombs, fractal complexity
  phil: [
    "deep_ocean",             // bar-setter, depth + caustics
    "cosmic_dust",
    "void_light",
    "dark_star_void",
    "fractal_temple",         // accepts any energy, deep cathedral
    "nimitz_aurora",          // cosmic-leaning aurora
  ],

  // Drums (Mickey + Bill) — tribal geometry, primal rhythm
  drums: [
    "mandala_engine",         // sacred ritual geometry
    "kaleidoscope",           // beat-stable folding
    "electric_arc",           // beat-driven arcs
    "sacred_geometry",        // ritual hex lattice
    "dance_floor_prism",      // bright Veneta-era ritual
    "clockwork_temple",       // tribal architecture
    "concert_lighting",       // Dead-show stage rig — PAR cans + crowd
  ],

  // Bobby Weir — rhythm guitar, grounded amber, steady driving
  bobby: [
    "porch_twilight",         // intimate warm
    "ember_meadow",           // grounded warm
    "fractal_temple",         // bar-setter, structured
    "honeycomb_cathedral",    // bar-setter, tonal grounding
    "aurora",                 // soft warm drift
    "concert_lighting",       // Bobby holds it down — grounded stage feel
    "highway_horizon",        // cowboy songs (Mexicali, Me & My Uncle)
    "desert_cantina",         // bar-room cowboy aesthetic
  ],

  // Vocals (any singer) — human warmth, intimacy
  vocals: [
    "aurora",
    "nimitz_aurora",
    "porch_twilight",
    "fractal_temple",
    "ember_meadow",
    "honeycomb_cathedral",
  ],

  // Ensemble — no single dominant; existing routing handles
  ensemble: [],
};

/** Confidence threshold above which stem dominance HARD-restricts the pool.
 *  Below this, dominance is a soft 2-3x bias (existing shader-variety code). */
export const STEM_HARD_GATE_CONFIDENCE = 0.6;

/** Decide whether stem dominance should restrict the shader pool, and to what.
 *
 * Returns null when no hard gate applies (low confidence, ensemble, or unknown
 * musician). Caller falls back to the existing soft-bias routing.
 */
export function pickStemFamilyPool(
  dominant: StemDominant | string | undefined,
  confidence: number | undefined,
): VisualMode[] | null {
  if (!dominant || dominant === "ensemble") return null;
  if ((confidence ?? 0) < STEM_HARD_GATE_CONFIDENCE) return null;
  const pool = STEM_FAMILY_POOLS[dominant as StemDominant];
  if (!pool || pool.length === 0) return null;
  return pool;
}
