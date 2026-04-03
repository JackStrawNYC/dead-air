/**
 * Shader Matcher — automatic shader assignment for setlist songs.
 *
 * Takes song audio analysis features (avg RMS, tempo, energy variance)
 * and returns the best shader from the safe pool. Ensures no two
 * adjacent songs get the same shader.
 *
 * Usage: used by scaffold-show.ts or manual setlist building.
 *
 * Categories:
 *   calm (low RMS, low variance):  aurora, deep_ocean, cosmic_dust, aurora_curtains, crystal_cavern, warm_nebula, coral_reef, ink_wash
 *   energetic (high RMS, fast tempo): tie_dye, inferno, concert_lighting, lava_flow, electric_arc, solar_flare, neon_grid, climax_surge
 *   medium (everything else):       liquid_light, oil_projector, stained_glass, mandala_engine, kaleidoscope, smoke_rings, sacred_geometry, liquid_mandala, voronoi_flow, plasma_field, prism_refraction, spinning_spiral, liquid_projector
 *   psychedelic (high variance, mid RMS): feedback_recursion, fractal_flames, acid_melt, bioluminescence, blacklight_glow, cellular_automata
 */

import type { VisualMode } from "../data/types";

export interface SongAudioProfile {
  /** Average RMS energy across all frames (0-1 typical) */
  avgRms: number;
  /** Tempo in BPM */
  tempo: number;
  /** Standard deviation of RMS energy (higher = more dynamic) */
  energyVariance: number;
  /** Average spectral flatness (0-1, higher = noisier/less tonal) */
  avgFlatness?: number;
}

const CALM_SHADERS: VisualMode[] = [
  "aurora", "deep_ocean", "cosmic_dust", "aurora_curtains", "crystal_cavern",
  "warm_nebula", "coral_reef", "ink_wash", "particle_nebula", "void_light",
  "diffraction_rings", "cosmic_voyage",
];

const ENERGETIC_SHADERS: VisualMode[] = [
  "tie_dye", "inferno", "concert_lighting", "lava_flow", "electric_arc",
  "solar_flare", "neon_grid", "climax_surge", "databend", "neural_web",
  "spectral_analyzer", "fluid_light",
];

const MEDIUM_SHADERS: VisualMode[] = [
  "liquid_light", "oil_projector", "stained_glass", "mandala_engine",
  "kaleidoscope", "smoke_rings", "sacred_geometry", "liquid_mandala",
  "voronoi_flow", "plasma_field", "prism_refraction", "spinning_spiral",
  "liquid_projector", "truchet_tiling", "morphogenesis", "warp_field",
  "lo_fi_grain", "vintage_film", "crystalline_growth",
];

const PSYCHEDELIC_SHADERS: VisualMode[] = [
  "feedback_recursion", "fractal_flames", "acid_melt", "bioluminescence",
  "blacklight_glow", "cellular_automata", "reaction_diffusion",
  "mycelium_network", "signal_decay", "digital_rain",
];

/**
 * Classify a song into a shader energy bucket based on its audio profile.
 */
export function classifySongEnergy(profile: SongAudioProfile): "calm" | "energetic" | "medium" | "psychedelic" {
  const { avgRms, tempo, energyVariance } = profile;

  // High variance + moderate energy = psychedelic (jam-heavy, dynamic)
  if (energyVariance > 0.12 && avgRms > 0.08 && avgRms < 0.25) {
    return "psychedelic";
  }

  // Low energy, slow tempo = calm
  if (avgRms < 0.10 && tempo < 110) {
    return "calm";
  }
  if (avgRms < 0.08) {
    return "calm";
  }

  // High energy OR fast tempo = energetic
  if (avgRms > 0.20 || (avgRms > 0.15 && tempo > 140)) {
    return "energetic";
  }
  if (tempo > 160 && avgRms > 0.12) {
    return "energetic";
  }

  return "medium";
}

/**
 * Get the shader pool for a given energy classification.
 */
export function getShaderPool(energy: "calm" | "energetic" | "medium" | "psychedelic"): VisualMode[] {
  switch (energy) {
    case "calm": return [...CALM_SHADERS];
    case "energetic": return [...ENERGETIC_SHADERS];
    case "psychedelic": return [...PSYCHEDELIC_SHADERS];
    case "medium":
    default: return [...MEDIUM_SHADERS];
  }
}

/**
 * Select the best shader for a song, avoiding the previous song's shader.
 * Uses a simple hash-based selection for deterministic results.
 */
export function matchShader(
  profile: SongAudioProfile,
  songTitle: string,
  previousShader?: VisualMode,
): VisualMode {
  const energy = classifySongEnergy(profile);
  let pool = getShaderPool(energy);

  // Remove previous shader to ensure variety
  if (previousShader) {
    pool = pool.filter((s) => s !== previousShader);
  }

  if (pool.length === 0) {
    // Fallback: use medium pool minus previous
    pool = MEDIUM_SHADERS.filter((s) => s !== previousShader);
  }

  // Deterministic selection based on song title hash
  const hash = simpleHash(songTitle);
  return pool[hash % pool.length];
}

/**
 * Match shaders for an entire setlist, ensuring no adjacent duplicates.
 */
export function matchSetlistShaders(
  songs: Array<{ title: string; profile: SongAudioProfile }>,
): VisualMode[] {
  const result: VisualMode[] = [];

  for (let i = 0; i < songs.length; i++) {
    const { title, profile } = songs[i];
    const prev = i > 0 ? result[i - 1] : undefined;
    result.push(matchShader(profile, title, prev));
  }

  return result;
}

/**
 * Compute a SongAudioProfile from raw analysis frames.
 */
export function computeSongProfile(
  frames: Array<{ rms: number; flatness?: number }>,
  tempo: number,
): SongAudioProfile {
  if (frames.length === 0) {
    return { avgRms: 0.1, tempo, energyVariance: 0.05 };
  }

  const rmsValues = frames.map((f) => f.rms);
  const avgRms = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;

  // Standard deviation of RMS
  const sqDiffs = rmsValues.map((v) => (v - avgRms) ** 2);
  const energyVariance = Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / sqDiffs.length);

  const flatnessValues = frames.map((f) => f.flatness ?? 0).filter((v) => v > 0);
  const avgFlatness = flatnessValues.length > 0
    ? flatnessValues.reduce((a, b) => a + b, 0) / flatnessValues.length
    : undefined;

  return { avgRms, tempo, energyVariance, avgFlatness };
}

/** Simple deterministic hash for string -> number */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
