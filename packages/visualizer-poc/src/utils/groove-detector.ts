/**
 * Groove Detection — classifies musical groove from existing audio features.
 *
 * Four groove types, each producing distinct visual character:
 *   pocket:   tight, warm, steady (funk, soul sections)
 *   driving:  fast, bright, forward momentum
 *   floating: near-void, cool, ambient drift
 *   freeform: exploratory, chromatic, unpredictable
 *
 * Uses beatStability, drumOnset, energy, and flatness — no new Python analysis needed.
 */

export type GrooveType = "pocket" | "driving" | "floating" | "freeform";

export interface GrooveState {
  type: GrooveType;
  /** 0-1 confidence in the classification */
  confidence: number;
}

export interface GrooveVisualModifiers {
  /** Color temperature shift: -1 cool, 0 neutral, +1 warm */
  temperatureShift: number;
  /** Motion speed multiplier */
  motionMult: number;
  /** Pattern regularity: 0 = organic, 1 = geometric */
  regularity: number;
  /** Brightness pulse intensity */
  pulseMult: number;
}

/**
 * Classify the current groove from smoothed audio features.
 *
 * @param beatStability  0-1 consistency of beat spacing
 * @param drumOnset      0-1 drum onset transient strength
 * @param energy         0-1 smoothed energy level
 * @param flatness       0-1 spectral flatness (0=tonal, 1=noise)
 */
export function detectGroove(
  beatStability: number,
  drumOnset: number,
  energy: number,
  flatness: number,
): GrooveState {
  // Pocket: tight rhythm, moderate energy, steady beat
  if (beatStability > 0.7 && drumOnset > 0.3 && energy >= 0.12 && energy <= 0.25) {
    const conf = Math.min(1, (beatStability - 0.7) / 0.2 + (drumOnset - 0.3) / 0.3) * 0.5;
    return { type: "pocket", confidence: conf };
  }

  // Driving: strong beat, high energy, active drums
  if (beatStability > 0.6 && energy > 0.25 && drumOnset > 0.4) {
    const conf = Math.min(1, (energy - 0.25) / 0.2 + (drumOnset - 0.4) / 0.3) * 0.5;
    return { type: "driving", confidence: conf };
  }

  // Floating: weak beat, noisy/ambient, low energy
  if (beatStability < 0.4 && flatness > 0.3 && energy < 0.15) {
    const conf = Math.min(1, (0.4 - beatStability) / 0.3 + (flatness - 0.3) / 0.3) * 0.5;
    return { type: "floating", confidence: conf };
  }

  // Freeform: weak beat, moderate+ energy (exploratory jam)
  if (beatStability < 0.3 && energy > 0.15) {
    const conf = Math.min(1, (0.3 - beatStability) / 0.2 + (energy - 0.15) / 0.2) * 0.5;
    return { type: "freeform", confidence: conf };
  }

  // Default: pocket with low confidence
  return { type: "pocket", confidence: 0.2 };
}

/** Visual modifiers for each groove type */
const GROOVE_MODIFIERS: Record<GrooveType, GrooveVisualModifiers> = {
  pocket: {
    temperatureShift: +0.3,
    motionMult: 0.8,
    regularity: 0.7,
    pulseMult: 1.2,
  },
  driving: {
    temperatureShift: +0.1,
    motionMult: 1.6,
    regularity: 0.6,
    pulseMult: 1.8,
  },
  floating: {
    temperatureShift: -0.4,
    motionMult: 0.3,
    regularity: 0.2,
    pulseMult: 0.4,
  },
  freeform: {
    temperatureShift: 0,
    motionMult: 1.0,
    regularity: 0.1,
    pulseMult: 0.8,
  },
};

/** Get visual modifiers for a groove state, scaled by confidence */
export function grooveModifiers(state: GrooveState): GrooveVisualModifiers {
  const base = GROOVE_MODIFIERS[state.type];
  const c = state.confidence;
  return {
    temperatureShift: base.temperatureShift * c,
    motionMult: 1 + (base.motionMult - 1) * c,
    regularity: base.regularity * c,
    pulseMult: 1 + (base.pulseMult - 1) * c,
  };
}
