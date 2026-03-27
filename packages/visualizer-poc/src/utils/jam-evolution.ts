/**
 * Jam Evolution — 4-phase arc detection for extended improvisations.
 *
 * Long jams (10+ minutes) follow a natural arc:
 *   1. Exploration  — sparse, searching, low energy
 *   2. Building     — rising energy, thickening texture
 *   3. Peak Space   — sustained climax, maximum density
 *   4. Resolution   — gradual descent, thinning, return to motif
 *
 * This utility analyzes energy contour over the full song to identify
 * which phase the current frame falls in, enabling visual systems to
 * evolve their character over time rather than looping the same treatment.
 */

import type { EnhancedFrameData, VisualMode } from "../data/types";
import type { SongIdentity } from "../data/song-identities";
import { seededLCG } from "./seededRandom";

export type JamPhase = "exploration" | "building" | "peak_space" | "resolution";

export interface JamEvolution {
  /** Current phase of the jam arc */
  phase: JamPhase;
  /** Progress within the current phase (0-1) */
  phaseProgress: number;
  /** Overall song progress (0-1) */
  songProgress: number;
  /** Whether this is a long jam (10+ min) */
  isLongJam: boolean;
  /** Suggested color temperature shift (-1 cool to +1 warm) */
  colorTemperature: number;
  /** Suggested visual density multiplier (0.5-1.5) */
  densityMult: number;
}

const LONG_JAM_THRESHOLD = 18000; // 10 minutes at 30fps
const DRUMS_SPACE_THRESHOLD = 5400; // 3 minutes — Drums/Space always gets phase evolution
const FPS = 30;

/**
 * Compute the jam evolution state for the current frame.
 * Returns phase, progress, and visual modulation suggestions.
 *
 * @param isDrumsSpace — uses lower threshold (3 min) since Drums/Space
 *   is inherently improvisational and benefits from phase evolution at any length.
 */
export function computeJamEvolution(
  frames: EnhancedFrameData[],
  currentFrame: number,
  isDrumsSpace = false,
): JamEvolution {
  const totalFrames = frames.length;
  const threshold = isDrumsSpace ? DRUMS_SPACE_THRESHOLD : LONG_JAM_THRESHOLD;
  const isLongJam = totalFrames >= threshold;
  const songProgress = Math.min(1, currentFrame / Math.max(1, totalFrames - 1));

  if (!isLongJam) {
    // Short songs: no phase detection, neutral modulation
    return {
      phase: "exploration",
      phaseProgress: songProgress,
      songProgress,
      isLongJam: false,
      colorTemperature: 0,
      densityMult: 1,
    };
  }

  // Compute smoothed energy contour (30-second windows)
  const windowSize = FPS * 30; // 30-second smoothing
  const energyContour = computeEnergyContour(frames, windowSize);

  // Find the peak energy region
  const peakFrame = findPeakRegion(energyContour);
  const peakProgress = peakFrame / Math.max(1, totalFrames - 1);

  // Define phase boundaries based on peak location
  // Exploration: 0 → 30% of pre-peak
  // Building: 30% of pre-peak → peak
  // Peak Space: peak region (±15% of song)
  // Resolution: post-peak → end
  const explorationEnd = peakProgress * 0.3;
  const buildingEnd = peakProgress * 0.85;
  const peakSpaceEnd = Math.min(1, peakProgress + (1 - peakProgress) * 0.35);

  let phase: JamPhase;
  let phaseProgress: number;

  if (songProgress < explorationEnd) {
    phase = "exploration";
    phaseProgress = songProgress / Math.max(0.01, explorationEnd);
  } else if (songProgress < buildingEnd) {
    phase = "building";
    phaseProgress = (songProgress - explorationEnd) / Math.max(0.01, buildingEnd - explorationEnd);
  } else if (songProgress < peakSpaceEnd) {
    phase = "peak_space";
    phaseProgress = (songProgress - buildingEnd) / Math.max(0.01, peakSpaceEnd - buildingEnd);
  } else {
    phase = "resolution";
    phaseProgress = (songProgress - peakSpaceEnd) / Math.max(0.01, 1 - peakSpaceEnd);
  }

  phaseProgress = Math.max(0, Math.min(1, phaseProgress));

  // Color temperature: cool exploration → warm peak → cool resolution
  const colorTemperature = computeColorTemperature(phase, phaseProgress);

  // Visual density: sparse exploration → dense peak → thinning resolution
  const densityMult = computeDensityMult(phase, phaseProgress);

  return {
    phase,
    phaseProgress,
    songProgress,
    isLongJam,
    colorTemperature,
    densityMult,
  };
}

