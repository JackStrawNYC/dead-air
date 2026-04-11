/**
 * SectionEstimator — real-time section type estimation from audio features.
 *
 * Uses a simple decision tree over energy (RMS), spectral contrast (flatness),
 * and beat confidence to classify the current musical moment into one of 6 types.
 *
 * Hysteresis: energy must drop/rise >40% for >3 seconds before section changes.
 * This avoids flickering between types on minor fluctuations.
 *
 * Section types (matching offline pipeline):
 *   "verse"   — moderate energy, tonal, with beats
 *   "chorus"  — high energy, high beat stability
 *   "jam"     — sustained medium-high energy, moderate instability
 *   "space"   — low energy, low beat confidence, atmospheric
 *   "build"   — rising energy trend
 *   "peak"    — very high energy, climax moment
 */

export type SectionType = "verse" | "chorus" | "jam" | "space" | "build" | "peak";

export interface SectionEstimatorResult {
  /** Current section type classification */
  sectionType: SectionType;
  /** Progress through current section (0-1) */
  sectionProgress: number;
}

export class SectionEstimator {
  private currentSection: SectionType = "verse";
  private sectionStartTime = 0;
  private readonly hysteresisSeconds: number;
  private readonly fps: number;

  // Rolling energy window for trend detection
  private energyHistory: number[] = [];
  private readonly energyWindowSize: number;

  // EMA energy for smoothed decisions
  private smoothedEnergy = 0;
  private readonly emaAlpha: number;

  /**
   * @param fps Frame rate (default 60)
   * @param hysteresisSeconds Minimum time before section change (default 3)
   */
  constructor(fps: number = 60, hysteresisSeconds: number = 3) {
    this.fps = fps;
    this.hysteresisSeconds = hysteresisSeconds;
    this.energyWindowSize = Math.round(fps * 5); // 5 second window for trend
    this.emaAlpha = 2 / (fps * 2 + 1); // ~2 second smoothing
  }

  /**
   * Update section estimation.
   * @param energy RMS energy (0-1)
   * @param beatStability How stable the beat is (0-1)
   * @param beatConfidence Confidence in beat detection (0-1)
   * @param flatness Spectral flatness (0-1; high = noisy/percussive, low = tonal)
   * @param elapsedTime Total elapsed time in seconds
   */
  update(
    energy: number,
    beatStability: number,
    beatConfidence: number,
    flatness: number,
    elapsedTime: number,
  ): SectionEstimatorResult {
    // Update smoothed energy
    this.smoothedEnergy += this.emaAlpha * (energy - this.smoothedEnergy);

    // Track energy history for trend detection
    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.energyWindowSize) {
      this.energyHistory.shift();
    }

    // Compute energy trend (positive = rising, negative = falling)
    const trend = this.computeEnergyTrend();

    // Classify candidate section
    const candidate = this.classify(this.smoothedEnergy, beatStability, beatConfidence, flatness, trend);

    // Apply hysteresis: only change section if candidate differs and enough time has passed
    const timeSinceChange = elapsedTime - this.sectionStartTime;
    if (candidate !== this.currentSection && timeSinceChange >= this.hysteresisSeconds) {
      this.currentSection = candidate;
      this.sectionStartTime = elapsedTime;
    }

    // Estimate section progress (no fixed duration, so use time since change)
    // Typical section is 30-60 seconds; normalize to 60s as a rough estimate
    const progress = Math.min(1, (elapsedTime - this.sectionStartTime) / 60);

    return {
      sectionType: this.currentSection,
      sectionProgress: progress,
    };
  }

  private classify(
    energy: number,
    beatStability: number,
    beatConfidence: number,
    flatness: number,
    trend: number,
  ): SectionType {
    // Peak: very high energy
    if (energy > 0.75 && beatConfidence > 0.3) {
      return "peak";
    }

    // Space: low energy, low beat confidence (quiet atmospheric passages)
    if (energy < 0.15 && beatConfidence < 0.4) {
      return "space";
    }

    // Build: clearly rising energy trend
    if (trend > 0.15 && energy > 0.2 && energy < 0.7) {
      return "build";
    }

    // Chorus: high energy + stable beat
    if (energy > 0.5 && beatStability > 0.6 && beatConfidence > 0.5) {
      return "chorus";
    }

    // Jam: medium-high energy, moderate instability (exploratory)
    if (energy > 0.3 && beatStability < 0.5 && beatConfidence > 0.3) {
      return "jam";
    }

    // Default: verse
    return "verse";
  }

  private computeEnergyTrend(): number {
    const len = this.energyHistory.length;
    if (len < 2) return 0;

    // Compare first half average to second half average
    const mid = Math.floor(len / 2);
    let firstHalf = 0;
    let secondHalf = 0;

    for (let i = 0; i < mid; i++) firstHalf += this.energyHistory[i];
    for (let i = mid; i < len; i++) secondHalf += this.energyHistory[i];

    firstHalf /= mid;
    secondHalf /= (len - mid);

    // Positive = rising, negative = falling, range roughly -1 to 1
    return secondHalf - firstHalf;
  }

  reset(): void {
    this.currentSection = "verse";
    this.sectionStartTime = 0;
    this.energyHistory = [];
    this.smoothedEnergy = 0;
  }
}
