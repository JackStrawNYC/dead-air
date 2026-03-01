import { describe, it, expect } from "vitest";
import { computeSmoothedEnergy, energyToFactor, overlayEnergyFactor } from "./energy";
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
  it("returns 0.08 at silence", () => {
    expect(overlayEnergyFactor(0.01)).toBeCloseTo(0.08, 2);
  });

  it("returns 1.0 at peak", () => {
    expect(overlayEnergyFactor(0.5)).toBeCloseTo(1.0, 2);
  });

  it("returns ~0.5 at moderate energy", () => {
    const val = overlayEnergyFactor(0.17); // midpoint of 0.04-0.30
    expect(val).toBeGreaterThan(0.4);
    expect(val).toBeLessThan(0.7);
  });
});
