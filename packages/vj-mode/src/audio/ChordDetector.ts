/**
 * ChordDetector — real-time chord detection from 12-element chroma array.
 *
 * Template-matches against 24 chord profiles (12 major + 12 minor)
 * and tracks harmonic tension as the rate of chord change over a sliding window.
 *
 * Reference: offline chord-mood.ts uses similar 24-template approach.
 */

export interface ChordResult {
  /** Detected chord index (0-11 major, 12-23 minor) */
  chordIndex: number;
  /** Match confidence (0-1), cosine similarity of best match */
  confidence: number;
  /** Rate of chord change over sliding window (0-1); high = turbulent harmony */
  harmonicTension: number;
}

/**
 * Major chord template: root, major third (+4), fifth (+7).
 * Minor chord template: root, minor third (+3), fifth (+7).
 * Each template is a 12-element array with 1s at chord tones.
 */
function buildChordTemplates(): Float32Array[] {
  const templates: Float32Array[] = [];

  // 12 major chords (indices 0-11)
  for (let root = 0; root < 12; root++) {
    const t = new Float32Array(12);
    t[root] = 1;
    t[(root + 4) % 12] = 1; // major third
    t[(root + 7) % 12] = 1; // fifth
    templates.push(t);
  }

  // 12 minor chords (indices 12-23)
  for (let root = 0; root < 12; root++) {
    const t = new Float32Array(12);
    t[root] = 1;
    t[(root + 3) % 12] = 1; // minor third
    t[(root + 7) % 12] = 1; // fifth
    templates.push(t);
  }

  return templates;
}

const CHORD_TEMPLATES = buildChordTemplates();

/** Cosine similarity between two 12-element vectors */
function cosineSimilarity(a: Float32Array | number[], b: Float32Array): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < 12; i++) {
    const va = typeof a[i] === "number" ? (a[i] as number) : 0;
    const vb = b[i];
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 1e-10 ? dot / denom : 0;
}

export class ChordDetector {
  /** Sliding window of recent chord indices for tension calculation */
  private chordHistory: number[] = [];
  private readonly windowSize: number; // frames
  private lastChordIndex = 0;

  /**
   * @param fps Frame rate (default 60)
   * @param tensionWindowSeconds Window for harmonic tension (default 2)
   */
  constructor(fps: number = 60, tensionWindowSeconds: number = 2) {
    this.windowSize = Math.round(fps * tensionWindowSeconds);
  }

  /**
   * Detect chord from 12-element chroma array.
   * @param chroma Normalized chroma bins (0-1 per pitch class)
   */
  detect(chroma: Float32Array | number[]): ChordResult {
    // Template matching: find best chord match
    let bestIdx = 0;
    let bestSim = -1;

    for (let i = 0; i < 24; i++) {
      const sim = cosineSimilarity(chroma, CHORD_TEMPLATES[i]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }

    const confidence = Math.max(0, Math.min(1, bestSim));
    this.lastChordIndex = bestIdx;

    // Update chord history
    this.chordHistory.push(bestIdx);
    if (this.chordHistory.length > this.windowSize) {
      this.chordHistory.shift();
    }

    // Harmonic tension: count chord changes in window / window size
    const tension = this.computeTension();

    return {
      chordIndex: bestIdx,
      confidence,
      harmonicTension: tension,
    };
  }

  private computeTension(): number {
    if (this.chordHistory.length < 2) return 0;

    let changes = 0;
    for (let i = 1; i < this.chordHistory.length; i++) {
      if (this.chordHistory[i] !== this.chordHistory[i - 1]) {
        changes++;
      }
    }

    // Normalize: max expected change rate is ~50% of frames
    const maxChanges = this.chordHistory.length * 0.5;
    return Math.min(1, changes / maxChanges);
  }

  reset(): void {
    this.chordHistory = [];
    this.lastChordIndex = 0;
  }
}
