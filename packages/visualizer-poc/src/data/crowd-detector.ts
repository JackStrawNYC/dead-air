/**
 * Crowd Noise Detection — identifies crowd energy moments.
 *
 * Detects 4 types of crowd events:
 *   applause: sustained crowd noise (high flatness, moderate RMS, sparse onsets)
 *   roar:     energy jump >40% in <60 frames from moderate baseline
 *   holy_shit: energy spike >40% from LOW baseline — the jaw-drop moments
 *   singalong: sustained moderate energy + high chroma stability for 90+ frames
 */

import type { EnhancedFrameData } from "./types";

export type CrowdEventType = "applause" | "roar" | "holy_shit" | "singalong";

export interface CrowdMoment {
  /** First frame of crowd noise (inclusive) */
  frameStart: number;
  /** Last frame of crowd noise (exclusive) */
  frameEnd: number;
  /** Average intensity (0-1) */
  avgIntensity: number;
  /** Type of crowd event */
  type: CrowdEventType;
  /** Frame of peak intensity within this moment */
  peakFrame: number;
  /** Peak intensity value (0-1) */
  peakIntensity: number;
}

const MIN_DURATION = 30; // ~1 second at 30fps
const FLATNESS_THRESHOLD = 0.15;
const RMS_THRESHOLD = 0.1;
const ONSET_SPARSITY_WINDOW = 15; // check onsets in ±15 frame window
const MAX_ONSET_DENSITY = 0.3; // max 30% of frames with strong onsets

// Roar detection
const ROAR_WINDOW = 60;        // 2 seconds
const ROAR_ENERGY_JUMP = 0.40; // 40% energy increase

// Holy shit detection
const HOLY_SHIT_WINDOW = 60;
const HOLY_SHIT_ENERGY_JUMP = 0.40;
const HOLY_SHIT_LOW_BASELINE = 0.12; // baseline must be below this

// Singalong detection
const SINGALONG_MIN_DURATION = 90; // 3 seconds
const SINGALONG_ENERGY_MIN = 0.08;
const SINGALONG_ENERGY_MAX = 0.25;

/**
 * Scan all frames and return crowd noise moments.
 * Called once per song via useMemo — O(n) single pass + event-specific detection.
 */
