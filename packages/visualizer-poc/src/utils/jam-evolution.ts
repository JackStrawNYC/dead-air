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

import type { EnhancedFrameData } from "../data/types";

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
      return -0.4 + progress * 0.2;       // -0.4 → -0.2 (cool, slowly warming)
    case "building":
      return -0.2 + progress * 0.7;       // -0.2 → +0.5 (warming steadily)
    case "peak_space":
      return 0.5 + progress * 0.3;        // +0.5 → +0.8 (hot)
    case "resolution":
      return 0.8 - progress * 1.0;        // +0.8 → -0.2 (cooling down)
  }
}

/** Visual density multiplier by phase */
function computeDensityMult(phase: JamPhase, progress: number): number {
  switch (phase) {
    case "exploration":
      return 0.85 + progress * 0.10;      // gentle presence from the start
    case "building":
      return 0.90 + progress * 0.20;      // filling steadily
    case "peak_space":
      return 1.10 + progress * 0.15;      // dense, maximum
    case "resolution":
      return 1.25 - progress * 0.30;      // gradual thinning
  }
}
