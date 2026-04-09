/**
 * Overlay Window Builder — subdivides sections into energy-aware rotation windows.
 *
 * Extracted from overlay-rotation.ts for focused responsibility.
 */

import type { SectionBoundary } from "./types";
import type { RotationWindow } from "./overlay-rotation";

/**
 * Continuous, tempo-aware window duration.
 *
 * Replaces the old 3-bucket WINDOW_FRAMES_BY_ENERGY lookup with a smooth
 * function of avgEnergy and tempo. Slow + quiet → long windows (ambient
 * sections hold for ~3 minutes). Fast + loud → short windows (peaks
 * rotate every ~30s). Both axes matter:
 *   - avgEnergy: maps 0.0 → 1.05, 0.5 → 0.50, 1.0 → 0.30 (energy multiplier)
 *   - tempo:    maps 60bpm → 1.30, 120bpm → 1.0, 180bpm → 0.78 (tempo multiplier)
 *
 * Base duration is ~110 seconds (3300 frames at 30fps); the multipliers
 * push the actual range from ~30 sec (fast peak) to ~210 sec (slow ballad).
 *
 * CHILL CALIBRATION preserved: even fast peaks never go below 30 sec — no
 * "what just happened" rotation churn during 3-hour viewing.
 */
const BASE_WINDOW_FRAMES = 3300; // ~110 seconds at 30fps
const MIN_WINDOW_FRAMES = 900;   // 30 seconds — never faster than this
const MAX_WINDOW_FRAMES = 6300;  // 210 seconds — never slower than this

export function continuousWindowFrames(avgEnergy: number, tempo: number): number {
  const e = Math.max(0, Math.min(1, avgEnergy));
  // Energy multiplier: smooth ramp from 1.05 (silence) to 0.30 (peak)
  const energyMult = 1.05 - 0.75 * e * e * (3 - 2 * e); // smoothstep curve
  // Tempo multiplier: faster songs rotate faster. Clamp 0.65–1.40 (~2.15x range)
  const tempoMult = Math.max(0.65, Math.min(1.40, 120 / Math.max(40, tempo)));
  const raw = BASE_WINDOW_FRAMES * energyMult * tempoMult;
  return Math.max(MIN_WINDOW_FRAMES, Math.min(MAX_WINDOW_FRAMES, Math.round(raw)));
}

/**
 * Subdivide sections into energy-aware rotation windows, aligned to section boundaries.
 * Each section is split into 1+ windows of roughly equal length, sized by the
 * continuous (avgEnergy, tempo) function above.
 */
export function buildWindowsFromSections(
  sections: SectionBoundary[],
  windowDurationScale: number,
  tempo = 120,
): RotationWindow[] {
  const windows: RotationWindow[] = [];
  for (const section of sections) {
    const sectionLen = section.frameEnd - section.frameStart;
    const targetWindowFrames = Math.round(
      continuousWindowFrames(section.avgEnergy, tempo) * windowDurationScale,
    );
    const windowCount = Math.max(1, Math.round(sectionLen / targetWindowFrames));
    const windowLen = Math.floor(sectionLen / windowCount);

    for (let w = 0; w < windowCount; w++) {
      const frameStart = section.frameStart + w * windowLen;
      const frameEnd = w === windowCount - 1
        ? section.frameEnd
        : frameStart + windowLen;
      windows.push({
        frameStart,
        frameEnd,
        overlays: [],
        energy: section.energy,
        avgEnergy: section.avgEnergy,
      });
    }
  }
  return windows;
}

/**
 * Mark pre-peak dropout windows.
 * The last window before a jump to higher energy gets flagged.
 * This creates visual silence → climax contrast.
 */
export function markDropoutWindows(windows: RotationWindow[]): void {
  const energyRank: Record<string, number> = { low: 0, mid: 1, high: 2 };
  for (let wi = 0; wi < windows.length - 1; wi++) {
    const currentRank = energyRank[windows[wi].energy];
    const nextRank = energyRank[windows[wi + 1].energy];
    if (nextRank > currentRank) {
      windows[wi].isDropout = true;
    }
  }
}