/** Smooth energy contour over a window */
function computeEnergyContour(frames: EnhancedFrameData[], windowSize: number): number[] {
  const contour: number[] = new Array(frames.length);
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < frames.length; i++) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(frames.length - 1, i + halfWindow);
    for (let j = start; j <= end; j++) {
      sum += frames[j].rms;
      count++;
    }
    contour[i] = count > 0 ? sum / count : 0;
  }

  return contour;
}

/** Find the frame index of the peak energy region */
function findPeakRegion(contour: number[]): number {
  let maxVal = -Infinity;
  let maxIdx = 0;
  for (let i = 0; i < contour.length; i++) {
    if (contour[i] > maxVal) {
      maxVal = contour[i];
      maxIdx = i;
    }
  }
  return maxIdx;
}

/** Color temperature by phase: -1 (cool) to +1 (warm) */
function computeColorTemperature(phase: JamPhase, progress: number): number {
  switch (phase) {
    case "exploration":
      return -0.6 + progress * 0.2;       // -0.6 → -0.4 (deep cool, slowly warming)
    case "building":
      return -0.4 + progress * 0.9;       // -0.4 → +0.5 (warming steadily)
    case "peak_space":
      return 0.5 + progress * 0.5;        // +0.5 → +1.0 (scorching hot)
    case "resolution":
      return 1.0 - progress * 1.4;        // +1.0 → -0.4 (cooling down)
  }
}

/** Visual density multiplier by phase */
function computeDensityMult(phase: JamPhase, progress: number): number {
  switch (phase) {
    case "exploration":
      return 0.50 + progress * 0.20;      // sparse: let the shader breathe
    case "building":
      return 0.70 + progress * 0.40;      // filling steadily toward flood
    case "peak_space":
      return 1.20 + progress * 0.30;      // flood: maximum iconic overlay density
    case "resolution":
      return 1.50 - progress * 0.55;      // gradual thinning back to earth
  }
}

// ─── Jam Phase Boundaries ───

export interface JamPhaseBoundaries {
  /** Frame where exploration ends / building begins */
  explorationEnd: number;
  /** Frame where building ends / peak_space begins */
  buildingEnd: number;
  /** Frame where peak_space ends / resolution begins */
  peakSpaceEnd: number;
  /** Total frames */
  totalFrames: number;
}

/**
 * Compute the frame-number boundaries between jam phases.
 * Deterministic for a given frames array — can be memoized per song.
 */
export function getJamPhaseBoundaries(
  frames: EnhancedFrameData[],
  isDrumsSpace = false,
): JamPhaseBoundaries | null {
  const totalFrames = frames.length;
  const threshold = isDrumsSpace ? DRUMS_SPACE_THRESHOLD : LONG_JAM_THRESHOLD;
  if (totalFrames < threshold) return null;

  const windowSize = FPS * 30;
  const energyContour = computeEnergyContour(frames, windowSize);
  const peakFrame = findPeakRegion(energyContour);
  const peakProgress = peakFrame / Math.max(1, totalFrames - 1);

  const explorationEndP = peakProgress * 0.3;
  const buildingEndP = peakProgress * 0.85;
  const peakSpaceEndP = Math.min(1, peakProgress + (1 - peakProgress) * 0.35);

  return {
    explorationEnd: Math.round(explorationEndP * (totalFrames - 1)),
    buildingEnd: Math.round(buildingEndP * (totalFrames - 1)),
    peakSpaceEnd: Math.round(peakSpaceEndP * (totalFrames - 1)),
    totalFrames,
  };
}

