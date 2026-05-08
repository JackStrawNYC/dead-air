/**
 * Semantic Router — maps CLAP semantic scores to visual preferences.
 *
 * Transforms 8 semantic scalars (psychedelic, aggressive, tender, cosmic,
 * rhythmic, ambient, chaotic, triumphant) into shader preferences,
 * overlay biases, color temperature, and motion intensity.
 *
 * All inputs optional — gracefully returns neutral profile when no
 * semantic data is available.
 */

import type { VisualMode } from "../data/types";

// ─── Types ───

export interface SemanticScores {
  psychedelic: number;
  aggressive: number;
  tender: number;
  cosmic: number;
  rhythmic: number;
  ambient: number;
  chaotic: number;
  triumphant: number;
}

export interface SemanticProfile {
  /** Dominant semantic category (highest score) */
  dominant: keyof SemanticScores | null;
  /** Confidence of the dominant category (0-1) */
  dominantConfidence: number;
  /** Preferred shader modes, weighted by semantic affinity */
  preferredShaders: VisualMode[];
  /** Overlay category biases: positive = boost, negative = suppress */
  overlayBiases: Record<string, number>;
  /** Color temperature shift: -1 cold, 0 neutral, +1 warm */
  colorTemperature: number;
  /** Motion intensity multiplier: 0.5 = subdued, 1 = normal, 1.5 = intense */
  motionIntensity: number;
}

// ─── Semantic → Shader Mappings ───
// All entries are post-blocklist + non-BUSTED. The prior pools heavily relied
// on cosmic_voyage / protean_clouds (now blocked) and inferno (BUSTED 80ms),
// which made semantic routing largely redirect to the safe-default.
export const SEMANTIC_SHADERS: Record<keyof SemanticScores, VisualMode[]> = {
  psychedelic: ["fractal_temple", "kaleidoscope", "sacred_geometry", "mandala_engine", "honeycomb_cathedral"],
  aggressive:  ["electric_arc", "dance_floor_prism", "clockwork_temple", "mandala_engine", "kaleidoscope"],
  tender:      ["porch_twilight", "ember_meadow", "aurora", "nimitz_aurora", "honeycomb_cathedral"],
  cosmic:      ["deep_ocean", "cosmic_dust", "void_light", "dark_star_void", "fractal_temple", "nimitz_aurora"],
  rhythmic:    ["mandala_engine", "kaleidoscope", "electric_arc", "sacred_geometry", "dance_floor_prism"],
  ambient:     ["cosmic_dust", "void_light", "deep_ocean", "nimitz_aurora", "aurora"],
  chaotic:     ["fractal_temple", "electric_arc", "mandala_engine", "kaleidoscope", "stained_glass_dissolution"],
  triumphant:  ["fractal_temple", "dance_floor_prism", "sacred_geometry", "ember_meadow", "honeycomb_cathedral"],
};

// ─── Semantic → Overlay Category Biases ───

const SEMANTIC_OVERLAY_BIASES: Record<keyof SemanticScores, Record<string, number>> = {
  psychedelic: { sacred: 0.3, geometric: 0.2, reactive: 0.1 },
  aggressive: { reactive: 0.3, distortion: 0.2, geometric: 0.1 },
  tender: { atmospheric: 0.3, nature: 0.2, sacred: 0.1 },
  cosmic: { atmospheric: 0.3, sacred: 0.2, nature: 0.1 },
  rhythmic: { reactive: 0.2, geometric: 0.2, character: 0.1 },
  ambient: { atmospheric: 0.3, nature: 0.2, sacred: 0.1 },
  chaotic: { distortion: 0.3, reactive: 0.2, geometric: 0.1 },
  triumphant: { sacred: 0.3, character: 0.2, reactive: 0.1 },
};

// ─── Semantic → Color Temperature ───

const SEMANTIC_COLOR_TEMP: Record<keyof SemanticScores, number> = {
  psychedelic: 0.2,    // slightly warm
  aggressive: 0.4,     // warm/hot
  tender: 0.3,         // warm
  cosmic: -0.3,        // cool
  rhythmic: 0.0,       // neutral
  ambient: -0.2,       // slightly cool
  chaotic: 0.1,        // slightly warm
  triumphant: 0.3,     // warm
};

// ─── Semantic → Motion Intensity ───

const SEMANTIC_MOTION: Record<keyof SemanticScores, number> = {
  psychedelic: 1.3,
  aggressive: 1.4,
  tender: 0.6,
  cosmic: 0.8,
  rhythmic: 1.2,
  ambient: 0.5,
  chaotic: 1.5,
  triumphant: 1.3,
};

// ─── Export ───

/**
 * Compute a semantic visual profile from CLAP scores.
 *
 * Gracefully returns neutral profile when scores are all zero or absent.
 * When a dominant category has confidence > 0.4, its preferences are applied.
 */
