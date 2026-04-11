/**
 * Visual Memory — tracks the accumulated visual character of a show
 * to steer toward underrepresented visual regions.
 *
 * Each shader contributes a visual "fingerprint" in a multi-dimensional
 * space: warmth, density, geometry type, motion speed, color saturation.
 * The memory accumulates these over time and reports which dimensions
 * are underrepresented, enabling the routing system to diversify.
 *
 * After 90 minutes of warm fractals, the system will actively steer
 * toward cool, geometric, sparse aesthetics — even if energy analysis
 * would normally suggest more fractals.
 */

import type { VisualMode } from "../data/types";
import { SCENE_REGISTRY, type SpectralFamily } from "../scenes/scene-registry";

// ─── Types ───

/** Visual fingerprint dimensions */
export interface VisualFingerprint {
  /** Color warmth (-1 cool to +1 warm) */
  warmth: number;
  /** Visual density (0 sparse to 1 dense) */
  density: number;
  /** Geometry type (0 organic/fluid to 1 geometric/structured) */
  geometricness: number;
  /** Motion speed (0 still to 1 fast) */
  motionSpeed: number;
  /** Color saturation (0 desaturated to 1 vivid) */
  saturation: number;
  /** Abstraction level (0 representational to 1 abstract) */
  abstraction: number;
}

/** Accumulated visual memory state */
export interface VisualMemoryState {
  /** Running weighted average of visual fingerprints seen */
  accumulated: VisualFingerprint;
  /** Total weight accumulated (for averaging) */
  totalWeight: number;
  /** Per-dimension exposure count (how many minutes spent in each region) */
  exposure: VisualFingerprint;
}

/** All fingerprint dimension keys */
export const FINGERPRINT_DIMENSIONS: (keyof VisualFingerprint)[] = [
  "warmth",
  "density",
  "geometricness",
  "motionSpeed",
  "saturation",
  "abstraction",
];

// ─── Fingerprint Defaults by Spectral Family ───

const SPECTRAL_FAMILY_DEFAULTS: Record<SpectralFamily, Partial<VisualFingerprint>> = {
  warm: { warmth: 0.6, saturation: 0.6 },
  bright: { warmth: 0.3, saturation: 0.8 },
  textural: { geometricness: 0.3, density: 0.7 },
  tonal: { warmth: 0.0, abstraction: 0.6 },
  cosmic: { warmth: -0.4, abstraction: 0.8 },
};

// ─── Energy Affinity Defaults ───

const ENERGY_AFFINITY_DEFAULTS: Record<"low" | "mid" | "high" | "any", Partial<VisualFingerprint>> = {
  low: { motionSpeed: 0.2, density: 0.3 },
  mid: { motionSpeed: 0.5, density: 0.5 },
  high: { motionSpeed: 0.8, density: 0.8 },
  any: { motionSpeed: 0.5, density: 0.5 },
};

// ─── Per-Shader Overrides ───
// Specific shaders that have a strong visual identity beyond what
// spectralFamily + energyAffinity can express.

