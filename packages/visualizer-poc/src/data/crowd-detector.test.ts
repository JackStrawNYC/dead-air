import { describe, it, expect } from "vitest";
import { detectCrowdMoments } from "./crowd-detector";
import type { EnhancedFrameData } from "./types";

/** Create a minimal frame with configurable flatness, rms, and onset */
function makeFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.05,
    centroid: 0.5,
    onset: 0,
    beat: false,
    sub: 0.1,
    low: 0.1,
    mid: 0.1,
    high: 0.1,
    chroma: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    contrast: [0, 0, 0, 0, 0, 0, 0],
    flatness: 0.05,
    ...overrides,
  };
}

describe("detectCrowdMoments", () => {
  it("returns empty for empty frames", () => {
    expect(detectCrowdMoments([])).toEqual([]);
  });

  it("returns empty for quiet frames", () => {
    const frames = Array.from({ length: 100 }, () => makeFrame());
    expect(detectCrowdMoments(frames)).toEqual([]);
  });

  it("returns empty for loud but tonal frames (low flatness)", () => {
    const frames = Array.from({ length: 100 }, () =>
      makeFrame({ rms: 0.3, flatness: 0.05 })
    );
    expect(detectCrowdMoments(frames)).toEqual([]);
  });

  it("detects sustained crowd noise (high flatness + moderate rms)", () => {
    const frames: EnhancedFrameData[] = [
      // 10 frames of quiet
      ...Array.from({ length: 10 }, () => makeFrame()),
      // 60 frames of crowd noise
      ...Array.from({ length: 60 }, () =>
        makeFrame({ rms: 0.2, flatness: 0.25, onset: 0 })
      ),
      // 10 frames of quiet
      ...Array.from({ length: 10 }, () => makeFrame()),
    ];

    const moments = detectCrowdMoments(frames);
    expect(moments).toHaveLength(1);
    expect(moments[0].frameStart).toBe(10);
    expect(moments[0].frameEnd).toBe(70);
    expect(moments[0].avgIntensity).toBeCloseTo(0.2);
  });

  it("rejects short bursts (less than 30 frames)", () => {
    const frames: EnhancedFrameData[] = [
      ...Array.from({ length: 10 }, () => makeFrame()),
      // Only 20 frames — below 30-frame minimum
      ...Array.from({ length: 20 }, () =>
        makeFrame({ rms: 0.2, flatness: 0.25 })
      ),
      ...Array.from({ length: 10 }, () => makeFrame()),
    ];

    expect(detectCrowdMoments(frames)).toEqual([]);
  });

  it("rejects noisy frames with too many onsets (not crowd-like)", () => {
    const frames: EnhancedFrameData[] = Array.from({ length: 60 }, () =>
      makeFrame({ rms: 0.3, flatness: 0.25, onset: 0.8 }) // high onset density
    );

    expect(detectCrowdMoments(frames)).toEqual([]);
  });

  it("detects multiple separated moments", () => {
    const frames: EnhancedFrameData[] = [
      ...Array.from({ length: 40 }, () => makeFrame({ rms: 0.2, flatness: 0.25 })),
      ...Array.from({ length: 20 }, () => makeFrame()),
      ...Array.from({ length: 40 }, () => makeFrame({ rms: 0.15, flatness: 0.20 })),
    ];

    const moments = detectCrowdMoments(frames);
    expect(moments).toHaveLength(2);
  });

  it("handles crowd noise extending to end of track", () => {
    const frames: EnhancedFrameData[] = [
      ...Array.from({ length: 10 }, () => makeFrame()),
      ...Array.from({ length: 50 }, () =>
        makeFrame({ rms: 0.2, flatness: 0.25 })
      ),
    ];

    const moments = detectCrowdMoments(frames);
    expect(moments).toHaveLength(1);
    expect(moments[0].frameEnd).toBe(60);
  });
});
