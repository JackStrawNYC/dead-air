import { describe, it, expect } from "vitest";
import {
  computeDrumsSpacePhase,
  classifyRawPhase,
  getDrumsSpaceTreatment,
} from "./drums-space-phase";
import type { EnhancedFrameData } from "../data/types";

function makeFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.15,
    sub: 0.05,
    low: 0.05,
    mid: 0.1,
    high: 0.05,
    onset: 0.3,
    beat: false,
    centroid: 0.3,
    flatness: 0.2,
    chroma: [0.5, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
    contrast: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
    ...overrides,
  };
}

/** Generate N frames with given overrides */
function makeFrames(count: number, overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData[] {
  return Array.from({ length: count }, () => makeFrame(overrides));
}

describe("drums-space-phase", () => {
  it("returns null for non-drums/space songs", () => {
    const frames = makeFrames(50);
    const result = computeDrumsSpacePhase(frames, 40, false);
    expect(result).toBeNull();
  });

  it("high onset + low flatness → drums_tribal", () => {
    const frames = makeFrames(50, { onset: 0.6, rms: 0.25, flatness: 0.15, beat: true });
    const result = computeDrumsSpacePhase(frames, 45, true);
    expect(result).not.toBeNull();
    expect(result!.subPhase).toBe("drums_tribal");
  });

  it("low onset + high flatness → space_ambient", () => {
    const frames = makeFrames(50, { onset: 0.05, rms: 0.05, flatness: 0.6 });
    const result = computeDrumsSpacePhase(frames, 45, true);
    expect(result).not.toBeNull();
    expect(result!.subPhase).toBe("space_ambient");
  });

  it("rising onset from space → reemergence", () => {
    // First 30 frames: space_ambient
    const spaceFrames = makeFrames(30, { onset: 0.05, rms: 0.05, flatness: 0.6 });
    // Next 30 frames: onset rising but below tribal threshold
    const risingFrames = makeFrames(30, { onset: 0.25, rms: 0.10, flatness: 0.35 });
    const frames = [...spaceFrames, ...risingFrames];
    const result = computeDrumsSpacePhase(frames, 55, true);
    expect(result).not.toBeNull();
    // Should be reemergence, transition, or drums_tribal as band rebuilds
    expect(["reemergence", "transition", "drums_tribal"]).toContain(result!.subPhase);
  });

  it("phaseProgress increases with consecutive phase frames", () => {
    const frames = makeFrames(5, { onset: 0.6, rms: 0.25, flatness: 0.15, beat: true });
    const result1 = computeDrumsSpacePhase(frames, 2, true);
    expect(result1).not.toBeNull();

    // More frames of the same phase → higher progress
    const moreFrames = makeFrames(35, { onset: 0.6, rms: 0.25, flatness: 0.15, beat: true });
    const result2 = computeDrumsSpacePhase(moreFrames, 33, true);
    expect(result2!.phaseProgress).toBeGreaterThan(result1!.phaseProgress);
  });

  it("is deterministic — same frame always returns same result", () => {
    const frames = makeFrames(50, { onset: 0.6, rms: 0.25, flatness: 0.15, beat: true });
    const result1 = computeDrumsSpacePhase(frames, 40, true);
    // Call for a different frame first
    computeDrumsSpacePhase(frames, 10, true);
    // Same frame should give same result
    const result2 = computeDrumsSpacePhase(frames, 40, true);
    expect(result2!.subPhase).toBe(result1!.subPhase);
    expect(result2!.phaseProgress).toBe(result1!.phaseProgress);
  });

  describe("classifyRawPhase", () => {
    it("high onset + energy + low flatness + drum beat → drums_tribal", () => {
      const phase = classifyRawPhase(0.6, 0.25, 0.15, 0.4, false, 0.5);
      expect(phase).toBe("drums_tribal");
    });

    it("low onset + high flatness + low energy → space_ambient", () => {
      const phase = classifyRawPhase(0.05, 0.05, 0.6, 0.1, false, 0.3);
      expect(phase).toBe("space_ambient");
    });

    it("recently space + high coherence → reemergence", () => {
      const phase = classifyRawPhase(0.25, 0.10, 0.30, 0.3, true, 0.6);
      expect(phase).toBe("reemergence");
    });
  });
});

describe("getDrumsSpaceTreatment — space_ambient transcendent apex (audit Tier 1 #5)", () => {
  it("early space_ambient (progress 0.3) is suppressed (existing behavior)", () => {
    const t = getDrumsSpaceTreatment({
      subPhase: "space_ambient",
      phaseProgress: 0.3,
      reemergenceProgress: 0,
    });
    expect(t.brightnessOffset).toBeLessThan(0);
    expect(t.saturationOffset).toBeLessThan(0);
  });

  it("mid space_ambient (progress 0.6, before apex) stays in deep void", () => {
    const t = getDrumsSpaceTreatment({
      subPhase: "space_ambient",
      phaseProgress: 0.6,
      reemergenceProgress: 0,
    });
    // Pre-apex: brightness still negative (no apex lift yet)
    expect(t.brightnessOffset).toBeLessThan(-0.10);
  });

  it("deep space_ambient (progress 0.85, in apex) LIFTS brightness", () => {
    const early = getDrumsSpaceTreatment({
      subPhase: "space_ambient",
      phaseProgress: 0.5,
      reemergenceProgress: 0,
    });
    const apex = getDrumsSpaceTreatment({
      subPhase: "space_ambient",
      phaseProgress: 0.85,
      reemergenceProgress: 0,
    });
    expect(apex.brightnessOffset).toBeGreaterThan(early.brightnessOffset);
    expect(apex.saturationOffset).toBeGreaterThan(early.saturationOffset);
    expect(apex.hueShift).toBeGreaterThan(early.hueShift);
  });

  it("full space_ambient apex (progress 1.0) is brighter than baseline negative", () => {
    const t = getDrumsSpaceTreatment({
      subPhase: "space_ambient",
      phaseProgress: 1.0,
      reemergenceProgress: 0,
    });
    // Apex lift: brightnessOffset ends at +0.05 instead of -0.15
    expect(t.brightnessOffset).toBeGreaterThanOrEqual(0.0);
    expect(t.brightnessOffset).toBeLessThanOrEqual(0.10);
    expect(t.maxOverlays).toBe(1); // one iconic atmospheric overlay surfaces
  });

  it("space_textural at high progress does NOT trigger apex (only space_ambient)", () => {
    // The transcendent apex is intentionally exclusive to space_ambient —
    // textural gets a softer treatment without the gold lift.
    const ambient = getDrumsSpaceTreatment({
      subPhase: "space_ambient",
      phaseProgress: 1.0,
      reemergenceProgress: 0,
    });
    const textural = getDrumsSpaceTreatment({
      subPhase: "space_textural",
      phaseProgress: 1.0,
      reemergenceProgress: 0,
    });
    expect(ambient.brightnessOffset).toBeGreaterThan(textural.brightnessOffset);
  });
});
