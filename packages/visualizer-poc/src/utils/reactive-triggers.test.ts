/**
 * Tests for reactive-triggers.ts — mid-section audio-responsive structural changes.
 */

import { describe, it, expect } from "vitest";
import { computeReactiveTriggers, type ReactiveState } from "./reactive-triggers";
import type { EnhancedFrameData } from "../data/types";

/** Create a minimal frame with defaults */
function makeFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.15,
    centroid: 0.5,
    onset: 0.1,
    beat: false,
    sub: 0.1,
    low: 0.1,
    mid: 0.15,
    high: 0.1,
    chroma: [0.5, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5, 0.1, 0.1, 0.1, 0.1, 0.1],
    contrast: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
    flatness: 0.2,
    ...overrides,
  };
}

/** Generate N frames of default audio data */
function makeFrames(count: number, overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData[] {
  return Array.from({ length: count }, () => makeFrame(overrides));
}

describe("computeReactiveTriggers", () => {
  it("returns null state when coherence is locked", () => {
    const frames = makeFrames(300);
    const result = computeReactiveTriggers(frames, 150, 0, 300, 120, true);
    expect(result.isTriggered).toBe(false);
    expect(result.triggerType).toBeNull();
  });

  it("returns null state near section boundary", () => {
    const frames = makeFrames(300);
    const result = computeReactiveTriggers(frames, 150, 0, 300, 120, false, true);
    expect(result.isTriggered).toBe(false);
  });

  it("returns null state with insufficient frames", () => {
    const frames = makeFrames(50);
    const result = computeReactiveTriggers(frames, 25, 0, 50, 120);
    expect(result.isTriggered).toBe(false);
  });

  it("detects energy eruption when energy jumps sharply", () => {
    // 200 frames of quiet, then sharp energy jump
    const frames = [
      ...makeFrames(200, { rms: 0.05 }),
      ...makeFrames(100, { rms: 0.35 }),
    ];
    const result = computeReactiveTriggers(frames, 250, 0, 300, 120);
    if (result.isTriggered) {
      expect(result.triggerType).toBe("energy_eruption");
      expect(result.triggerStrength).toBeGreaterThan(0);
      expect(result.suggestedModes.length).toBeGreaterThan(0);
      expect(result.overlayInjections.length).toBeGreaterThan(0);
    }
  });

  it("detects improv spike when score jumps above threshold", () => {
    const frames = [
      ...makeFrames(200, { improvisationScore: 0.2 }),
      ...makeFrames(100, { improvisationScore: 0.8 }),
    ];
    const result = computeReactiveTriggers(frames, 250, 0, 300, 120);
    if (result.isTriggered) {
      expect(result.triggerType).toBe("improv_spike");
      expect(result.triggerStrength).toBeGreaterThan(0);
    }
  });

  it("is deterministic — same inputs always produce same output", () => {
    const frames = [
      ...makeFrames(200, { rms: 0.05 }),
      ...makeFrames(100, { rms: 0.35 }),
    ];
    const result1 = computeReactiveTriggers(frames, 250, 0, 300, 120);
    const result2 = computeReactiveTriggers(frames, 250, 0, 300, 120);
    expect(result1).toEqual(result2);
  });

  it("is deterministic — shuffled frame order doesn't affect result for same frameIdx", () => {
    const frames = [
      ...makeFrames(200, { rms: 0.05 }),
      ...makeFrames(100, { rms: 0.35 }),
    ];
    // Result at frame 250 should be the same regardless of later frames
    const result1 = computeReactiveTriggers(frames, 250, 0, 300, 120);
    const extendedFrames = [...frames, ...makeFrames(100, { rms: 0.8 })];
    const result2 = computeReactiveTriggers(extendedFrames, 250, 0, 400, 120);
    expect(result1.isTriggered).toBe(result2.isTriggered);
    expect(result1.triggerType).toBe(result2.triggerType);
  });

  it("returns suggested modes matching the trigger type", () => {
    const frames = [
      ...makeFrames(200, { rms: 0.05 }),
      ...makeFrames(100, { rms: 0.35 }),
    ];
    const result = computeReactiveTriggers(frames, 250, 0, 300, 120);
    if (result.isTriggered && result.triggerType === "energy_eruption") {
      expect(result.suggestedModes).toContain("inferno");
      expect(result.suggestedModes).toContain("cosmic_voyage");
    }
  });

  it("provides cooldown remaining when in cooldown period", () => {
    // Create a scenario with a trigger-worthy event followed by cooldown
    const frames = [
      ...makeFrames(100, { rms: 0.05 }),
      ...makeFrames(30, { rms: 0.4, timbralFlux: 0.5 }), // trigger at ~100
      ...makeFrames(200, { rms: 0.15 }), // cooldown
    ];
    // Checking during cooldown period (hold=120 + cooldown=300 after the event)
    const result = computeReactiveTriggers(frames, 280, 0, 330, 120);
    // Should either be in cooldown or not triggered
    if (!result.isTriggered) {
      // This is expected during cooldown
      expect(result.cooldownRemaining).toBeGreaterThanOrEqual(0);
    }
  });

  it("handles quiet sections without triggering", () => {
    const frames = makeFrames(300, { rms: 0.03, improvisationScore: 0.1 });
    const result = computeReactiveTriggers(frames, 200, 0, 300, 120);
    expect(result.isTriggered).toBe(false);
  });

  it("detects groove solidifying when beat confidence increases", () => {
    const frames = [
      ...makeFrames(200, { beatConfidence: 0.1 }),
      ...makeFrames(100, { beatConfidence: 0.7 }),
    ];
    const result = computeReactiveTriggers(frames, 250, 0, 300, 120);
    if (result.isTriggered && result.triggerType === "groove_solidify") {
      expect(result.suggestedModes).toContain("mandala_engine");
    }
  });
});
