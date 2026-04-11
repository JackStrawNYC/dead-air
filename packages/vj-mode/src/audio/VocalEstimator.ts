/**
 * VocalEstimator — real-time vocal presence estimation from spectral features.
 *
 * Approximates vocal presence by analyzing energy distribution in the vocal
 * frequency range (300Hz-3kHz) relative to total energy. Vocals tend to be
 * tonal (low spectral flatness) with centroid in the mid-range.
 *
 * This is a heuristic, not source separation — it correlates with but does
 * not perfectly match actual vocal presence.
 */

export interface VocalEstimatorResult {
  /** Estimated vocal presence (0 = no vocals, 1 = strong vocals) */
  vocalPresence: number;
  /** Energy in the vocal frequency band (0-1) */
  vocalEnergy: number;
}

export class VocalEstimator {
  // EMA-smoothed values to avoid jitter
  private smoothedPresence = 0;
  private smoothedEnergy = 0;
  private readonly alpha: number;

  /**
   * @param fps Frame rate (default 60)
   * @param smoothingFrames EMA smoothing window in frames (default 15, ~0.25s at 60fps)
   */
  constructor(fps: number = 60, smoothingFrames: number = 15) {
    this.alpha = 2 / (smoothingFrames + 1);
  }

  /**
   * Estimate vocal presence from spectral features.
   * @param mids Mid-range energy (400Hz-2kHz band from FeatureExtractor, 0-1)
   * @param highs High-range energy (2kHz-8kHz band from FeatureExtractor, 0-1)
   * @param centroid Spectral centroid normalized to 0-1
   * @param flatness Spectral flatness (0 = tonal, 1 = noisy)
   * @param rms Overall energy (0-1)
   */
  update(
    mids: number,
    highs: number,
    centroid: number,
    flatness: number,
    rms: number,
  ): VocalEstimatorResult {
    // Vocal energy: weighted combination of mids (primary) and lower highs
    // Vocals live mostly in 300Hz-3kHz, mapped onto mids + a bit of highs
    const vocalBandEnergy = mids * 0.7 + highs * 0.3;

    // Tonality factor: vocals are tonal (low flatness), not noise
    // flatness < 0.3 is very tonal, > 0.6 is noise-like
    const tonality = Math.max(0, 1 - flatness * 2);

    // Centroid factor: vocals push centroid to mid-range (0.15-0.5 normalized)
    // Too low = bass-dominated, too high = cymbal/noise
    const centroidInVocalRange =
      centroid > 0.12 && centroid < 0.55
        ? 1 - 2 * Math.abs(centroid - 0.3) // peak at 0.3
        : 0;

    // Combined vocal presence heuristic
    const rawPresence = vocalBandEnergy * tonality * Math.max(0.3, centroidInVocalRange);

    // Scale up: the multiplication of 3 factors makes values small
    const scaledPresence = Math.min(1, rawPresence * 3);

    // Energy contribution: just the vocal band energy scaled to total
    const rawVocalEnergy = rms > 0.01 ? Math.min(1, vocalBandEnergy / Math.max(0.01, rms) * 0.5) : 0;

    // Smooth
    this.smoothedPresence += this.alpha * (scaledPresence - this.smoothedPresence);
    this.smoothedEnergy += this.alpha * (rawVocalEnergy - this.smoothedEnergy);

    return {
      vocalPresence: Math.max(0, Math.min(1, this.smoothedPresence)),
      vocalEnergy: Math.max(0, Math.min(1, this.smoothedEnergy)),
    };
  }

  reset(): void {
    this.smoothedPresence = 0;
    this.smoothedEnergy = 0;
  }
}
