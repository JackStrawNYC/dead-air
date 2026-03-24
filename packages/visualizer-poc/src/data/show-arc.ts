/**
 * Show Arc — 8-phase show narrative with per-phase visual modifiers.
 *
 * Replaces the 4-phase ShowPhase with a refined 8-phase arc that tracks
 * the emotional journey of a Grateful Dead concert:
 *
 *   set1_opening → set1_deepening → set2_opener → set2_deep →
 *   drums_space → post_space → closing → encore
 *
 * Each phase exports visual modifiers that feed into overlay-rotation,
 * EnergyEnvelope, and SceneRouter.
 */

import type { OverlayCategory } from "./types";

// ─── Types ───

export type ShowArcPhase =
  | "set1_opening"     // first 2 songs: warm earth tones, literal overlays
  | "set1_deepening"   // rest of set 1: building complexity
  | "set2_opener"      // first song set 2: bold visual statement
  | "set2_deep"        // mid set 2: abstract, cosmic
  | "drums_space"      // full abstraction, minimal overlays
  | "post_space"       // first 2 after D/S: simpler, rebuilding
  | "closing"          // last 2 before encore: warmth returning
  | "encore";          // set 3: celebration, golden tones

export interface ShowArcModifiers {
  /** Per-category overlay score bias */
  overlayBias: Partial<Record<OverlayCategory, number>>;
  /** Overlay density multiplier */
  densityMult: number;
  /** Rotation window duration multiplier (< 1 = faster rotation, > 1 = slower) */
  windowDurationMult: number;
  /** Additive saturation offset for EnergyEnvelope */
  saturationOffset: number;
  /** Additive brightness offset */
  brightnessOffset: number;
  /** Additive hue shift (degrees) */
  hueShift: number;
  /** Abstraction level: 0.0 = concrete/literal, 1.0 = fully abstract */
  abstractionLevel: number;
}

// ─── Per-Phase Modifiers ───

const PHASE_MODIFIERS: Record<ShowArcPhase, ShowArcModifiers> = {
  set1_opening: {
    overlayBias: {
      character: +0.15,    // bears, skeletons welcome — recognize the vibe
      sacred: +0.05,       // light stealie presence
      reactive: -0.10,     // save the fireworks
      atmospheric: +0.10,  // warm washes
    },
    densityMult: 1.2,
    windowDurationMult: 0.8,  // slightly faster rotation — energy
    saturationOffset: 0.05,
    brightnessOffset: 0.03,
    hueShift: 5,              // warm shift
    abstractionLevel: 0.1,
  },

  set1_deepening: {
    overlayBias: {
      character: -0.15,    // shaders take over — no bears in deepening
      sacred: +0.10,
      geometric: +0.05,
      reactive: 0,
    },
    densityMult: 1.0,
    windowDurationMult: 1.0,
    saturationOffset: 0.02,
    brightnessOffset: 0,
    hueShift: 0,
    abstractionLevel: 0.3,
  },

  set2_opener: {
    overlayBias: {
      sacred: +0.15,
      reactive: +0.10,
      character: +0.15,   // bold re-entry — icons return
      atmospheric: +0.05,
    },
    densityMult: 1.4,           // boosted: lights come back on
    windowDurationMult: 0.9,
    saturationOffset: 0.12,    // boosted: bold visual statement
    brightnessOffset: 0.06,    // boosted: room lights up
    hueShift: -5,              // slight cool shift — deeper territory
    abstractionLevel: 0.4,
  },

  set2_deep: {
    overlayBias: {
      sacred: +0.25,       // mandalas, geometry dominate
      geometric: +0.15,
      nature: +0.15,       // cosmic/nature imagery
      character: -0.30,    // deep abstraction — no characters
    },
    densityMult: 0.7,
    windowDurationMult: 1.5,   // slower rotation — let things breathe
    saturationOffset: -0.03,
    brightnessOffset: -0.02,
    hueShift: -10,             // cool cosmic shift
    abstractionLevel: 0.7,
  },

  drums_space: {
    overlayBias: {
      sacred: +0.40,
      atmospheric: +0.15,
      character: -0.40,
      reactive: -0.30,
      info: -0.50,
      hud: -0.50,
    },
    densityMult: 0.3,
    windowDurationMult: 2.0,   // very slow rotation
    saturationOffset: -0.15,
    brightnessOffset: -0.10,
    hueShift: 15,              // blue shift
    abstractionLevel: 1.0,
  },

  post_space: {
    overlayBias: {
      sacred: +0.15,
      atmospheric: +0.10,
      character: -0.10,    // still abstract, rebuilding slowly
      reactive: -0.15,     // still rebuilding
    },
    densityMult: 0.6,
    windowDurationMult: 1.3,
    saturationOffset: -0.05,
    brightnessOffset: -0.02,
    hueShift: 5,               // warming back up
    abstractionLevel: 0.5,
  },

  closing: {
    overlayBias: {
      character: +0.10,    // warmth returning — bears welcome back
      sacred: +0.10,
      atmospheric: +0.05,
      reactive: -0.05,
    },
    densityMult: 0.9,
    windowDurationMult: 1.1,
    saturationOffset: -0.03,   // bittersweet
    brightnessOffset: 0,
    hueShift: 8,               // warm golden shift
    abstractionLevel: 0.3,
  },

  encore: {
    overlayBias: {
      character: +0.20,    // celebration — all the friends
      sacred: +0.10,
      reactive: +0.05,
      atmospheric: +0.10,  // warm party glow
    },
    densityMult: 1.3,
    windowDurationMult: 0.8,   // fast rotation — party energy
    saturationOffset: 0.06,
    brightnessOffset: 0.04,
    hueShift: 12,              // golden warm
    abstractionLevel: 0.2,
  },
};

// ─── Phase Computation ───

export interface ShowArcInput {
  /** Current song's set number (1, 2, or 3) */
  setNumber: number;
  /** Track number within the set (1-based) */
  trackNumber: number;
  /** Total songs in this set */
  songsInSet: number;
  /** Total songs in the show */
  totalSongs: number;
  /** Songs completed so far (0-based, current song not counted) */
  songsCompleted: number;
  /** Whether this song IS a jam segment (e.g. Drums/Space) */
  isJamSegment: boolean;
  /** Number of songs completed since the jam segment ended */
  postJamSegmentCount: number;
}

/**
 * Compute the show arc phase from song position context.
 */
export function computeShowArcPhase(input: ShowArcInput): ShowArcPhase {
  const { setNumber, trackNumber, songsInSet, isJamSegment, postJamSegmentCount } = input;

  // Jam segment (e.g. Drums/Space) always gets its own phase
  if (isJamSegment) return "drums_space";

  // Post-jam: first 2 songs after jam segment
  if (postJamSegmentCount > 0 && postJamSegmentCount <= 2) return "post_space";

  // Encore (set 3+)
  if (setNumber >= 3) return "encore";

  // Set 1
  if (setNumber === 1) {
    if (trackNumber <= 2) return "set1_opening";
    if (trackNumber >= songsInSet - 1) return "closing";  // last 2 of set 1
    return "set1_deepening";
  }

  // Set 2
  if (setNumber === 2) {
    if (trackNumber === 1) return "set2_opener";
    if (trackNumber >= songsInSet - 1) return "closing";  // last 2 of set 2
    return "set2_deep";
  }

  return "set1_deepening"; // fallback
}

/**
 * Get the visual modifiers for a given show arc phase.
 */
export function getShowArcModifiers(phase: ShowArcPhase): ShowArcModifiers {
  return PHASE_MODIFIERS[phase];
}
