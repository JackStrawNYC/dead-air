import { describe, it, expect, beforeEach } from "vitest";
import {
  computeCounterpoint,
  resetCounterpoint,
} from "./visual-counterpoint";
import type { AudioSnapshot } from "./audio-reactive";

function makeSnapshot(overrides: Partial<AudioSnapshot> = {}): AudioSnapshot {
  return {
    energy: 0.2,
    slowEnergy: 0.15,
    bass: 0.3,
    mids: 0.25,
    highs: 0.2,
    onsetEnvelope: 0.1,
    beatDecay: 0.0,
    chromaHue: 180,
    centroid: 0.3,
    flatness: 0.05,
    spectralFlux: 0.1,
    musicalTime: 0,
    ...overrides,
  };
}

describe("computeCounterpoint", () => {
  beforeEach(() => {
    resetCounterpoint();
  });

  // ─── Peak desaturation ───

  it("triggers peak desaturation when energy > 0.35 and onset > 0.6", () => {
    const snap = makeSnapshot({ energy: 0.5, onsetEnvelope: 0.8 });
    const result = computeCounterpoint(snap, "idle", 100);
    expect(result.saturationMult).toBeLessThan(1.0);
    expect(result.saturationMult).toBeCloseTo(0.5, 1);
  });

  it("recovers saturation over time after peak desaturation", () => {
    // Trigger desaturation
    const peakSnap = makeSnapshot({ energy: 0.5, onsetEnvelope: 0.8 });
    computeCounterpoint(peakSnap, "idle", 100);

    // 20 frames later: partially recovered
    const quietSnap = makeSnapshot({ energy: 0.1, onsetEnvelope: 0.1 });
    const mid = computeCounterpoint(quietSnap, "idle", 120);
    expect(mid.saturationMult).toBeGreaterThan(0.5);
    expect(mid.saturationMult).toBeLessThan(1.0);

    // 45+ frames later: fully recovered
    const late = computeCounterpoint(quietSnap, "idle", 200);
    expect(late.saturationMult).toBeCloseTo(1.0, 1);
  });

  it("does NOT trigger desaturation when only energy is high", () => {
    const snap = makeSnapshot({ energy: 0.5, onsetEnvelope: 0.3 });
    const result = computeCounterpoint(snap, "idle", 100);
    expect(result.saturationMult).toBeCloseTo(1.0, 1);
  });

  // ─── Quiet flooding ───

  it("triggers quiet flooding after 60+ consecutive low-energy frames", () => {
    const quietSnap = makeSnapshot({ energy: 0.05 });
    // Feed 90 consecutive quiet frames (past the 60-frame threshold)
    let result;
    for (let i = 0; i < 90; i++) {
      result = computeCounterpoint(quietSnap, "idle", i);
    }
    expect(result!.saturationMult).toBeGreaterThan(1.0);
    expect(result!.saturationMult).toBeLessThanOrEqual(1.3);
  });

  it("resets quiet flooding on any non-quiet frame", () => {
    const quietSnap = makeSnapshot({ energy: 0.05 });
    // Build up 50 quiet frames
    for (let i = 0; i < 50; i++) {
      computeCounterpoint(quietSnap, "idle", i);
    }
    // One loud frame resets the counter
    const loudSnap = makeSnapshot({ energy: 0.3 });
    computeCounterpoint(loudSnap, "idle", 50);

    // 20 more quiet frames shouldn't trigger flooding (total = 20, not 70)
    let result;
    for (let i = 51; i < 71; i++) {
      result = computeCounterpoint(quietSnap, "idle", i);
    }
    expect(result!.saturationMult).toBeCloseTo(1.0, 1);
  });

  // ─── Bass isolation ───

  it("triggers strong overlay inversion during bass isolation", () => {
    const snap = makeSnapshot({ bass: 0.6, highs: 0.1 });
    const result = computeCounterpoint(snap, "idle", 100);
    expect(result.overlayInversion).toBeCloseTo(0.8, 1);
  });

  it("triggers gentle overlay inversion for moderate bass", () => {
    const snap = makeSnapshot({ bass: 0.45, highs: 0.15 });
    const result = computeCounterpoint(snap, "idle", 100);
    expect(result.overlayInversion).toBeCloseTo(0.3, 1);
  });

  it("no overlay inversion when bass is low or highs are present", () => {
    const snap = makeSnapshot({ bass: 0.2, highs: 0.4 });
    const result = computeCounterpoint(snap, "idle", 100);
    expect(result.overlayInversion).toBe(0);
  });

  // ─── Downbeat freeze ───

  it("freezes camera during climax on strong beat", () => {
    const snap = makeSnapshot({ beatDecay: 0.9, onsetEnvelope: 0.7 });
    const result = computeCounterpoint(snap, "climax", 100);
    expect(result.cameraFreeze).toBe(true);
    expect(result.cameraFreezeFrames).toBeGreaterThan(0);
  });

  it("freezes camera during sustain on strong beat", () => {
    const snap = makeSnapshot({ beatDecay: 0.9, onsetEnvelope: 0.7 });
    const result = computeCounterpoint(snap, "sustain", 100);
    expect(result.cameraFreeze).toBe(true);
  });

  it("does NOT freeze camera during idle/build/release", () => {
    const snap = makeSnapshot({ beatDecay: 0.9, onsetEnvelope: 0.7 });
    for (const phase of ["idle", "build", "release"] as const) {
      resetCounterpoint();
      const result = computeCounterpoint(snap, phase, 100);
      expect(result.cameraFreeze).toBe(false);
    }
  });

  it("camera freeze persists for multiple frames then releases", () => {
    // Trigger freeze
    const beatSnap = makeSnapshot({ beatDecay: 0.9, onsetEnvelope: 0.7 });
    computeCounterpoint(beatSnap, "climax", 100);

    // Subsequent quiet frames should still show freeze (countdown)
    const quietSnap = makeSnapshot();
    const f1 = computeCounterpoint(quietSnap, "idle", 101);
    expect(f1.cameraFreeze).toBe(true);

    // After 10+ frames, freeze should end
    for (let i = 102; i < 115; i++) {
      computeCounterpoint(quietSnap, "idle", i);
    }
    const late = computeCounterpoint(quietSnap, "idle", 115);
    expect(late.cameraFreeze).toBe(false);
  });

  // ─── Reset ───

  it("resetCounterpoint clears all state", () => {
    // Build up state
    const quietSnap = makeSnapshot({ energy: 0.05 });
    for (let i = 0; i < 70; i++) {
      computeCounterpoint(quietSnap, "idle", i);
    }

    resetCounterpoint();

    // After reset, no flooding should be active
    const result = computeCounterpoint(quietSnap, "idle", 100);
    expect(result.saturationMult).toBeCloseTo(1.0, 1);
  });
});
