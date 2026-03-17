/**
 * Jam Cycle Detection — detect build→peak→release→explore sub-cycles within jams.
 *
 * Long improvisational sections (jams, solos) contain internal energy arcs:
 * the band builds intensity, peaks, releases, and then explores before building again.
 * Detecting these sub-cycles allows the visualizer to evolve within a single section.
 *
 * Algorithm: local peak detection on smoothed energy (30-frame Gaussian),
 * with `isDeepening` tracking successive peak climbing.
 */

import type { EnhancedFrameData } from "../data/types";
import { gaussianSmooth } from "./audio-reactive";

export type JamCyclePhase = "explore" | "build" | "peak" | "release";

export interface JamCycleState {
  phase: JamCyclePhase;
  /** 0-1 progress within current phase */
  progress: number;
  /** true when successive peaks are climbing (building toward climax) */
  isDeepening: boolean;
  /** Number of completed cycles in this section */
  cycleCount: number;
}

/**
 * Detect jam cycle state at a given frame.
 *
 * @param frames Full frame array
 * @param idx Current frame index
 * @param sectionStart First frame of the current section
 * @param sectionEnd Last frame of the current section
 */
export function detectJamCycle(
  frames: EnhancedFrameData[],
  idx: number,
  sectionStart: number,
  sectionEnd: number,
): JamCycleState {
  const sLen = sectionEnd - sectionStart;
  if (sLen < 90 || frames.length === 0) {
    return { phase: "explore", progress: 0, isDeepening: false, cycleCount: 0 };
  }

  // Smoothed energy across the section
  const smoothedEnergy = gaussianSmooth(frames, idx, (f) => f.rms, 30);

  // Find local peaks and valleys within the section (scan with 60-frame windows)
  const peaks: { frame: number; energy: number }[] = [];
  const valleys: { frame: number; energy: number }[] = [];
  const scanStep = Math.max(1, Math.floor(sLen / 60));

  for (let i = sectionStart + 30; i < sectionEnd - 30; i += scanStep) {
    if (i >= frames.length) break;
    const e = gaussianSmooth(frames, i, (f) => f.rms, 30);
    const ePrev = gaussianSmooth(frames, Math.max(0, i - 30), (f) => f.rms, 30);
    const eNext = gaussianSmooth(frames, Math.min(frames.length - 1, i + 30), (f) => f.rms, 30);

    if (e > ePrev && e > eNext && e > 0.12) {
      peaks.push({ frame: i, energy: e });
    }
    if (e < ePrev && e < eNext) {
      valleys.push({ frame: i, energy: e });
    }
  }

  // Count completed cycles (a cycle = valley → peak → valley)
  let cycleCount = 0;
  for (let i = 1; i < peaks.length; i++) {
    // A cycle completes when there's a valley between two peaks
    const hasMidValley = valleys.some(
      (v) => v.frame > peaks[i - 1].frame && v.frame < peaks[i].frame,
    );
    if (hasMidValley) cycleCount++;
  }

  // Detect deepening: are successive peaks climbing?
  let isDeepening = false;
  if (peaks.length >= 2) {
    const lastTwo = peaks.slice(-2);
    isDeepening = lastTwo[1].energy > lastTwo[0].energy * 1.05;
  }

  // Determine current phase relative to nearest peak
  let phase: JamCyclePhase = "explore";
  let progress = 0;

  // Find the nearest peak to current frame
  let nearestPeak: { frame: number; energy: number } | null = null;
  let nearestDist = Infinity;
  for (const p of peaks) {
    const d = Math.abs(idx - p.frame);
    if (d < nearestDist) {
      nearestDist = d;
      nearestPeak = p;
    }
  }

  if (nearestPeak) {
    const distToPeak = idx - nearestPeak.frame;
    const halfCycle = sLen / Math.max(1, peaks.length) / 2;

    if (Math.abs(distToPeak) < 15) {
      // At the peak
      phase = "peak";
      progress = 1 - Math.abs(distToPeak) / 15;
    } else if (distToPeak < 0 && Math.abs(distToPeak) < halfCycle) {
      // Approaching peak = build
      phase = "build";
      progress = 1 - Math.abs(distToPeak) / halfCycle;
    } else if (distToPeak > 0 && distToPeak < halfCycle) {
      // After peak = release
      phase = "release";
      progress = 1 - distToPeak / halfCycle;
    } else {
      // Far from any peak = explore
      phase = "explore";
      // Energy relative to section average as progress indicator
      const sectionAvg = (peaks.reduce((s, p) => s + p.energy, 0) / peaks.length) * 0.6;
      progress = Math.min(1, smoothedEnergy / Math.max(0.01, sectionAvg));
    }
  }

  return { phase, progress, isDeepening, cycleCount };
}
