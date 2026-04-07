/**
 * Overlay Window Builder — subdivides sections into energy-aware rotation windows.
 *
 * Extracted from overlay-rotation.ts for focused responsibility.
 */

import type { SectionBoundary } from "./types";
import type { RotationWindow } from "./overlay-rotation";

/**
 * Window duration in frames by energy.
 *
 * CHILL CALIBRATION (3-hour party background):
 * Doubled all windows. Overlays now hold for 60-120s instead of 30-60s.
 * Slower rotation = each overlay has time to be appreciated, no visual churn,
 * less "what was that?" reactions when viewers glance up.
 */
const WINDOW_FRAMES_BY_ENERGY: Record<string, number> = {
  low:  3600,  // 2 minutes — ambient sections hold for a long time
  mid:  2400,  // 80 seconds — verses/bridges
  high: 1800,  // 60 seconds — even peaks get more time
};
const WINDOW_FRAMES_DEFAULT = 1800;

/**
 * Subdivide sections into energy-aware rotation windows, aligned to section boundaries.
 * Each section is split into 1+ windows of roughly equal length based on energy-scaled duration.
 */
export function buildWindowsFromSections(
  sections: SectionBoundary[],
  windowDurationScale: number,
): RotationWindow[] {
  const windows: RotationWindow[] = [];
  for (const section of sections) {
    const sectionLen = section.frameEnd - section.frameStart;
    const targetWindowFrames = Math.round(
      (WINDOW_FRAMES_BY_ENERGY[section.energy] ?? WINDOW_FRAMES_DEFAULT) * windowDurationScale,
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