const SHADER_OVERRIDES: Partial<Record<VisualMode, Partial<VisualFingerprint>>> = {
  // Explicitly called out in spec
  fractal_temple: { geometricness: 0.9, abstraction: 0.7 },
  liquid_light: { geometricness: 0.1, warmth: 0.5 },
  cosmic_voyage: { abstraction: 0.9, warmth: -0.3 },
  inferno: { warmth: 0.8, motionSpeed: 0.9 },
  deep_ocean: { warmth: -0.6, motionSpeed: 0.3 },
  aurora: { warmth: -0.2, abstraction: 0.5 },

  // Additional overrides for strong visual identities
  tie_dye: { saturation: 0.9, warmth: 0.4, geometricness: 0.1 },
  sacred_geometry: { geometricness: 0.95, abstraction: 0.8, motionSpeed: 0.2 },
  kaleidoscope: { geometricness: 0.8, saturation: 0.7, abstraction: 0.6 },
  mandala_engine: { geometricness: 0.85, abstraction: 0.7 },
  truchet_tiling: { geometricness: 0.95, abstraction: 0.5, motionSpeed: 0.3 },
  stark_minimal: { density: 0.1, saturation: 0.2, motionSpeed: 0.1 },
  void_light: { density: 0.2, warmth: -0.5, abstraction: 0.9 },
  climax_surge: { motionSpeed: 0.95, density: 0.9, saturation: 0.9 },
  lava_flow: { warmth: 0.9, density: 0.7, motionSpeed: 0.6 },
  ink_wash: { saturation: 0.1, density: 0.4, warmth: -0.1 },
  storm: { warmth: -0.3, motionSpeed: 0.7, density: 0.6 },
  campfire: { warmth: 0.7, density: 0.4, motionSpeed: 0.2 },
  rain_street: { warmth: -0.2, saturation: 0.3, motionSpeed: 0.3 },
  electric_arc: { motionSpeed: 0.9, saturation: 0.8, warmth: -0.1 },
  reaction_diffusion: { geometricness: 0.4, abstraction: 0.7, motionSpeed: 0.3 },
  feedback_recursion: { abstraction: 0.8, density: 0.6, motionSpeed: 0.4 },
  digital_rain: { geometricness: 0.7, saturation: 0.5, warmth: -0.3 },
  neon_grid: { geometricness: 0.9, saturation: 0.9, warmth: -0.1 },
  star_nest: { warmth: -0.5, abstraction: 0.85, density: 0.5 },
  protean_clouds: { density: 0.6, abstraction: 0.7, motionSpeed: 0.4 },
  oil_projector: { warmth: 0.5, density: 0.6, geometricness: 0.15 },
  smoke_rings: { density: 0.5, motionSpeed: 0.3, abstraction: 0.6 },
  fractal_flames: { warmth: 0.6, density: 0.8, motionSpeed: 0.7, abstraction: 0.6 },
  morphogenesis: { geometricness: 0.5, abstraction: 0.7, motionSpeed: 0.4 },
  neural_web: { geometricness: 0.6, density: 0.7, motionSpeed: 0.6 },
  coral_reef: { warmth: 0.3, density: 0.7, saturation: 0.7 },
  solar_flare: { warmth: 0.7, motionSpeed: 0.85, saturation: 0.8 },
  bioluminescence: { warmth: -0.2, saturation: 0.8, density: 0.6 },
  cellular_automata: { geometricness: 0.8, abstraction: 0.6, motionSpeed: 0.5 },
  acid_melt: { saturation: 0.8, warmth: 0.4, geometricness: 0.1, motionSpeed: 0.6 },
  blacklight_glow: { saturation: 0.9, warmth: -0.1, density: 0.5 },
  spinning_spiral: { geometricness: 0.7, motionSpeed: 0.7, abstraction: 0.6 },
  liquid_projector: { warmth: 0.5, density: 0.6, geometricness: 0.1 },
  concert_lighting: { warmth: 0.2, saturation: 0.7, motionSpeed: 0.7, abstraction: 0.2 },
  flower_field: { warmth: 0.4, saturation: 0.8, density: 0.6, abstraction: 0.1 },
  forest: { warmth: 0.1, saturation: 0.5, density: 0.7, abstraction: 0.1 },
  river: { warmth: 0.0, motionSpeed: 0.4, abstraction: 0.2 },
  ocean: { warmth: -0.3, motionSpeed: 0.5, abstraction: 0.3 },
  desert_road: { warmth: 0.5, density: 0.3, saturation: 0.5, abstraction: 0.1 },
  mountain_fire: { warmth: 0.6, density: 0.5, motionSpeed: 0.5 },
};

// ─── Fingerprint Cache ───

const fingerprintCache = new Map<VisualMode, VisualFingerprint>();

// ─── Base Fingerprint ───

const BASE_FINGERPRINT: VisualFingerprint = {
  warmth: 0,
  density: 0.5,
  geometricness: 0.5,
  motionSpeed: 0.5,
  saturation: 0.5,
  abstraction: 0.5,
};

// ─── Public API ───

/**
 * Get the visual fingerprint for a shader mode.
 *
 * Builds from three layers:
 *   1. Base defaults (neutral center)
 *   2. spectralFamily defaults from scene-registry
 *   3. energyAffinity defaults from scene-registry
 *   4. Per-shader overrides (strongest signal)
 */
export function getShaderFingerprint(mode: VisualMode): VisualFingerprint {
  const cached = fingerprintCache.get(mode);
  if (cached) return cached;

  // Start with base
  const fp: VisualFingerprint = { ...BASE_FINGERPRINT };

  // Layer 1: spectralFamily defaults
  const entry = SCENE_REGISTRY[mode];
  if (entry?.spectralFamily) {
    const familyDefaults = SPECTRAL_FAMILY_DEFAULTS[entry.spectralFamily];
    if (familyDefaults) {
      Object.assign(fp, familyDefaults);
    }
  }

  // Layer 2: energyAffinity defaults
  if (entry) {
    const energyDefaults = ENERGY_AFFINITY_DEFAULTS[entry.energyAffinity];
    if (energyDefaults) {
      // Only apply motion/density from energy — don't overwrite spectral warmth/saturation
      if (energyDefaults.motionSpeed !== undefined) fp.motionSpeed = energyDefaults.motionSpeed;
      if (energyDefaults.density !== undefined) fp.density = energyDefaults.density;
    }
  }

  // Layer 3: per-shader overrides (strongest signal)
  const overrides = SHADER_OVERRIDES[mode];
  if (overrides) {
    for (const dim of FINGERPRINT_DIMENSIONS) {
      if (overrides[dim] !== undefined) {
        fp[dim] = overrides[dim]!;
      }
    }
  }

  fingerprintCache.set(mode, fp);
  return fp;
}

