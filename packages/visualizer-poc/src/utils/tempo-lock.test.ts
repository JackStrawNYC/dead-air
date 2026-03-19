import { describe, it, expect } from "vitest";
import { computeTempoLock } from "./tempo-lock";

describe("computeTempoLock", () => {
  it("returns neutral for floating groove", () => {
    const result = computeTempoLock(4.5, "floating", 0.8, 0.2);
    expect(result.lockStrength).toBe(0);
    expect(result.overlayBreathing).toBe(1);
    expect(result.zoomPulse).toBe(1);
  });

  it("returns neutral for very low beat stability", () => {
    const result = computeTempoLock(4.5, "pocket", 0.1, 0.2);
    expect(result.lockStrength).toBe(0);
    expect(result.overlayBreathing).toBe(1);
  });

  it("returns neutral for near-silence", () => {
    const result = computeTempoLock(4.5, "driving", 0.8, 0.02);
    expect(result.lockStrength).toBe(0);
  });

  it("applies full lock for pocket groove with stable beats", () => {
    const result = computeTempoLock(4.25, "pocket", 0.8, 0.2);
    expect(result.lockStrength).toBeGreaterThan(0.9);
    expect(result.overlayBreathing).not.toBe(1);
    expect(result.zoomPulse).not.toBe(1);
  });

  it("applies full lock for driving groove", () => {
    const result = computeTempoLock(8.0, "driving", 0.9, 0.3);
    expect(result.lockStrength).toBeGreaterThan(0.9);
  });

  it("applies partial lock for freeform groove", () => {
    const result = computeTempoLock(4.5, "freeform", 0.8, 0.2);
    expect(result.lockStrength).toBeGreaterThan(0.3);
    expect(result.lockStrength).toBeLessThan(0.7);
  });

  it("overlay breathing peaks at integer beats (downbeats)", () => {
    // At musicalTime = 0 (downbeat), cos(0) = 1 → breathing > 1
    const atBeat = computeTempoLock(0, "pocket", 0.9, 0.3);
    // At musicalTime = 1 (next beat), cos(π) = -1 → breathing < 1
    const atUpbeat = computeTempoLock(1, "pocket", 0.9, 0.3);
    expect(atBeat.overlayBreathing).toBeGreaterThan(1);
    expect(atUpbeat.overlayBreathing).toBeLessThan(1);
  });

  it("zoom pulse peaks at beat hit and decays", () => {
    // Right at a beat (phase = 0)
    const atBeat = computeTempoLock(4.0, "driving", 0.9, 0.3);
    // Halfway through beat (phase = 0.5)
    const midBeat = computeTempoLock(4.5, "driving", 0.9, 0.3);
    expect(atBeat.zoomPulse).toBeGreaterThan(midBeat.zoomPulse);
  });

  it("beat and bar phase are correct", () => {
    const result = computeTempoLock(6.75, "pocket", 0.8, 0.2);
    expect(result.beatPhase).toBeCloseTo(0.75, 2);
    expect(result.barPhase).toBeCloseTo(2.75 / 4, 2);
  });

  it("overlay breathing amplitude scales with energy", () => {
    const lowEnergy = computeTempoLock(0, "pocket", 0.9, 0.1);
    const highEnergy = computeTempoLock(0, "pocket", 0.9, 0.4);
    // Both > 1 at downbeat, but high energy should be more extreme
    expect(highEnergy.overlayBreathing).toBeGreaterThan(lowEnergy.overlayBreathing);
  });

  it("all values stay in safe ranges", () => {
    // Test across many musical times
    for (let t = 0; t < 100; t += 0.3) {
      const r = computeTempoLock(t, "driving", 1.0, 0.5);
      expect(r.overlayBreathing).toBeGreaterThan(0.85);
      expect(r.overlayBreathing).toBeLessThan(1.15);
      expect(r.zoomPulse).toBeGreaterThanOrEqual(1);
      expect(r.zoomPulse).toBeLessThan(1.005);
      expect(r.beatPhase).toBeGreaterThanOrEqual(0);
      expect(r.beatPhase).toBeLessThan(1);
      expect(r.barPhase).toBeGreaterThanOrEqual(0);
      expect(r.barPhase).toBeLessThan(1);
    }
  });
});
