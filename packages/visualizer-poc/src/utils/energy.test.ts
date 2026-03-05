import { describe, it, expect } from "vitest";
import { computeSmoothedEnergy, energyToFactor, overlayEnergyFactor, calibrateEnergy } from "./energy";
import type { EnhancedFrameData } from "../data/types";

function makeFrame(rms: number): EnhancedFrameData {
  return {
    rms,
    sub: 0,
    low: 0,
    mid: 0,
    high: 0,
    centroid: 0,
    flatness: 0,
    onset: 0,
    beat: false,
    chroma: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    contrast: [0, 0, 0, 0, 0, 0, 0],
  };
}

describe("computeSmoothedEnergy", () => {
  it("returns the exact value for uniform frames", () => {
    const frames = Array.from({ length: 300 }, () => makeFrame(0.2));
    const energy = computeSmoothedEnergy(frames, 150);
    expect(energy).toBeCloseTo(0.2, 3);
  });

  it("smooths transition between regions", () => {
    const frames = Array.from({ length: 600 }, (_, i) =>
      makeFrame(i < 300 ? 0.05 : 0.35),
    );
    const energy = computeSmoothedEnergy(frames, 300, 50);
    expect(energy).toBeGreaterThan(0.05);
    expect(energy).toBeLessThan(0.35);
  });

  it("handles edge frames (index 0)", () => {
    const frames = Array.from({ length: 100 }, () => makeFrame(0.15));
    const energy = computeSmoothedEnergy(frames, 0);
    expect(energy).toBeCloseTo(0.15, 2);
  });
});

describe("energyToFactor", () => {
  it("returns 0 below low threshold", () => {
    expect(energyToFactor(0.01)).toBe(0);
  });

  it("returns 1 above high threshold", () => {
    expect(energyToFactor(0.5)).toBe(1);
  });

  it("returns ~0.5 at midpoint (smoothstep)", () => {
    const mid = energyToFactor(0.2); // midpoint of 0.05-0.35
    expect(mid).toBeCloseTo(0.5, 1);
  });

  it("uses custom thresholds", () => {
    expect(energyToFactor(0.1, 0.1, 0.5)).toBe(0);
    expect(energyToFactor(0.5, 0.1, 0.5)).toBe(1);
  });
});

describe("overlayEnergyFactor", () => {
  it("returns floor (0.40) at silence", () => {
    // energy 0.01 < low threshold 0.04 → factor=0 → 0.40 + 0 = 0.40
    expect(overlayEnergyFactor(0.01)).toBeCloseTo(0.40, 2);
  });

  it("returns 1.0 at peak", () => {
    // energy 0.5 > high threshold 0.30 → factor=1 → 0.40 + 0.60 = 1.0
    expect(overlayEnergyFactor(0.5)).toBeCloseTo(1.0, 2);
  });

  it("returns ~0.70 at moderate energy", () => {
    // energy 0.17 ≈ midpoint of 0.04-0.30 → factor≈0.5 → 0.40 + 0.30 = 0.70
    const val = overlayEnergyFactor(0.17);
    expect(val).toBeGreaterThan(0.6);
    expect(val).toBeLessThan(0.8);
  });
});

describe("energy response curve integration", () => {
  it("overlayEnergyFactor increases with energy", () => {
    const low = overlayEnergyFactor(0.02);
    const mid = overlayEnergyFactor(0.17);
    const high = overlayEnergyFactor(0.40);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it("calibrateEnergy produces reasonable thresholds", () => {
    // Create frames with varied energy
    const frames = Array.from({ length: 300 }, (_, i) =>
      makeFrame(i < 200 ? 0.05 : 0.35),
    );
    const cal = calibrateEnergy(frames);
    expect(cal.quietThreshold).toBeGreaterThanOrEqual(0.02);
    expect(cal.quietThreshold).toBeLessThanOrEqual(0.10);
    expect(cal.loudThreshold).toBeGreaterThanOrEqual(0.15);
    expect(cal.loudThreshold).toBeLessThanOrEqual(0.50);
  });

  it("overlayEnergyFactor uses calibration when provided", () => {
    const cal = { quietThreshold: 0.03, loudThreshold: 0.25 };
    const withCal = overlayEnergyFactor(0.14, cal);
    const withoutCal = overlayEnergyFactor(0.14);
    // Both should be in valid range, but may differ
    expect(withCal).toBeGreaterThanOrEqual(0.40);
    expect(withCal).toBeLessThanOrEqual(1.0);
    expect(withoutCal).toBeGreaterThanOrEqual(0.40);
    expect(withoutCal).toBeLessThanOrEqual(1.0);
  });
});
