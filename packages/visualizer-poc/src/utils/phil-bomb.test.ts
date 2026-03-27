import { describe, it, expect } from "vitest";
import { detectPhilBomb } from "./phil-bomb";
import type { EnhancedFrameData } from "../data/types";

function makeFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.1, onset: 0, beat: false, centroid: 0.5,
    sub: 0, low: 0, mid: 0, high: 0, presence: 0,
    chroma: [0,0,0,0,0,0,0,0,0,0,0,0],
    contrast: [0,0,0,0,0,0,0],
    ...overrides,
  } as EnhancedFrameData;
}

describe("detectPhilBomb", () => {
  it("returns 0 when no bass bomb present", () => {
    const frames = Array.from({ length: 20 }, () => makeFrame({ stemBassRms: 0.3, onset: 0.2 }));
    expect(detectPhilBomb(frames, 10)).toBe(0);
  });

  it("returns high intensity on bomb frame", () => {
    const frames = Array.from({ length: 20 }, () => makeFrame());
    frames[10] = makeFrame({ stemBassRms: 0.9, onset: 0.8 });
    const result = detectPhilBomb(frames, 10);
    expect(result).toBeGreaterThan(0.8);
  });

  it("decays over subsequent frames", () => {
    const frames = Array.from({ length: 20 }, () => makeFrame());
    frames[10] = makeFrame({ stemBassRms: 0.9, onset: 0.8 });
    const atBomb = detectPhilBomb(frames, 10);
    const after3 = detectPhilBomb(frames, 13);
    expect(after3).toBeGreaterThan(0);
    expect(after3).toBeLessThan(atBomb);
  });

  it("returns 0 after decay window passes", () => {
    const frames = Array.from({ length: 30 }, () => makeFrame());
    frames[10] = makeFrame({ stemBassRms: 0.9, onset: 0.8 });
    expect(detectPhilBomb(frames, 20)).toBe(0);
  });

  it("handles missing stemBassRms gracefully", () => {
    const frames = Array.from({ length: 20 }, () => makeFrame());
    expect(detectPhilBomb(frames, 10)).toBe(0);
  });
});
