import { describe, it, expect } from "vitest";
import { detectChordMood } from "./chord-mood";
import type { EnhancedFrameData } from "../data/types";

/** Helper to build a mock frame with sensible defaults */
function mockFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.3,
    centroid: 0.5,
    onset: 0,
    beat: false,
    sub: 0.2,
    low: 0.3,
    mid: 0.4,
    high: 0.3,
    chroma: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    contrast: [0, 0, 0, 0, 0, 0, 0],
    flatness: 0,
    beatConfidence: 0.5,
    ...overrides,
  } as EnhancedFrameData;
}

describe("detectChordMood", () => {
  it("mostly major chords + low tension → luminous with aurora in preferred modes", () => {
    // C major = index 0, denormalized: 0/23 = 0.0
    // G major = index 7, denormalized: 7/23 ≈ 0.304
    const frames = Array.from({ length: 60 }, (_, i) =>
      mockFrame({
        chordIndex: i % 2 === 0 ? 0 / 23 : 7 / 23,
        harmonicTension: 0.1,
        chordConfidence: 0.8,
      }),
    );
    const result = detectChordMood(frames, 30);
    expect(result.mood).toBe("luminous");
    expect(result.preferredModes).toContain("aurora");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("mostly minor chords + low tension → shadowed with deep_ocean in preferred modes", () => {
    // Am = index 21, denormalized: 21/23 ≈ 0.913
    // Dm = index 14, denormalized: 14/23 ≈ 0.609
    const frames = Array.from({ length: 60 }, (_, i) =>
      mockFrame({
        chordIndex: i % 2 === 0 ? 21 / 23 : 14 / 23,
        harmonicTension: 0.15,
        chordConfidence: 0.8,
      }),
    );
    const result = detectChordMood(frames, 30);
    expect(result.mood).toBe("shadowed");
    expect(result.preferredModes).toContain("deep_ocean");
  });

  it("high tension → turbulent with fluid_2d in preferred modes", () => {
    // Mix of chords, but high tension dominates
    const frames = Array.from({ length: 60 }, (_, i) =>
      mockFrame({
        chordIndex: (i % 12) / 23,
        harmonicTension: 0.7,
        chordConfidence: 0.6,
      }),
    );
    const result = detectChordMood(frames, 30);
    expect(result.mood).toBe("turbulent");
    expect(result.preferredModes).toContain("fluid_2d");
  });

  it("neutral (equal major/minor, moderate tension) → grounded with oil_projector", () => {
    // Alternate between major C (0) and minor Cm (12/23 ≈ 0.522)
    const frames = Array.from({ length: 60 }, (_, i) =>
      mockFrame({
        chordIndex: i % 2 === 0 ? 0 / 23 : 12 / 23,
        harmonicTension: 0.4,
        chordConfidence: 0.5,
      }),
    );
    const result = detectChordMood(frames, 30);
    expect(result.mood).toBe("grounded");
    expect(result.preferredModes).toContain("oil_projector");
  });

  it("empty frames (count=0) → grounded with zero confidence", () => {
    const result = detectChordMood([], 0);
    expect(result.mood).toBe("grounded");
    expect(result.confidence).toBe(0);
    expect(result.preferredModes).toEqual([]);
  });

  it("confidence is always between 0 and 1", () => {
    const frames = Array.from({ length: 60 }, () =>
      mockFrame({
        chordIndex: 0,
        harmonicTension: 0.2,
        chordConfidence: 1.0,
        rms: 0.3,
      }),
    );
    const result = detectChordMood(frames, 30);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("respects custom windowSize parameter", () => {
    // Build 100 frames: first 20 minor, rest major
    const frames = Array.from({ length: 100 }, (_, i) =>
      mockFrame({
        chordIndex: i < 20 ? 21 / 23 : 0 / 23,
        harmonicTension: 0.1,
        chordConfidence: 0.8,
      }),
    );
    // With a small window centered at frame 10 (in minor territory)
    const smallWindow = detectChordMood(frames, 10, 20);
    // With a large window centered at frame 50 (mostly major territory)
    const largeWindow = detectChordMood(frames, 50, 100);
    // Small window at minor region should be shadowed
    expect(smallWindow.mood).toBe("shadowed");
    // Large window at major region should be luminous
    expect(largeWindow.mood).toBe("luminous");
  });
});
