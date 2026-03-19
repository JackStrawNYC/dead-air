import { describe, it, expect } from "vitest";
import { computeAfterJamQuality } from "./after-jam-quality";
import type { PrevSongContext } from "./show-narrative-precompute";

function makePrev(overrides: Partial<PrevSongContext> = {}): PrevSongContext {
  return {
    title: "Test Song",
    peakEnergy: 0.2,
    avgEnergy: 0.12,
    hadCoherenceLock: false,
    wasJamSegment: false,
    durationFrames: 9000,
    ...overrides,
  };
}

describe("computeAfterJamQuality", () => {
  it("returns default for null prev song", () => {
    const result = computeAfterJamQuality(null);
    expect(result.temperatureShift).toBe(0);
    expect(result.shimmerSpeed).toBe(1);
    expect(result.shimmerColor).toBeNull();
  });

  it("returns deep blue calm after Drums/Space", () => {
    const result = computeAfterJamQuality(makePrev({ wasJamSegment: true }));
    expect(result.temperatureShift).toBeLessThan(0);
    expect(result.shimmerSpeed).toBeLessThan(0.5);
    expect(result.shimmerColor).toBeTruthy();
    expect(result.shimmerColor!.b).toBeGreaterThan(result.shimmerColor!.r); // blue dominant
  });

  it("returns cool vast afterglow after massive jam", () => {
    const result = computeAfterJamQuality(makePrev({
      peakEnergy: 0.5,
      durationFrames: 15000, // long jam
      hadCoherenceLock: true,
    }));
    expect(result.temperatureShift).toBeLessThan(-0.2);
    expect(result.shimmerSpeed).toBeLessThan(0.6);
    expect(result.quoteDurationMult).toBeGreaterThan(1.2);
  });

  it("returns warm intimacy after tender ballad", () => {
    const result = computeAfterJamQuality(makePrev({
      peakEnergy: 0.08,
      avgEnergy: 0.05,
      durationFrames: 6000, // short
    }));
    expect(result.temperatureShift).toBeGreaterThan(0.2);
    expect(result.shimmerColor).toBeTruthy();
    expect(result.shimmerColor!.r).toBeGreaterThan(result.shimmerColor!.b); // warm
    expect(result.brightnessOffset).toBeGreaterThan(0);
  });

  it("returns warm gold after high-energy rock", () => {
    const result = computeAfterJamQuality(makePrev({
      peakEnergy: 0.4,
      durationFrames: 7000, // not a long jam
    }));
    expect(result.temperatureShift).toBeGreaterThan(0);
    expect(result.shimmerSpeed).toBeLessThan(1);
  });

  it("returns subtle warm for medium energy", () => {
    const result = computeAfterJamQuality(makePrev({
      peakEnergy: 0.2,
      avgEnergy: 0.12,
    }));
    expect(result.temperatureShift).toBeGreaterThanOrEqual(0);
    expect(result.shimmerSpeed).toBeGreaterThan(0.8);
  });

  it("high energy + coherence lock triggers massive jam path", () => {
    const result = computeAfterJamQuality(makePrev({
      peakEnergy: 0.4,
      hadCoherenceLock: true,
      durationFrames: 8000, // not long but has coherence
    }));
    expect(result.temperatureShift).toBeLessThan(0); // cool
    expect(result.quoteDurationMult).toBeGreaterThan(1);
  });
});
