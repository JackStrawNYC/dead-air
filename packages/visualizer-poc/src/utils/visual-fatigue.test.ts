import { describe, it, expect } from "vitest";
import { computeFatigueDampening, type FatigueInput } from "./visual-fatigue";

describe("computeFatigueDampening", () => {
  it("returns neutral for fresh show (< 6 songs)", () => {
    const input: FatigueInput = {
      songPeakEnergies: [0.3, 0.4, 0.5],
      currentSongAvgEnergy: 0.25,
      showMinutesElapsed: 20,
      songsCompleted: 3,
    };
    const result = computeFatigueDampening(input);
    expect(result.densityMult).toBe(1);
    expect(result.motionMult).toBe(1);
    expect(result.saturationOffset).toBe(0);
    expect(result.brightnessOffset).toBe(0);
  });

  it("returns neutral for short elapsed time (< 30 min)", () => {
    const input: FatigueInput = {
      songPeakEnergies: Array(8).fill(0.4),
      currentSongAvgEnergy: 0.25,
      showMinutesElapsed: 25,
      songsCompleted: 8,
    };
    const result = computeFatigueDampening(input);
    expect(result.densityMult).toBe(1);
  });

  it("dampens after 15+ high-energy songs over 90+ minutes", () => {
    const input: FatigueInput = {
      songPeakEnergies: Array(15).fill(0.6),
      currentSongAvgEnergy: 0.30,
      showMinutesElapsed: 105,
      songsCompleted: 15,
    };
    const result = computeFatigueDampening(input);
    expect(result.densityMult).toBeLessThan(1);
    expect(result.motionMult).toBeLessThan(1);
    expect(result.saturationOffset).toBeLessThan(0);
    expect(result.brightnessOffset).toBeLessThan(0);
  });

  it("quiet song reduces fatigue pressure", () => {
    const baseInput: FatigueInput = {
      songPeakEnergies: Array(15).fill(0.6),
      currentSongAvgEnergy: 0.30,
      showMinutesElapsed: 105,
      songsCompleted: 15,
    };
    const quietInput: FatigueInput = {
      ...baseInput,
      currentSongAvgEnergy: 0.08,
    };
    const loud = computeFatigueDampening(baseInput);
    const quiet = computeFatigueDampening(quietInput);
    // Quiet song should have less dampening (higher density mult)
    expect(quiet.densityMult).toBeGreaterThan(loud.densityMult);
  });

  it("encore gets fatigue reduction", () => {
    const input: FatigueInput = {
      songPeakEnergies: Array(18).fill(0.6),
      currentSongAvgEnergy: 0.25,
      showMinutesElapsed: 130,
      songsCompleted: 18,
    };
    const normal = computeFatigueDampening(input, false);
    const encore = computeFatigueDampening(input, true);
    // Encore should have less dampening
    expect(encore.densityMult).toBeGreaterThan(normal.densityMult);
  });

  it("low-energy show does not trigger dampening even late in show", () => {
    const input: FatigueInput = {
      songPeakEnergies: Array(12).fill(0.15),
      currentSongAvgEnergy: 0.10,
      showMinutesElapsed: 90,
      songsCompleted: 12,
    };
    const result = computeFatigueDampening(input);
    // Low-energy show: intensityScore ~0.15, fatigue factor = 1.0
    // pressure = 0.15 * 1.0 = 0.15 < 0.5 threshold
    expect(result.densityMult).toBe(1);
  });

  it("recent high-energy songs weight more than early ones", () => {
    const earlyHot: FatigueInput = {
      songPeakEnergies: [0.5, 0.5, 0.5, 0.5, 0.5, 0.1, 0.1, 0.1, 0.1, 0.1],
      currentSongAvgEnergy: 0.20,
      showMinutesElapsed: 70,
      songsCompleted: 10,
    };
    const lateHot: FatigueInput = {
      songPeakEnergies: [0.1, 0.1, 0.1, 0.1, 0.1, 0.5, 0.5, 0.5, 0.5, 0.5],
      currentSongAvgEnergy: 0.20,
      showMinutesElapsed: 70,
      songsCompleted: 10,
    };
    const earlyResult = computeFatigueDampening(earlyHot);
    const lateResult = computeFatigueDampening(lateHot);
    // Late hot should have more dampening (lower density mult)
    expect(lateResult.densityMult).toBeLessThanOrEqual(earlyResult.densityMult);
  });

  it("densityMult stays within bounds", () => {
    const extreme: FatigueInput = {
      songPeakEnergies: Array(25).fill(0.6),
      currentSongAvgEnergy: 0.5,
      showMinutesElapsed: 180,
      songsCompleted: 25,
    };
    const result = computeFatigueDampening(extreme);
    expect(result.densityMult).toBeGreaterThanOrEqual(0.80);
    expect(result.densityMult).toBeLessThanOrEqual(1);
    expect(result.motionMult).toBeGreaterThanOrEqual(0.7);
    expect(result.motionMult).toBeLessThanOrEqual(1);
    expect(result.saturationOffset).toBeGreaterThanOrEqual(-0.08);
    expect(result.saturationOffset).toBeLessThanOrEqual(0);
    expect(result.brightnessOffset).toBeGreaterThanOrEqual(-0.05);
    expect(result.brightnessOffset).toBeLessThanOrEqual(0);
  });
});
