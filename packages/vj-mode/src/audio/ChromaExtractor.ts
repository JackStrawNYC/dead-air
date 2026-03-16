/**
 * ChromaExtractor — FFT bins → 12 pitch classes.
 * Uses pre-computed bin-to-pitch LUT for O(1) per-bin lookups.
 */

export class ChromaExtractor {
  private binToPitch: Int8Array; // -1 = skip, 0-11 = pitch class
  private chromaOut = new Float32Array(12);

  constructor(fftSize: number = 2048, sampleRate: number = 44100) {
    const binCount = fftSize / 2;
    const binHz = sampleRate / fftSize;
    this.binToPitch = new Int8Array(binCount);

    for (let i = 0; i < binCount; i++) {
      const freq = i * binHz;
      if (freq < 60 || freq > 4000) {
        this.binToPitch[i] = -1; // outside musical range
      } else {
        const note = ((12 * Math.log2(freq / 440)) % 12 + 12) % 12;
        this.binToPitch[i] = Math.round(note) % 12;
      }
    }
  }

  /**
   * Extract chroma from linear magnitudes (pre-converted from dB).
   * Returns normalized 12-element array (C, C#, D, ..., B).
   */
  extract(magnitudes: Float32Array): Float32Array {
    this.chromaOut.fill(0);
    const counts = new Float32Array(12);

    for (let i = 0; i < magnitudes.length && i < this.binToPitch.length; i++) {
      const pitch = this.binToPitch[i];
      if (pitch >= 0) {
        this.chromaOut[pitch] += magnitudes[i];
        counts[pitch]++;
      }
    }

    // Normalize
    let max = 0;
    for (let i = 0; i < 12; i++) {
      if (counts[i] > 0) this.chromaOut[i] /= counts[i];
      if (this.chromaOut[i] > max) max = this.chromaOut[i];
    }
    if (max > 0) {
      for (let i = 0; i < 12; i++) this.chromaOut[i] /= max;
    }

    return this.chromaOut;
  }

  /** Get dominant pitch class as hue (0-1) */
  dominantHue(): number {
    let maxIdx = 0;
    for (let i = 1; i < 12; i++) {
      if (this.chromaOut[i] > this.chromaOut[maxIdx]) maxIdx = i;
    }
    return maxIdx / 12;
  }
}
