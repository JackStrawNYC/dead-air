import { describe, it, expect } from "vitest";
import { computeJamEvolution } from "./jam-evolution";
import type { EnhancedFrameData } from "../data/types";

function makeFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.1,
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
    ...overrides,
  };
}

describe("computeJamEvolution", () => {
  it("returns isLongJam=false for short songs", () => {
    // 5 minutes = 9000 frames (< 18000 threshold)
    const frames = Array.from({ length: 9000 }, () => makeFrame());
    const result = computeJamEvolution(frames, 4500);
    expect(result.isLongJam).toBe(false);
    expect(result.densityMult).toBe(1);
  });

  it("returns isLongJam=true for 10+ minute songs", () => {
    // 12 minutes = 21600 frames (> 18000 threshold)
    const frames = Array.from({ length: 21600 }, (_, i) =>
      makeFrame({ rms: 0.05 + Math.sin(i / 5000) * 0.15 }),
    );
    const result = computeJamEvolution(frames, 10000);
    expect(result.isLongJam).toBe(true);
  });

  it("exploration phase at beginning of long jam", () => {
    const frames = Array.from({ length: 21600 }, (_, i) => {
      // Energy arc: low → high → low
      const progress = i / 21600;
      const energy = 0.05 + Math.sin(progress * Math.PI) * 0.25;
      return makeFrame({ rms: energy });
    });
    const result = computeJamEvolution(frames, 500);
    expect(result.phase).toBe("exploration");
    expect(result.songProgress).toBeLessThan(0.1);
  });

  it("peak_space phase near energy peak", () => {
    const frames = Array.from({ length: 21600 }, (_, i) => {
      const progress = i / 21600;
      const energy = 0.05 + Math.sin(progress * Math.PI) * 0.25;
      return makeFrame({ rms: energy });
    });
    // At 50% through song (near the peak of the sine arc)
    const result = computeJamEvolution(frames, 10800);
    expect(["peak_space", "building"]).toContain(result.phase);
  });

  it("resolution phase near end of long jam", () => {
    const frames = Array.from({ length: 21600 }, (_, i) => {
      const progress = i / 21600;
      const energy = 0.05 + Math.sin(progress * Math.PI) * 0.25;
      return makeFrame({ rms: energy });
    });
    const result = computeJamEvolution(frames, 20000);
    expect(result.phase).toBe("resolution");
    expect(result.songProgress).toBeGreaterThan(0.9);
  });

  it("color temperature is cool during exploration", () => {
    const frames = Array.from({ length: 21600 }, (_, i) => {
      const progress = i / 21600;
      return makeFrame({ rms: 0.05 + Math.sin(progress * Math.PI) * 0.25 });
    });
    const result = computeJamEvolution(frames, 500);
    expect(result.colorTemperature).toBeLessThan(0);
  });

  it("density multiplier is sparse during exploration", () => {
    const frames = Array.from({ length: 21600 }, (_, i) => {
      const progress = i / 21600;
      return makeFrame({ rms: 0.05 + Math.sin(progress * Math.PI) * 0.25 });
    });
    const result = computeJamEvolution(frames, 500);
    expect(result.densityMult).toBeLessThan(1);
  });

  it("songProgress is accurate", () => {
    const frames = Array.from({ length: 21600 }, () => makeFrame());
    const result = computeJamEvolution(frames, 10800);
    expect(result.songProgress).toBeCloseTo(0.5, 1);
  });
});
