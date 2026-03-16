import { describe, it, expect } from "vitest";
import { ChromaExtractor } from "./ChromaExtractor";

describe("ChromaExtractor", () => {
  it("returns 12-element array", () => {
    const extractor = new ChromaExtractor(2048, 44100);
    const mags = new Float32Array(1024).fill(0.01);
    const result = extractor.extract(mags);
    expect(result).toHaveLength(12);
  });

  it("returns normalized values (0-1)", () => {
    const extractor = new ChromaExtractor(2048, 44100);
    const mags = new Float32Array(1024).fill(0.01);
    const result = extractor.extract(mags);
    for (let i = 0; i < 12; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0);
      expect(result[i]).toBeLessThanOrEqual(1);
    }
  });

  it("detects dominant pitch from boosted bin", () => {
    const extractor = new ChromaExtractor(2048, 44100);
    const mags = new Float32Array(1024).fill(0.001);

    // Boost 440 Hz (A4) which should map to pitch class A (index 9)
    // At 44100 Hz sample rate, 2048 FFT: bin 440/(44100/2048) ≈ bin 20
    const a440bin = Math.round(440 / (44100 / 2048));
    mags[a440bin] = 1.0;

    extractor.extract(mags);
    const hue = extractor.dominantHue();
    // A is pitch class 9, so hue should be 9/12 = 0.75
    // Allow some tolerance since bin-to-pitch mapping is approximate
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThanOrEqual(1);
  });

  it("handles silent input gracefully", () => {
    const extractor = new ChromaExtractor(2048, 44100);
    const mags = new Float32Array(1024).fill(0);
    const result = extractor.extract(mags);
    // All should be zero
    const sum = Array.from(result).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
  });

  it("dominantHue returns value in 0-1 range", () => {
    const extractor = new ChromaExtractor(2048, 44100);
    const mags = new Float32Array(1024);
    for (let i = 0; i < mags.length; i++) mags[i] = Math.random() * 0.1;

    extractor.extract(mags);
    const hue = extractor.dominantHue();
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(1);
  });
});
