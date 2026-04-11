/**
 * JamDensityEstimator — real-time jam density and long-jam detection.
 *
 * Counts onsets per second over a 30-second sliding window and normalizes
 * to produce a density metric. Also tracks whether the current musical
 * section has been active for an extended period (>3 minutes), indicating
 * the band is deep in an exploratory jam.
 *
 * Used by shader routing to intensify visuals during dense jams and
 * create spacious visuals during sparse passages.
 */

export interface JamDensityResult {
  /** Normalized onset density (0 = sparse/silent, 1 = very dense) */
  jamDensity: number;
  /** Whether the current section has been active for >3 minutes */
  isLongJam: boolean;
}

export class JamDensityEstimator {
  /** Circular buffer of onset timestamps in ms */
  private onsetTimes: number[] = [];
  /** Window duration in ms */
  private readonly windowMs: number;
  /** Long jam threshold in ms */
  private readonly longJamThresholdMs: number;

  /** Track section duration */
  private sectionStartTime = 0;
  private lastSectionType = "";

  // EMA-smoothed density
  private smoothedDensity = 0;
  private readonly alpha: number;

  /**
   * @param windowSeconds Sliding window for density calculation (default 30)
   * @param longJamMinutes Minutes threshold for isLongJam (default 3)
   * @param fps Frame rate for EMA smoothing (default 60)
   */
  constructor(
    windowSeconds: number = 30,
    longJamMinutes: number = 3,
    fps: number = 60,
  ) {
    this.windowMs = windowSeconds * 1000;
    this.longJamThresholdMs = longJamMinutes * 60 * 1000;
    this.alpha = 2 / (fps * 2 + 1); // ~2 second smoothing
  }

  /**
   * Update jam density estimation.
   * @param onset Onset signal strength (0-1, from FeatureExtractor)
   * @param isBeat Whether a beat was detected
   * @param timeMs Current time in milliseconds
   * @param sectionType Current section type (for tracking section duration)
   */
  update(
    onset: number,
    isBeat: boolean,
    timeMs: number,
    sectionType: string = "",
  ): JamDensityResult {
    // Record significant onsets (threshold avoids counting noise)
    if (onset > 0.15 || isBeat) {
      this.onsetTimes.push(timeMs);
    }

    // Prune onsets outside window
    const cutoff = timeMs - this.windowMs;
    while (this.onsetTimes.length > 0 && this.onsetTimes[0] < cutoff) {
      this.onsetTimes.shift();
    }

    // Compute onsets per second
    const windowSeconds = this.windowMs / 1000;
    const onsetsPerSecond = this.onsetTimes.length / windowSeconds;

    // Normalize: typical range 0-15 onsets/second
    // 0 ops = silence, 5 ops = moderate, 10+ = very dense
    const rawDensity = Math.min(1, onsetsPerSecond / 10);

    // EMA smooth
    this.smoothedDensity += this.alpha * (rawDensity - this.smoothedDensity);

    // Track section changes for long jam detection
    if (sectionType !== this.lastSectionType && sectionType !== "") {
      this.sectionStartTime = timeMs;
      this.lastSectionType = sectionType;
    }

    const sectionDuration = timeMs - this.sectionStartTime;
    const isLongJam = sectionDuration >= this.longJamThresholdMs;

    return {
      jamDensity: Math.max(0, Math.min(1, this.smoothedDensity)),
      isLongJam,
    };
  }

  reset(): void {
    this.onsetTimes = [];
    this.smoothedDensity = 0;
    this.sectionStartTime = 0;
    this.lastSectionType = "";
  }
}
