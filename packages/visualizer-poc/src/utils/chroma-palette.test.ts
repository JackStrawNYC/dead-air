import { describe, it, expect } from "vitest";
import { deriveChromaPalette } from "./chroma-palette";
import type { EnhancedFrameData } from "../data/types";

/** Helper: create a minimal frame with only chroma set */
function makeFrame(chroma: [number, number, number, number, number, number, number, number, number, number, number, number]): EnhancedFrameData {
  return {
    rms: 0.5, centroid: 0.5, onset: 0, beat: false,
    sub: 0.3, low: 0.3, mid: 0.3, high: 0.3,
    chroma,
    contrast: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    flatness: 0.3,
  };
}

describe("deriveChromaPalette", () => {
  it("returns default palette for empty frames", () => {
    const result = deriveChromaPalette([]);
    expect(result).toEqual({ primary: 270, secondary: 180, saturation: 0.8 });
  });

  it("maps pure C dominant to primary 0° (red)", () => {
    // C = bin 0 → hue 0°
    const chroma: [number, number, number, number, number, number, number, number, number, number, number, number] =
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const result = deriveChromaPalette([makeFrame(chroma)]);
    expect(result.primary).toBe(0);
  });

  it("maps E dominant to primary 120° (green)", () => {
    // E = bin 4 → hue 120°
    const chroma: [number, number, number, number, number, number, number, number, number, number, number, number] =
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
    const result = deriveChromaPalette([makeFrame(chroma)]);
    expect(result.primary).toBe(120);
  });

  it("secondary is always ≥60° circular distance from primary", () => {
    // A dominant (bin 9, hue 270°), G# secondary (bin 8, hue 240°) is only 30° away
    // so secondary should skip it and pick something farther
    const chroma: [number, number, number, number, number, number, number, number, number, number, number, number] =
      [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5, 0.8, 0.9, 0.1, 0.1];
    const result = deriveChromaPalette([makeFrame(chroma)]);
    const dist = Math.min(
      Math.abs(result.secondary - result.primary),
      360 - Math.abs(result.secondary - result.primary),
    );
    expect(dist).toBeGreaterThanOrEqual(60);
  });

  it("flat chroma → saturation < 0.65", () => {
    // All bins equal = maximum entropy
    const chroma: [number, number, number, number, number, number, number, number, number, number, number, number] =
      [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const result = deriveChromaPalette([makeFrame(chroma)]);
    expect(result.saturation).toBeLessThan(0.65);
  });

  it("peaked chroma → saturation > 0.85", () => {
    // One dominant bin
    const chroma: [number, number, number, number, number, number, number, number, number, number, number, number] =
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const result = deriveChromaPalette([makeFrame(chroma)]);
    expect(result.saturation).toBeGreaterThan(0.85);
  });

  it("deterministic: same frames → same result", () => {
    const chroma: [number, number, number, number, number, number, number, number, number, number, number, number] =
      [0.2, 0.8, 0.3, 0.1, 0.6, 0.4, 0.1, 0.9, 0.2, 0.3, 0.5, 0.1];
    const frames = [makeFrame(chroma), makeFrame(chroma)];
    const a = deriveChromaPalette(frames);
    const b = deriveChromaPalette(frames);
    expect(a).toEqual(b);
  });

  it("primary hue is always a multiple of 30°", () => {
    const chroma: [number, number, number, number, number, number, number, number, number, number, number, number] =
      [0.1, 0.3, 0.7, 0.2, 0.5, 0.9, 0.4, 0.1, 0.6, 0.2, 0.8, 0.3];
    const result = deriveChromaPalette([makeFrame(chroma)]);
    expect(result.primary % 30).toBe(0);
  });

  it("saturation is bounded [0.55, 0.95]", () => {
    // Flat
    const flat: [number, number, number, number, number, number, number, number, number, number, number, number] =
      [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const flatResult = deriveChromaPalette([makeFrame(flat)]);
    expect(flatResult.saturation).toBeGreaterThanOrEqual(0.55);
    expect(flatResult.saturation).toBeLessThanOrEqual(0.95);

    // Peaked
    const peaked: [number, number, number, number, number, number, number, number, number, number, number, number] =
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const peakedResult = deriveChromaPalette([makeFrame(peaked)]);
    expect(peakedResult.saturation).toBeGreaterThanOrEqual(0.55);
    expect(peakedResult.saturation).toBeLessThanOrEqual(0.95);
  });
});
