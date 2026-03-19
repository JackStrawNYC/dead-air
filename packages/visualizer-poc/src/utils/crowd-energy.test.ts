import { describe, it, expect } from "vitest";
import { computeCrowdEnergy } from "./crowd-energy";

describe("computeCrowdEnergy", () => {
  it("returns neutral for empty show", () => {
    const result = computeCrowdEnergy([], 1, 0, 0.1);
    expect(result.energyBaselineOffset).toBe(0);
    expect(result.densityMult).toBe(1);
    expect(result.motionMult).toBe(1);
  });

  it("builds excitement from high-energy songs", () => {
    const peaks = [0.3, 0.35, 0.4]; // 3 high-energy songs
    const result = computeCrowdEnergy(peaks, 1, 3, 0.2);
    expect(result.excitement).toBeGreaterThan(0.5);
    expect(result.energyBaselineOffset).toBeGreaterThan(0);
    expect(result.densityMult).toBeGreaterThan(1);
  });

  it("fatigue builds after sustained high energy", () => {
    const peaks = [0.3, 0.35, 0.4, 0.38, 0.42, 0.4, 0.35]; // 7 consecutive high-energy
    const result = computeCrowdEnergy(peaks, 1, 7, 0.3);
    expect(result.fatigue).toBeGreaterThan(0.3);
  });

  it("set 2 reduces fatigue (set break recovery)", () => {
    const peaks = [0.3, 0.35, 0.4, 0.38, 0.42, 0.4, 0.35];
    const set1 = computeCrowdEnergy(peaks, 1, 7, 0.3);
    const set2 = computeCrowdEnergy(peaks, 2, 7, 0.3);
    expect(set2.fatigue).toBeLessThan(set1.fatigue);
  });

  it("encore further reduces fatigue", () => {
    const peaks = [0.3, 0.35, 0.4, 0.38, 0.42, 0.4, 0.35];
    const set2 = computeCrowdEnergy(peaks, 2, 7, 0.3);
    const encore = computeCrowdEnergy(peaks, 3, 7, 0.3);
    expect(encore.fatigue).toBeLessThan(set2.fatigue);
  });

  it("quiet current song reduces fatigue", () => {
    const peaks = [0.3, 0.35, 0.4, 0.38, 0.42];
    const loud = computeCrowdEnergy(peaks, 1, 5, 0.3);
    const quiet = computeCrowdEnergy(peaks, 1, 5, 0.05);
    expect(quiet.fatigue).toBeLessThan(loud.fatigue);
  });

  it("all values stay in safe ranges", () => {
    // Extreme case: many high-energy songs
    const peaks = Array(20).fill(0.5);
    const result = computeCrowdEnergy(peaks, 1, 20, 0.5);
    expect(result.energyBaselineOffset).toBeGreaterThanOrEqual(-0.05);
    expect(result.energyBaselineOffset).toBeLessThanOrEqual(0.05);
    expect(result.densityMult).toBeGreaterThanOrEqual(0.9);
    expect(result.densityMult).toBeLessThanOrEqual(1.1);
    expect(result.motionMult).toBeGreaterThanOrEqual(0.9);
    expect(result.motionMult).toBeLessThanOrEqual(1.1);
  });

  it("low-energy songs don't trigger excitement", () => {
    const peaks = [0.05, 0.08, 0.06]; // very quiet songs
    const result = computeCrowdEnergy(peaks, 1, 3, 0.05);
    expect(result.excitement).toBeLessThan(0.3);
  });

  it("fatigue doesn't build without streak", () => {
    // Alternating high/low — no consecutive streak > 2
    const peaks = [0.4, 0.05, 0.4, 0.05, 0.4];
    const result = computeCrowdEnergy(peaks, 1, 5, 0.2);
    // Last song is 0.4 (high), streak = 1
    expect(result.fatigue).toBe(0);
  });
});
