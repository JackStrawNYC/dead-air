/**
 * FeatureExtractor — pure function: FFT Float32Array → RawAudioFeatures.
 * Zero allocations in the hot path (pre-allocated output object).
 *
 * Band boundaries are computed dynamically from binHz = sampleRate / fftSize.
 * At 44100 Hz, 2048 FFT: binHz ≈ 21.5 Hz (46ms latency, good frequency detail).
 * At 44100 Hz, 1024 FFT: binHz ≈ 43 Hz (23ms latency, snappier transients).
 */

import type { RawAudioFeatures } from "./types";

// Pre-allocated output to avoid GC pressure
const output: RawAudioFeatures = {
  rms: 0,
  bass: 0,
  mids: 0,
  highs: 0,
  centroid: 0,
  onset: 0,
  flatness: 0,
  chromaBins: new Float32Array(12),
  spectralFlux: 0,
};

// Previous frame magnitudes for spectral flux
let prevMagnitudes: Float32Array | null = null;

/**
 * Convert dB values from getFloatFrequencyData to linear magnitude.
 * getFloatFrequencyData returns values in dB (typically -100 to 0).
 */
function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Extract raw audio features from FFT frequency data.
 * @param fftData Float32Array from AnalyserNode.getFloatFrequencyData() (dB scale)
 * @param sampleRate AudioContext sample rate (default 44100)
 */
export function extractFeatures(
  fftData: Float32Array,
  sampleRate: number = 44100,
): RawAudioFeatures {
  const binCount = fftData.length;
  const binHz = sampleRate / (binCount * 2);

  // Convert to linear magnitudes
  let sumSquared = 0;
  let weightedFreqSum = 0;
  let magSum = 0;
  let logMagSum = 0;
  let logMagCount = 0;

  // Band accumulators
  let subSum = 0, subCount = 0;
  let lowSum = 0, lowCount = 0;
  let midSum = 0, midCount = 0;
  let highSum = 0, highCount = 0;

  // Spectral flux
  let fluxSum = 0;

  // Chroma accumulators
  const chromaEnergy = output.chromaBins;
  chromaEnergy.fill(0);
  const chromaCounts = new Float32Array(12);

  for (let i = 1; i < binCount; i++) {
    const mag = dbToLinear(Math.max(fftData[i], -100));
    const freq = i * binHz;

    sumSquared += mag * mag;
    weightedFreqSum += freq * mag;
    magSum += mag;

    if (mag > 1e-10) {
      logMagSum += Math.log(mag);
      logMagCount++;
    }

    // Band summing
    if (freq < 100) {
      subSum += mag; subCount++;
    } else if (freq < 400) {
      lowSum += mag; lowCount++;
    } else if (freq < 2000) {
      midSum += mag; midCount++;
    } else if (freq < 8000) {
      highSum += mag; highCount++;
    }

    // Spectral flux (half-wave rectified)
    if (prevMagnitudes) {
      const diff = mag - prevMagnitudes[i];
      if (diff > 0) fluxSum += diff;
    }

    // Chroma mapping: note = 12 * log2(freq / 440) mod 12
    if (freq > 60 && freq < 4000) {
      const note = ((12 * Math.log2(freq / 440)) % 12 + 12) % 12;
      const bin = Math.round(note) % 12;
      chromaEnergy[bin] += mag;
      chromaCounts[bin]++;
    }
  }

  // RMS
  output.rms = Math.sqrt(sumSquared / Math.max(1, binCount));
  // Normalize RMS to roughly 0-1 range (empirically scaled)
  output.rms = Math.min(1, output.rms * 20);

  // Band energies (normalized by count, then scaled)
  const subAvg = subCount > 0 ? subSum / subCount : 0;
  const lowAvg = lowCount > 0 ? lowSum / lowCount : 0;
  output.bass = Math.min(1, (subAvg + lowAvg) * 10);
  output.mids = Math.min(1, (midCount > 0 ? midSum / midCount : 0) * 15);
  output.highs = Math.min(1, (highCount > 0 ? highSum / highCount : 0) * 20);

  // Spectral centroid (normalized to 0-1 by Nyquist)
  const nyquist = sampleRate / 2;
  output.centroid = magSum > 0 ? Math.min(1, (weightedFreqSum / magSum) / nyquist) : 0;

  // Spectral flatness: geometric mean / arithmetic mean
  const arithmeticMean = magSum / Math.max(1, binCount);
  const geometricMean = logMagCount > 0 ? Math.exp(logMagSum / logMagCount) : 0;
  output.flatness = arithmeticMean > 1e-10 ? Math.min(1, geometricMean / arithmeticMean) : 0;

  // Spectral flux (onset proxy)
  output.spectralFlux = Math.min(1, fluxSum * 5);
  output.onset = output.spectralFlux;

  // Normalize chroma bins
  let chromaMax = 0;
  for (let i = 0; i < 12; i++) {
    if (chromaCounts[i] > 0) chromaEnergy[i] /= chromaCounts[i];
    if (chromaEnergy[i] > chromaMax) chromaMax = chromaEnergy[i];
  }
  if (chromaMax > 0) {
    for (let i = 0; i < 12; i++) chromaEnergy[i] /= chromaMax;
  }

  // Store current magnitudes for next frame's flux calculation
  if (!prevMagnitudes) {
    prevMagnitudes = new Float32Array(binCount);
  }
  for (let i = 0; i < binCount; i++) {
    prevMagnitudes[i] = dbToLinear(Math.max(fftData[i], -100));
  }

  return output;
}

/** Reset state (call when switching audio sources) */
export function resetExtractor(): void {
  prevMagnitudes = null;
}