/** Create initial empty memory state */
export function createInitialMemory(): VisualMemoryState {
  return {
    accumulated: {
      warmth: 0,
      density: 0,
      geometricness: 0,
      motionSpeed: 0,
      saturation: 0,
      abstraction: 0,
    },
    totalWeight: 0,
    exposure: {
      warmth: 0,
      density: 0,
      geometricness: 0,
      motionSpeed: 0,
      saturation: 0,
      abstraction: 0,
    },
  };
}

/**
 * Update memory with a shader that was shown for `durationFrames`.
 *
 * Weight is proportional to duration (in minutes at 30fps).
 * Returns a new state object (immutable update).
 */
export function updateVisualMemory(
  state: VisualMemoryState,
  mode: VisualMode,
  durationFrames: number,
): VisualMemoryState {
  const fp = getShaderFingerprint(mode);
  const FPS = 30;
  const weight = durationFrames / (FPS * 60); // weight in minutes

  if (weight <= 0) return state;

  const newTotalWeight = state.totalWeight + weight;

  // Running weighted average: new_avg = (old_avg * old_weight + new_fp * new_weight) / total_weight
  const newAccumulated: VisualFingerprint = { ...state.accumulated };
  const newExposure: VisualFingerprint = { ...state.exposure };

  for (const dim of FINGERPRINT_DIMENSIONS) {
    newAccumulated[dim] =
      (state.accumulated[dim] * state.totalWeight + fp[dim] * weight) / newTotalWeight;

    // Exposure tracks how much time was spent in each region.
    // For dimensions with range [-1, 1] (warmth), we track absolute magnitude.
    // For dimensions with range [0, 1], we track the value directly.
    // High values add to the "high" region, low values add to the "low" region.
    // We accumulate the absolute distance from center as exposure.
    const center = dim === "warmth" ? 0 : 0.5;
    const distFromCenter = Math.abs(fp[dim] - center);
    newExposure[dim] = state.exposure[dim] + distFromCenter * weight;
  }

  return {
    accumulated: newAccumulated,
    totalWeight: newTotalWeight,
    exposure: newExposure,
  };
}

/**
 * Get the most underrepresented visual dimension.
 *
 * Returns the dimension with the lowest accumulated exposure relative
 * to total weight. This tells the routing system which visual quality
 * the audience has seen the least of.
 */
export function getUnderrepresentedDimension(
  state: VisualMemoryState,
): keyof VisualFingerprint {
  if (state.totalWeight === 0) {
    // No data yet — all dimensions equally underrepresented.
    // Return the first dimension as a deterministic fallback.
    return "warmth";
  }

  let minDim: keyof VisualFingerprint = "warmth";
  let minExposure = Infinity;

  for (const dim of FINGERPRINT_DIMENSIONS) {
    // Normalize by total weight to get exposure-per-minute
    const normalized = state.exposure[dim] / state.totalWeight;
    if (normalized < minExposure) {
      minExposure = normalized;
      minDim = dim;
    }
  }

  return minDim;
}

/**
 * Score a candidate shader by how much it would diversify the visual memory.
 *
 * Computes Euclidean distance between the candidate's fingerprint and the
 * accumulated average. Shaders that are far from what's been shown get a
 * high score.
 *
 * Returns 0-1, where higher = more novel relative to what's been shown.
 */
export function scoreDiversityBonus(
  state: VisualMemoryState,
  candidateMode: VisualMode,
): number {
  if (state.totalWeight === 0) {
    // No memory yet — all candidates equally novel.
    return 0.5;
  }

  const fp = getShaderFingerprint(candidateMode);
  const avg = state.accumulated;

  // Euclidean distance in the fingerprint space.
  // Each dimension is normalized to roughly [0, 1] range (warmth [-1,1] has range 2).
  let sumSqDist = 0;
  for (const dim of FINGERPRINT_DIMENSIONS) {
    const range = dim === "warmth" ? 2.0 : 1.0; // warmth has [-1, +1] range
    const normalizedDiff = (fp[dim] - avg[dim]) / range;
    sumSqDist += normalizedDiff * normalizedDiff;
  }

  const distance = Math.sqrt(sumSqDist / FINGERPRINT_DIMENSIONS.length);

  // Clamp to [0, 1]. Max theoretical distance is 1.0 (opposite corners of
  // the normalized unit hypercube), but in practice 0.7+ is very diverse.
  return Math.min(1, distance);
}

/**
 * Clear the fingerprint cache. Useful for testing.
 */
export function _clearFingerprintCache(): void {
  fingerprintCache.clear();
}
