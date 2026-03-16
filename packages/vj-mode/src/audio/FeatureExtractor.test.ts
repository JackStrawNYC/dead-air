import { describe, it, expect, beforeEach } from "vitest";
import { extractFeatures, resetExtractor } from "./FeatureExtractor";

describe("FeatureExtractor", () => {
  beforeEach(() => {
    resetExtractor();
  });

  it("returns zero features for silent input", () => {
    // getFloatFrequencyData returns dB values; -100 = silence
    const silent = new Float32Array(1024).fill(-100);
    const result = extractFeatures(silent, 44100);

    expect(result.rms).toBeCloseTo(0, 2);
    expect(result.bass).toBeCloseTo(0, 2);
    expect(result.mids).toBeCloseTo(0, 2);
    expect(result.highs).toBeCloseTo(0, 2);
  });

  it("returns valid ranges for all features", () => {
    // Simulate a tone: loud in low frequencies
    const fft = new Float32Array(1024).fill(-60);
    // Boost bass bins (0-20)
    for (let i = 0; i < 20; i++) fft[i] = -10;

    const result = extractFeatures(fft, 44100);

    expect(result.rms).toBeGreaterThanOrEqual(0);
    expect(result.rms).toBeLessThanOrEqual(1);
    expect(result.bass).toBeGreaterThanOrEqual(0);
    expect(result.bass).toBeLessThanOrEqual(1);
    expect(result.mids).toBeGreaterThanOrEqual(0);
    expect(result.highs).toBeGreaterThanOrEqual(0);
    expect(result.centroid).toBeGreaterThanOrEqual(0);
    expect(result.centroid).toBeLessThanOrEqual(1);
    expect(result.flatness).toBeGreaterThanOrEqual(0);
    expect(result.flatness).toBeLessThanOrEqual(1);
  });

  it("detects bass-heavy signal", () => {
    const fft = new Float32Array(1024).fill(-80);
    for (let i = 0; i < 20; i++) fft[i] = -5; // loud bass

    const result = extractFeatures(fft, 44100);
    expect(result.bass).toBeGreaterThan(result.highs);
  });

  it("detects treble-heavy signal", () => {
    const fft = new Float32Array(1024).fill(-80);
    for (let i = 100; i < 400; i++) fft[i] = -5; // loud highs

    const result = extractFeatures(fft, 44100);
    expect(result.highs).toBeGreaterThan(result.bass);
  });

  it("computes spectral flux on second frame", () => {
    const frame1 = new Float32Array(1024).fill(-60);
    extractFeatures(frame1, 44100);

    // Very different second frame
    const frame2 = new Float32Array(1024).fill(-10);
    const result = extractFeatures(frame2, 44100);

    expect(result.spectralFlux).toBeGreaterThan(0);
    expect(result.onset).toBeGreaterThan(0);
  });

  it("returns 12-element chroma array", () => {
    const fft = new Float32Array(1024).fill(-40);
    const result = extractFeatures(fft, 44100);

    expect(result.chromaBins).toHaveLength(12);
    // At least some chroma energy
    const sum = Array.from(result.chromaBins).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0);
  });

  it("resets state properly", () => {
    const fft = new Float32Array(1024).fill(-20);
    extractFeatures(fft, 44100);

    resetExtractor();

    // After reset, first frame should have zero spectral flux
    const result = extractFeatures(fft, 44100);
    expect(result.spectralFlux).toBe(0);
  });
});
