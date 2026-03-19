import { describe, it, expect } from "vitest";
import { detectStemInterplay } from "./stem-interplay";
import type { EnhancedFrameData } from "../data/types";

// ─── Helpers ───

function makeFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.15,
    centroid: 0.5,
    onset: 0,
    beat: false,
    sub: 0.1,
    low: 0.1,
    mid: 0.15,
    high: 0.1,
    flatness: 0.3,
    chroma: [0,0,0,0,0,0,0,0,0,0,0,0],
    contrast: [0,0,0,0,0,0,0],
    ...overrides,
  };
}

/** Generate N frames with specified stem values */
function makeFrames(
  n: number,
  stems: { vocal?: number; drum?: number; bass?: number; other?: number },
): EnhancedFrameData[] {
  return Array.from({ length: n }, () =>
    makeFrame({
      stemVocalRms: stems.vocal ?? 0,
      stemDrumOnset: stems.drum ?? 0,
      stemBassRms: stems.bass ?? 0,
      stemOtherRms: stems.other ?? 0,
    }),
  );
}

// ─── Tests ───

describe("detectStemInterplay", () => {
  it("returns textural-wash for too few frames", () => {
    const frames = makeFrames(3, { vocal: 0.1, drum: 0.1 });
    const result = detectStemInterplay(frames, 2);
    expect(result.mode).toBe("textural-wash");
    expect(result.confidence).toBe(0);
  });

  it("detects textural-wash when all stems are quiet", () => {
    const frames = makeFrames(30, { vocal: 0.02, drum: 0.01, bass: 0.03, other: 0.02 });
    const result = detectStemInterplay(frames, 29);
    expect(result.mode).toBe("textural-wash");
    expect(result.densityMult).toBeLessThan(1);
    expect(result.motionMult).toBeGreaterThan(1);
    expect(result.colorConvergence).toBeLessThan(0.5);
  });

  it("detects solo-spotlight when one stem dominates", () => {
    const frames = makeFrames(30, { vocal: 0, drum: 0.02, bass: 0.03, other: 0.4 });
    const result = detectStemInterplay(frames, 29);
    expect(result.mode).toBe("solo-spotlight");
    expect(result.spotlightStem).toBe("guitar");
    expect(result.motionMult).toBeLessThan(1);
    expect(result.densityMult).toBeLessThan(1);
  });

  it("detects vocal solo-spotlight", () => {
    const frames = makeFrames(30, { vocal: 0.5, drum: 0.05, bass: 0.05, other: 0.05 });
    const result = detectStemInterplay(frames, 29);
    expect(result.mode).toBe("solo-spotlight");
    expect(result.spotlightStem).toBe("vocal");
  });

  it("detects tight-lock when stems are correlated", () => {
    // All stems rise together over 30 frames
    const frames: EnhancedFrameData[] = [];
    for (let i = 0; i < 30; i++) {
      const ramp = i / 30;
      frames.push(
        makeFrame({
          stemVocalRms: 0.1 + ramp * 0.3,
          stemDrumOnset: 0.1 + ramp * 0.25,
          stemBassRms: 0.1 + ramp * 0.2,
          stemOtherRms: 0.1 + ramp * 0.35,
        }),
      );
    }
    const result = detectStemInterplay(frames, 29);
    expect(result.mode).toBe("tight-lock");
    expect(result.densityMult).toBeGreaterThan(1);
    expect(result.colorConvergence).toBeGreaterThan(0.7);
  });

  it("detects call-response when stems alternate", () => {
    // Stems alternate: vocal high when guitar low, and vice versa
    const frames: EnhancedFrameData[] = [];
    for (let i = 0; i < 30; i++) {
      const phase = i % 2 === 0;
      frames.push(
        makeFrame({
          stemVocalRms: phase ? 0.4 : 0.05,
          stemDrumOnset: 0.15,
          stemBassRms: 0.15,
          stemOtherRms: phase ? 0.05 : 0.4,
        }),
      );
    }
    const result = detectStemInterplay(frames, 29);
    expect(result.mode).toBe("call-response");
    expect(result.colorConvergence).toBeCloseTo(0.5, 1);
  });

  it("returns modulation values in expected ranges", () => {
    const frames = makeFrames(30, { vocal: 0.2, drum: 0.2, bass: 0.2, other: 0.2 });
    const result = detectStemInterplay(frames, 29);
    expect(result.densityMult).toBeGreaterThanOrEqual(0.7);
    expect(result.densityMult).toBeLessThanOrEqual(1.3);
    expect(result.motionMult).toBeGreaterThanOrEqual(0.6);
    expect(result.motionMult).toBeLessThanOrEqual(1.2);
    expect(result.colorConvergence).toBeGreaterThanOrEqual(0);
    expect(result.colorConvergence).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("handles window at start of frames array", () => {
    const frames = makeFrames(10, { vocal: 0.2, drum: 0.2, bass: 0.2, other: 0.2 });
    const result = detectStemInterplay(frames, 0);
    expect(result).toBeDefined();
    expect(result.mode).toBeDefined();
  });

  it("handles frames with no stem data (falls back to spectral bands)", () => {
    // No stem fields at all — uses mid/high fallback for other
    const frames = Array.from({ length: 30 }, () =>
      makeFrame({ mid: 0.3, high: 0.2 }),
    );
    const result = detectStemInterplay(frames, 29);
    expect(result).toBeDefined();
  });
});