// ─── Jam Phase Shader Pools ───
// Each phase maps to shaders that match its emotional character.
// Pools are curated for the Grateful Dead psychedelic experience:
//   exploration: ambient, mysterious, generative — the band is searching
//   building:    flowing, complex, intensifying — energy is rising
//   peak_space:  intense, transcendent, feedback-heavy — the peak moment
//   resolution:  calming, organic, thinning — return to earth

export const JAM_PHASE_SHADER_POOLS: Record<JamPhase, VisualMode[]> = {
  exploration: [
    "deep_ocean", "cosmic_dust", "aurora", "morphogenesis", "void_light",
    "cosmic_voyage", "ink_wash", "aurora_curtains", "volumetric_clouds",
    "volumetric_nebula", "smoke_rings", "coral_reef",
  ],
  building: [
    "liquid_light", "fluid_2d", "reaction_diffusion", "kaleidoscope",
    "neural_web", "warp_field", "plasma_field", "oil_projector",
    "fluid_light", "mycelium_network", "volumetric_smoke",
  ],
  peak_space: [
    "feedback_recursion", "fractal_flames", "electric_arc", "inferno",
    "fractal_zoom", "sacred_geometry", "lava_flow", "solar_flare",
    "climax_surge", "mandala_engine", "tie_dye",
  ],
  resolution: [
    "tie_dye", "stained_glass", "oil_projector", "cosmic_voyage",
    "mycelium_network", "diffraction_rings", "aurora", "deep_ocean",
    "ink_wash", "vintage_film", "voronoi_flow",
  ],
};

/** Numeric encoding of jam phases for GLSL uniforms */
export const JAM_PHASE_INDEX: Record<JamPhase, number> = {
  exploration: 0,
  building: 1,
  peak_space: 2,
  resolution: 3,
};

/**
 * Select a shader mode for a given jam phase.
 * Respects song identity preferred modes (intersects with phase pool).
 * Deterministic via seed — same show seed + phase = same shader.
 */
export function getJamPhaseMode(
  phase: JamPhase,
  seed: number,
  songIdentity?: SongIdentity,
  currentDefault?: VisualMode,
): VisualMode {
  const pool = JAM_PHASE_SHADER_POOLS[phase];
  const rng = seededLCG(seed + JAM_PHASE_INDEX[phase] * 7717);

  // Intersect with song identity preferred modes for coherence
  let candidates: VisualMode[] = pool;
  if (songIdentity?.preferredModes && songIdentity.preferredModes.length > 0) {
    const preferred = new Set(songIdentity.preferredModes);
    const intersection = pool.filter((m) => preferred.has(m));
    if (intersection.length >= 2) {
      // Use intersection but also keep 2 phase-native picks for variety
      const phaseOnly = pool.filter((m) => !preferred.has(m));
      const extraPicks = phaseOnly.slice(0, 2);
      candidates = [...intersection, ...extraPicks];
    }
  }

  // Avoid repeating the current default mode if possible
  if (currentDefault && candidates.length > 1) {
    const filtered = candidates.filter((m) => m !== currentDefault);
    if (filtered.length > 0) candidates = filtered;
  }

  return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * Get all 4 jam phase modes for a song at once (for precomputation).
 * Ensures no two adjacent phases use the same shader.
 */
export function getJamPhaseSequence(
  seed: number,
  songIdentity?: SongIdentity,
  songDefault?: VisualMode,
): Record<JamPhase, VisualMode> {
  const phases: JamPhase[] = ["exploration", "building", "peak_space", "resolution"];
  const result: Partial<Record<JamPhase, VisualMode>> = {};
  let prevMode: VisualMode | undefined = songDefault;

  for (const phase of phases) {
    const mode = getJamPhaseMode(phase, seed, songIdentity, prevMode);
    result[phase] = mode;
    prevMode = mode;
  }

  return result as Record<JamPhase, VisualMode>;
}
