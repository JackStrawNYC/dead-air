import { describe, it, expect } from "vitest";
import { computeCounterpoint } from "./visual-counterpoint";
import type { EnhancedFrameData } from "../data/types";

/** Create a minimal frame with sensible defaults */
function makeFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.2,
    centroid: 0.3,
    flatness: 0.05,
    sub: 0.1,
    low: 0.3,
    mid: 0.25,
    high: 0.2,
    contrast: [0, 0, 0, 0, 0, 0, 0],
    chroma: [0.5, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
    onset: 0.1,
    beat: false,
    downbeat: false,
    beatConfidence: 0,
    stemVocalPresence: false,
    stemDrumOnset: 0,
    stemDrumBeat: false,
    stemOtherCentroid: 0,
    melodicPitch: 0,
    melodicConfidence: 0,
    melodicDirection: 0,
    chordIndex: 0,
    harmonicTension: 0,
    sectionType: "jam",
    energyForecast: 0,
    peakApproaching: 0,
    beatStability: 0,
    ...overrides,
  } as EnhancedFrameData;
}

/** Create an array of N frames with the same properties */
function makeFrames(count: number, overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData[] {
  return Array.from({ length: count }, () => makeFrame(overrides));
}

describe("computeCounterpoint", () => {
  // --- Peak desaturation ---

  it("triggers peak desaturation when energy > 0.35 and onset > 0.6", () => {
    const frames = [makeFrame({ rms: 0.5, onset: 0.8 })];
    const result = computeCounterpoint(frames, 0, "idle");
    expect(result.saturationMult).toBeLessThan(1.0);
    expect(result.saturationMult).toBeCloseTo(0.5, 1);
  });

  it("recovers saturation over time after peak desaturation", () => {
    // Frame 0: peak, frames 1-50: quiet
    const frames = [
      makeFrame({ rms: 0.5, onset: 0.8 }),
      ...makeFrames(50, { rms: 0.1, onset: 0.1 }),
    ];

    // 20 frames later: partially recovered
    const mid = computeCounterpoint(frames, 20, "idle");
    expect(mid.saturationMult).toBeGreaterThan(0.5);
    expect(mid.saturationMult).toBeLessThan(1.0);

    // 46+ frames later: fully recovered
    const late = computeCounterpoint(frames, 46, "idle");
    expect(late.saturationMult).toBeCloseTo(1.0, 1);
  });

  it("does NOT trigger desaturation when only energy is high", () => {
    const frames = [makeFrame({ rms: 0.5, onset: 0.3 })];
    const result = computeCounterpoint(frames, 0, "idle");
    expect(result.saturationMult).toBeCloseTo(1.0, 1);
  });

  // --- Quiet flooding ---

  it("triggers quiet flooding after 60+ consecutive low-energy frames", () => {
    const frames = makeFrames(90, { rms: 0.05 });
    const result = computeCounterpoint(frames, 89, "idle");
    expect(result.saturationMult).toBeGreaterThan(1.0);
    expect(result.saturationMult).toBeLessThanOrEqual(1.3);
  });

  it("resets quiet flooding on any non-quiet frame", () => {
    // 50 quiet, 1 loud, 20 quiet
    const frames = [
      ...makeFrames(50, { rms: 0.05 }),
      makeFrame({ rms: 0.3 }),
      ...makeFrames(20, { rms: 0.05 }),
    ];
    // At frame 70: only 20 quiet frames since the loud one — shouldn't flood
    const result = computeCounterpoint(frames, 70, "idle");
    expect(result.saturationMult).toBeCloseTo(1.0, 1);
  });

  // --- Bass isolation ---

  it("triggers strong overlay inversion during bass isolation", () => {
    const frames = [makeFrame({ low: 0.6, high: 0.1 })];
    const result = computeCounterpoint(frames, 0, "idle");
    expect(result.overlayInversion).toBeCloseTo(0.8, 1);
  });

  it("triggers gentle overlay inversion for moderate bass", () => {
    const frames = [makeFrame({ low: 0.45, high: 0.15 })];
    const result = computeCounterpoint(frames, 0, "idle");
    expect(result.overlayInversion).toBeCloseTo(0.3, 1);
  });

  it("no overlay inversion when bass is low or highs are present", () => {
    const frames = [makeFrame({ low: 0.2, high: 0.4 })];
    const result = computeCounterpoint(frames, 0, "idle");
    expect(result.overlayInversion).toBe(0);
  });

  // --- Downbeat freeze ---

  it("freezes camera during climax on strong beat", () => {
    const frames = [makeFrame({ beat: true, onset: 0.7 })];
    const result = computeCounterpoint(frames, 0, "climax");
    expect(result.cameraFreeze).toBe(true);
    expect(result.cameraFreezeFrames).toBeGreaterThan(0);
  });

  it("freezes camera during sustain on strong beat", () => {
    const frames = [makeFrame({ beat: true, onset: 0.7 })];
    const result = computeCounterpoint(frames, 0, "sustain");
    expect(result.cameraFreeze).toBe(true);
  });

  it("does NOT freeze camera during idle/build/release", () => {
    const frames = [makeFrame({ beat: true, onset: 0.7 })];
    for (const phase of ["idle", "build", "release"] as const) {
      const result = computeCounterpoint(frames, 0, phase);
      expect(result.cameraFreeze).toBe(false);
    }
  });

  it("camera freeze persists for nearby frames", () => {
    // Beat at frame 0, check frame 5 (within FREEZE_DURATION)
    const frames = [
      makeFrame({ beat: true, onset: 0.7 }),
      ...makeFrames(14),
    ];
    const f5 = computeCounterpoint(frames, 5, "climax");
    expect(f5.cameraFreeze).toBe(true);

    // Beyond freeze duration
    const f12 = computeCounterpoint(frames, 12, "climax");
    expect(f12.cameraFreeze).toBe(false);
  });

  // --- Brightness counterpoint ---

  it("triggers brightness dip on energy transients", () => {
    const frames = [makeFrame({ rms: 0.5, onset: 0.7 })];
    const result = computeCounterpoint(frames, 0, "idle");
    expect(result.brightnessCounterpoint).toBeLessThan(0);
    expect(result.brightnessCounterpoint).toBeCloseTo(-0.08, 2);
  });

  it("recovers brightness after transient", () => {
    const frames = [
      makeFrame({ rms: 0.5, onset: 0.7 }),
      ...makeFrames(25, { rms: 0.1, onset: 0.1 }),
    ];
    // Midway through recovery
    const mid = computeCounterpoint(frames, 10, "idle");
    expect(mid.brightnessCounterpoint).toBeLessThan(0);
    expect(mid.brightnessCounterpoint).toBeGreaterThan(-0.08);

    // Fully recovered
    const late = computeCounterpoint(frames, 21, "idle");
    expect(late.brightnessCounterpoint).toBeCloseTo(0, 2);
  });

  // --- Determinism ---

  it("is deterministic — same inputs produce same outputs", () => {
    const frames = [
      ...makeFrames(50, { rms: 0.05 }),
      makeFrame({ rms: 0.5, onset: 0.8 }),
      ...makeFrames(30),
    ];
    const r1 = computeCounterpoint(frames, 50, "climax");
    const r2 = computeCounterpoint(frames, 50, "climax");
    expect(r1).toEqual(r2);
  });

  it("returns neutral values for empty frames", () => {
    const result = computeCounterpoint([], 0, "idle");
    expect(result.saturationMult).toBe(1);
    expect(result.overlayInversion).toBe(0);
    expect(result.cameraFreeze).toBe(false);
    expect(result.brightnessCounterpoint).toBe(0);
  });
});
