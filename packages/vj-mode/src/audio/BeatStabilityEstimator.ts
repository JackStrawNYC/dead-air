/**
 * BeatStabilityEstimator — measures how steady the beat is over a sliding window.
 *
 * Tracks inter-onset intervals over an 8-second window and computes their variance.
 * Low variance = high stability (tight pocket groove).
 * High variance = unstable (free-form jam, rubato, silence).
 *
 * Reference: offline pipeline computes beat stability from librosa beat tracking.
 */

export interface BeatStabilityResult {
  /** How steady the beat is (0 = chaotic, 1 = metronomic) */
  beatStability: number;
  /** How confident we are in having enough beats to measure (0 = few beats, 1 = many) */
  beatConfidence: number;
}

export class BeatStabilityEstimator {
  /** Timestamps (ms) of recent onsets/beats */
  private onsetTimes: number[] = [];
  /** Maximum window duration in ms */
  private readonly windowMs: number;
  /** Minimum number of intervals needed for a meaningful estimate */
  private readonly minIntervals = 4;

  /**
   * @param windowSeconds Sliding window duration (default 8)
   */
  constructor(windowSeconds: number = 8) {
    this.windowMs = windowSeconds * 1000;
  }

  /**
   * Update with a new beat/onset event.
   * @param isBeat Whether a beat was detected this frame
   * @param timeMs Current time in milliseconds
   */
  update(isBeat: boolean, timeMs: number): BeatStabilityResult {
    // Record onset time
    if (isBeat) {
      this.onsetTimes.push(timeMs);
    }

    // Prune old onsets outside window
    const cutoff = timeMs - this.windowMs;
    while (this.onsetTimes.length > 0 && this.onsetTimes[0] < cutoff) {
      this.onsetTimes.shift();
    }

    // Need at least minIntervals + 1 onsets to compute intervals
    if (this.onsetTimes.length < this.minIntervals + 1) {
      return {
        beatStability: 0,
        beatConfidence: this.onsetTimes.length / (this.minIntervals + 1),
      };
    }

    // Compute inter-onset intervals
    const intervals: number[] = [];
    for (let i = 1; i < this.onsetTimes.length; i++) {
      intervals.push(this.onsetTimes[i] - this.onsetTimes[i - 1]);
    }

    // Mean interval
    let sum = 0;
    for (const iv of intervals) sum += iv;
    const mean = sum / intervals.length;

    if (mean < 1) {
      return { beatStability: 0, beatConfidence: 0 };
    }

    // Variance of intervals (normalized by mean)
    let varianceSum = 0;
    for (const iv of intervals) {
      const diff = (iv - mean) / mean; // coefficient of variation per sample
      varianceSum += diff * diff;
    }
    const cv = Math.sqrt(varianceSum / intervals.length); // coefficient of variation

    // Map CV to stability: CV = 0 -> stability 1, CV >= 1 -> stability 0
    const stability = Math.max(0, Math.min(1, 1 - cv));

    // Confidence scales with number of intervals (up to 16)
    const confidence = Math.min(1, intervals.length / 16);

    return {
      beatStability: stability,
      beatConfidence: confidence,
    };
  }

  reset(): void {
    this.onsetTimes = [];
  }
}