export function computeSemanticProfile(
  scores: Partial<SemanticScores>,
): SemanticProfile {
  const NEUTRAL: SemanticProfile = {
    dominant: null,
    dominantConfidence: 0,
    preferredShaders: [],
    overlayBiases: {},
    colorTemperature: 0,
    motionIntensity: 1,
  };

  // Build full scores with defaults
  const full: SemanticScores = {
    psychedelic: scores.psychedelic ?? 0,
    aggressive: scores.aggressive ?? 0,
    tender: scores.tender ?? 0,
    cosmic: scores.cosmic ?? 0,
    rhythmic: scores.rhythmic ?? 0,
    ambient: scores.ambient ?? 0,
    chaotic: scores.chaotic ?? 0,
    triumphant: scores.triumphant ?? 0,
  };

  // Find dominant category
  let dominant: keyof SemanticScores | null = null;
  let maxScore = 0;
  for (const [key, value] of Object.entries(full)) {
    if (value > maxScore) {
      maxScore = value;
      dominant = key as keyof SemanticScores;
    }
  }

  if (!dominant || maxScore < 0.1) return NEUTRAL;

  // Compute weighted shader preferences
  // Primary dominant gets its shaders; secondary (>0.3) adds at lower weight
  const shaderSet = new Set<VisualMode>();
  const shaderList: VisualMode[] = [];

  // Add dominant shaders first (2x weight)
  for (const mode of SEMANTIC_SHADERS[dominant]) {
    shaderSet.add(mode);
    shaderList.push(mode);
    shaderList.push(mode); // 2x weight
  }

  // Add secondary category shaders (1x weight) if confidence > 0.3
  for (const [key, value] of Object.entries(full)) {
    if (key === dominant || value < 0.3) continue;
    for (const mode of SEMANTIC_SHADERS[key as keyof SemanticScores]) {
      if (!shaderSet.has(mode)) {
        shaderSet.add(mode);
        shaderList.push(mode);
      }
    }
  }

  // Compute weighted overlay biases
  const overlayBiases: Record<string, number> = {};
  for (const [key, value] of Object.entries(full)) {
    if (value < 0.2) continue;
    const biases = SEMANTIC_OVERLAY_BIASES[key as keyof SemanticScores];
    for (const [category, bias] of Object.entries(biases)) {
      overlayBiases[category] = (overlayBiases[category] ?? 0) + bias * value;
    }
  }

  // Compute weighted color temperature and motion
  let colorTemp = 0;
  let motion = 0;
  let totalWeight = 0;
  for (const [key, value] of Object.entries(full)) {
    if (value < 0.1) continue;
    colorTemp += SEMANTIC_COLOR_TEMP[key as keyof SemanticScores] * value;
    motion += SEMANTIC_MOTION[key as keyof SemanticScores] * value;
    totalWeight += value;
  }

  if (totalWeight > 0) {
    colorTemp /= totalWeight;
    motion /= totalWeight;
  } else {
    motion = 1;
  }

  return {
    dominant,
    dominantConfidence: maxScore,
    preferredShaders: shaderList,
    overlayBiases,
    colorTemperature: Math.max(-1, Math.min(1, colorTemp)),
    motionIntensity: Math.max(0.5, Math.min(1.5, motion)),
  };
}

/**
 * Extract semantic scores from an AudioSnapshot's semantic fields.
 * Returns null if no semantic data is available.
 */
export function extractSemanticScores(snapshot: {
  semanticPsychedelic?: number;
  semanticAggressive?: number;
  semanticTender?: number;
  semanticCosmic?: number;
  semanticRhythmic?: number;
  semanticAmbient?: number;
  semanticChaotic?: number;
  semanticTriumphant?: number;
}): SemanticScores | null {
  // Check if any semantic data exists
  const hasAny = (snapshot.semanticPsychedelic ?? 0) > 0
    || (snapshot.semanticAggressive ?? 0) > 0
    || (snapshot.semanticTender ?? 0) > 0
    || (snapshot.semanticCosmic ?? 0) > 0
    || (snapshot.semanticRhythmic ?? 0) > 0
    || (snapshot.semanticAmbient ?? 0) > 0
    || (snapshot.semanticChaotic ?? 0) > 0
    || (snapshot.semanticTriumphant ?? 0) > 0;

  if (!hasAny) return null;

  return {
    psychedelic: snapshot.semanticPsychedelic ?? 0,
    aggressive: snapshot.semanticAggressive ?? 0,
    tender: snapshot.semanticTender ?? 0,
    cosmic: snapshot.semanticCosmic ?? 0,
    rhythmic: snapshot.semanticRhythmic ?? 0,
    ambient: snapshot.semanticAmbient ?? 0,
    chaotic: snapshot.semanticChaotic ?? 0,
    triumphant: snapshot.semanticTriumphant ?? 0,
  };
}

/** Confidence threshold above which CLAP semantic dominance HARD-restricts
 *  the shader pool. The audit identified semantic as cosmetic (postprocess
 *  saturation only); this gate makes it structural at strong confidence
 *  while keeping the existing soft-bias path active below threshold. */
export const SEMANTIC_HARD_GATE_CONFIDENCE = 0.55;

/** Decide whether semantic dominance should restrict the shader pool.
 *  Returns null when confidence is below threshold or there's no clear
 *  dominant — caller falls back to the existing soft-bias routing.
 *
 *  Intentionally a bit higher than the stem hard-gate (0.6 vs 0.55) because
 *  CLAP scores are noisier than stem-energy ratios, so we want a slightly
 *  stronger signal before forcing a pivot. */
export function pickSemanticHardGate(
  profile: SemanticProfile,
): VisualMode[] | null {
  if (!profile.dominant) return null;
  if (profile.dominantConfidence < SEMANTIC_HARD_GATE_CONFIDENCE) return null;
  // Pull the SOURCE pool (not the weighted-list `preferredShaders`), so we
  // get distinct candidates without the 2x stuffing meant for soft-bias.
  const pool = SEMANTIC_SHADERS[profile.dominant];
  return pool && pool.length > 0 ? pool : null;
}
