import { describe, it, expect } from "vitest";
import { aggregateChroma, deriveChromaPalette, blendChromaPalette } from "./chroma-palette";
import type { EnhancedFrameData, ColorPalette } from "../data/types";

/** Helper: create a minimal frame with given chroma and rms */
function frame(chroma: number[], rms: number): EnhancedFrameData {
  const c = new Array(12).fill(0);
  for (let i = 0; i < Math.min(chroma.length, 12); i++) c[i] = chroma[i];
  return {
    rms,
    centroid: 0, onset: 0, beat: false, sub: 0, low: 0, mid: 0, high: 0,
    chroma: c as EnhancedFrameData["chroma"],
    contrast: [0, 0, 0, 0, 0, 0, 0],
    flatness: 0,
  };
}

describe("aggregateChroma", () => {
  it("weights by RMS energy (loud C > quiet G)", () => {
    const cMajor = new Array(12).fill(0); cMajor[0] = 1; // C
    const gMajor = new Array(12).fill(0); gMajor[7] = 1; // G
    const frames = [
      frame(cMajor, 0.8), // loud C
      frame(gMajor, 0.2), // quiet G
    ];
    const result = aggregateChroma(frames);
    expect(result[0]).toBeGreaterThan(result[7]); // C dominates
  });

  it("returns zeros for empty frames", () => {
    const result = aggregateChroma([]);
    expect(result).toEqual(new Array(12).fill(0));
  });

  it("returns zeros for silent frames (rms=0)", () => {
    const silent = frame(new Array(12).fill(1), 0);
    const result = aggregateChroma([silent, silent]);
    expect(result.every((v) => v === 0)).toBe(true);
  });
});

describe("deriveChromaPalette", () => {
  it("maps C-major to primary=0°", () => {
    const cMajor = new Array(12).fill(0.01); cMajor[0] = 1;
    const frames = [frame(cMajor, 1)];
    const palette = deriveChromaPalette(frames);
    expect(palette.primary).toBe(0); // C = index 0 × 30°
  });

  it("maps different keys to different hues", () => {
    const cFrame = frame([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 1); // C
    const eFrame = frame([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], 1); // E
    const cPalette = deriveChromaPalette([cFrame]);
    const ePalette = deriveChromaPalette([eFrame]);
    expect(cPalette.primary).not.toBe(ePalette.primary);
    expect(ePalette.primary).toBe(120); // E = index 4 × 30°
  });

  it("returns fallback for empty frames", () => {
    const palette = deriveChromaPalette([]);
    expect(palette.primary).toBe(270);
    expect(palette.secondary).toBe(180);
  });

  it("returns fallback for all-silent frames", () => {
    const palette = deriveChromaPalette([frame(new Array(12).fill(1), 0)]);
    expect(palette.primary).toBe(270);
  });

  it("clarity maps to saturation 0.5–1.0", () => {
    // Perfectly pure tone: clarity = 1 → saturation = 1.0
    const pure = frame([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 1);
    const purePalette = deriveChromaPalette([pure]);
    expect(purePalette.saturation).toBeCloseTo(1.0, 1);

    // Even spread: clarity ≈ 1/12 → saturation ≈ 0.54
    const even = frame(new Array(12).fill(1), 1);
    const evenPalette = deriveChromaPalette([even]);
    expect(evenPalette.saturation!).toBeGreaterThanOrEqual(0.5);
    expect(evenPalette.saturation!).toBeLessThan(0.6);
  });
});

describe("blendChromaPalette", () => {
  const manual: ColorPalette = { primary: 60, secondary: 300, saturation: 0.9, brightness: 0.8 };
  const derived: ColorPalette = { primary: 120, secondary: 240, saturation: 0.7, brightness: 1.0 };

  it("returns 100% derived when manual is undefined", () => {
    const result = blendChromaPalette(undefined, derived);
    expect(result).toEqual(derived);
  });

  it("blends 25/75 by default", () => {
    const result = blendChromaPalette(manual, derived, 0.25);
    // primary: 60 → 120, 25% = 75
    expect(result.primary).toBeCloseTo(75, 0);
    // saturation: 0.9 → 0.7, 25% = 0.85
    expect(result.saturation).toBeCloseTo(0.85, 2);
  });

  it("weight=0 returns manual", () => {
    const result = blendChromaPalette(manual, derived, 0);
    expect(result.primary).toBeCloseTo(manual.primary, 5);
    expect(result.secondary).toBeCloseTo(manual.secondary, 5);
  });

  it("weight=1 returns derived", () => {
    const result = blendChromaPalette(manual, derived, 1);
    expect(result.primary).toBeCloseTo(derived.primary, 5);
    expect(result.secondary).toBeCloseTo(derived.secondary, 5);
  });

  it("uses shortest arc for wrap-around hue (350° → 10°)", () => {
    const m: ColorPalette = { primary: 350, secondary: 0 };
    const d: ColorPalette = { primary: 10, secondary: 0 };
    const result = blendChromaPalette(m, d, 0.5);
    // Shortest arc from 350→10 is +20°, midpoint = 0°
    expect(result.primary).toBeCloseTo(0, 0);
  });
});