export function detectCrowdMoments(frames: EnhancedFrameData[]): CrowdMoment[] {
  const moments: CrowdMoment[] = [];

  // ─── Pass 1: Applause detection (original algorithm) ───
  let momentStart = -1;
  let intensitySum = 0;
  let count = 0;
  let peakFrame = 0;
  let peakIntensity = 0;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const isCrowdFrame = f.flatness > FLATNESS_THRESHOLD && f.rms > RMS_THRESHOLD;

    // Check onset sparsity — crowd noise has few sharp transients
    let onsetCount = 0;
    let windowSize = 0;
    if (isCrowdFrame) {
      for (let j = Math.max(0, i - ONSET_SPARSITY_WINDOW); j <= Math.min(frames.length - 1, i + ONSET_SPARSITY_WINDOW); j++) {
        windowSize++;
        if (frames[j].onset > 0.5) onsetCount++;
      }
    }
    const sparseOnsets = windowSize > 0 ? (onsetCount / windowSize) < MAX_ONSET_DENSITY : true;

    if (isCrowdFrame && sparseOnsets) {
      if (momentStart === -1) {
        momentStart = i;
        intensitySum = 0;
        count = 0;
        peakFrame = i;
        peakIntensity = 0;
      }
      intensitySum += f.rms;
      count++;
      if (f.rms > peakIntensity) {
        peakIntensity = f.rms;
        peakFrame = i;
      }
    } else {
      if (momentStart !== -1 && count >= MIN_DURATION) {
        moments.push({
          frameStart: momentStart,
          frameEnd: i,
          avgIntensity: intensitySum / count,
          type: "applause",
          peakFrame,
          peakIntensity,
        });
      }
      momentStart = -1;
    }
  }

  // Handle moment extending to end of track
  if (momentStart !== -1 && count >= MIN_DURATION) {
    moments.push({
      frameStart: momentStart,
      frameEnd: frames.length,
      avgIntensity: intensitySum / count,
      type: "applause",
      peakFrame,
      peakIntensity,
    });
  }

  // ─── Pass 2: Roar + Holy Shit detection (energy jump events) ───
  // Pre-compute rolling energy baseline (90-frame window)
  const BASELINE_WINDOW = 90;
  for (let i = ROAR_WINDOW; i < frames.length; i++) {
    // Compute baseline energy (average before the window)
    let baseSum = 0;
    let baseCount = 0;
    const baseEnd = Math.max(0, i - ROAR_WINDOW);
    const baseStart = Math.max(0, baseEnd - BASELINE_WINDOW);
    for (let j = baseStart; j < baseEnd; j++) {
      baseSum += frames[j].rms;
      baseCount++;
    }
    if (baseCount === 0) continue;
    const baseline = baseSum / baseCount;

    // Check for energy jump
    const currentEnergy = frames[i].rms;
    const jump = currentEnergy - baseline;

    if (jump > ROAR_ENERGY_JUMP * baseline && jump > 0.05) {
      // Check flatness range — roars have moderate flatness (not pure tone, not pure noise)
      if (frames[i].flatness > 0.1 && frames[i].flatness < 0.6) {
        // Check if this is a holy_shit (from low baseline) or roar (from moderate)
        const type: CrowdEventType = baseline < HOLY_SHIT_LOW_BASELINE ? "holy_shit" : "roar";

        // Avoid duplicate moments overlapping with applause
        const overlaps = moments.some(
          (m) => i >= m.frameStart && i < m.frameEnd,
        );
        if (!overlaps) {
          // Find the peak within ±30 frames
          let localPeak = i;
          let localPeakVal = currentEnergy;
          for (let j = Math.max(0, i - 30); j <= Math.min(frames.length - 1, i + 30); j++) {
            if (frames[j].rms > localPeakVal) {
              localPeakVal = frames[j].rms;
              localPeak = j;
            }
          }

          moments.push({
            frameStart: Math.max(0, i - 15),
            frameEnd: Math.min(frames.length, i + 45), // ~2 second event
            avgIntensity: currentEnergy,
            type,
            peakFrame: localPeak,
            peakIntensity: localPeakVal,
          });
          // Skip ahead to avoid duplicate roar detections
          i += 45;
        }
      }
    }
  }

  // ─── Pass 3: Singalong detection (sustained moderate energy + chroma stability) ───
  let singStart = -1;
  let singCount = 0;
  let singIntensitySum = 0;
  let singPeakFrame = 0;
  let singPeakIntensity = 0;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const energy = f.rms;

    // Singalong: moderate sustained energy, not too loud, not too quiet
    // Chroma stability approximated by low flatness (tonal singing)
    const isSingFrame =
      energy > SINGALONG_ENERGY_MIN &&
      energy < SINGALONG_ENERGY_MAX &&
      f.flatness < 0.25 && // tonal (singing vs noise)
      f.centroid < 0.5;    // not too bright (human voice range)

    if (isSingFrame) {
      if (singStart === -1) {
        singStart = i;
        singCount = 0;
        singIntensitySum = 0;
        singPeakFrame = i;
        singPeakIntensity = 0;
      }
      singCount++;
      singIntensitySum += energy;
      if (energy > singPeakIntensity) {
        singPeakIntensity = energy;
        singPeakFrame = i;
      }
    } else {
      if (singStart !== -1 && singCount >= SINGALONG_MIN_DURATION) {
        // Check it doesn't overlap with an existing moment
        const avg = singIntensitySum / singCount;
        const overlaps = moments.some(
          (m) => singStart < m.frameEnd && (singStart + singCount) > m.frameStart,
        );
        if (!overlaps) {
          moments.push({
            frameStart: singStart,
            frameEnd: singStart + singCount,
            avgIntensity: avg,
            type: "singalong",
            peakFrame: singPeakFrame,
            peakIntensity: singPeakIntensity,
          });
        }
      }
      singStart = -1;
    }
  }

  // Sort by frame start
  moments.sort((a, b) => a.frameStart - b.frameStart);

  return moments;
}
