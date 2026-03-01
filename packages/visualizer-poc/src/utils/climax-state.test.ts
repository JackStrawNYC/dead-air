import { describe, it, expect } from "vitest";
import {
  computeClimaxState,
  climaxModulation,
  detectTexture,
} from "./climax-state";
import type { EnhancedFrameData, SectionBoundary } from "../data/types";
import type { AudioSnapshot } from "./audio-reactive";

function makeFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0,
    sub: 0,
    low: 0,
    mid: 0,
    high: 0,
    centroid: 0,
    flatness: 0,
    onset: 0,
    beat: false,
    chroma: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    contrast: [0, 0, 0, 0, 0, 0, 0],
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<AudioSnapshot> = {}): AudioSnapshot {
  return {
    energy: 0.15,
    slowEnergy: 0.12,
    bass: 0.1,
    mids: 0.15,
    highs: 0.1,
    onsetEnvelope: 0,
    beatDecay: 0,
    chromaHue: 0,
    centroid: 0.5,
    flatness: 0.2,
    ...overrides,
  };
}

describe("computeClimaxState", () => {
  it("returns idle for empty frames", () => {
    const state = computeClimaxState([], 0, []);
    expect(state.phase).toBe("idle");
    expect(state.intensity).toBe(0);
    expect(state.anticipation).toBe(false);
  });

  it("returns idle for very low energy", () => {
    const frames = Array.from({ length: 300 }, () => makeFrame({ rms: 0.02 }));
    const sections: SectionBoundary[] = [
      { frameStart: 0, frameEnd: 300, energy: "low" },
    ];
    const state = computeClimaxState(frames, 150, sections, 0.02);
    expect(state.phase).toBe("idle");
  });

  it("returns climax at start of high-energy section", () => {
    const frames = Array.from({ length: 600 }, () => makeFrame({ rms: 0.35 }));
    const sections: SectionBoundary[] = [
      { frameStart: 0, frameEnd: 300, energy: "low" },
      { frameStart: 300, frameEnd: 600, energy: "high" },
    ];
    // Frame 310 = 10 frames into high section (3.3% progress, < 20%)
    const state = computeClimaxState(frames, 310, sections, 0.35);
    expect(state.phase).toBe("climax");
  });

  it("returns sustain in middle of high-energy section", () => {
    const frames = Array.from({ length: 600 }, () => makeFrame({ rms: 0.35 }));
    const sections: SectionBoundary[] = [
      { frameStart: 0, frameEnd: 600, energy: "high" },
    ];
    // Frame 300 = 50% through section
    const state = computeClimaxState(frames, 300, sections, 0.35);
    expect(state.phase).toBe("sustain");
  });

  it("detects anticipation before high-energy section", () => {
    const frames = Array.from({ length: 600 }, (_, i) =>
      makeFrame({ rms: i < 300 ? 0.12 + (i / 300) * 0.05 : 0.35 }),
    );
    const sections: SectionBoundary[] = [
      { frameStart: 0, frameEnd: 300, energy: "low" },
      { frameStart: 300, frameEnd: 600, energy: "high" },
    ];
    // 50 frames before high section
    const state = computeClimaxState(frames, 250, sections, 0.14);
    expect(state.anticipation).toBe(true);
  });
});

describe("climaxModulation", () => {
  it("produces zero offsets at idle with zero intensity", () => {
    const mod = climaxModulation({ phase: "idle", intensity: 0, anticipation: false });
    expect(mod.saturationOffset).toBeCloseTo(0, 3);
    expect(mod.brightnessOffset).toBeCloseTo(0, 3);
    expect(mod.overlayDensityMult).toBeCloseTo(1, 1);
  });

  it("produces positive offsets during climax", () => {
    const mod = climaxModulation({ phase: "climax", intensity: 1, anticipation: false });
    expect(mod.saturationOffset).toBeGreaterThan(0);
    expect(mod.brightnessOffset).toBeGreaterThan(0);
    expect(mod.bloomOffset).toBeGreaterThan(0);
    expect(mod.overlayDensityMult).toBeGreaterThan(1);
  });

  it("produces desaturation during anticipation", () => {
    const mod = climaxModulation({ phase: "build", intensity: 1, anticipation: true });
    expect(mod.saturationOffset).toBeLessThan(0);
  });
});

describe("detectTexture", () => {
  it("detects ambient texture for low energy + high flatness", () => {
    const snap = makeSnapshot({ energy: 0.05, flatness: 0.6 });
    expect(detectTexture(snap, 0.05)).toBe("ambient");
  });

  it("detects sparse for very low energy", () => {
    const snap = makeSnapshot({ energy: 0.03, flatness: 0.2 });
    expect(detectTexture(snap, 0.03)).toBe("sparse");
  });

  it("detects peak for high energy + percussive", () => {
    const snap = makeSnapshot({ energy: 0.35, onsetEnvelope: 0.5 });
    expect(detectTexture(snap, 0.35)).toBe("peak");
  });

  it("detects rhythmic for moderate energy + beat", () => {
    const snap = makeSnapshot({ energy: 0.18, beatDecay: 0.7 });
    expect(detectTexture(snap, 0.18)).toBe("rhythmic");
  });
});
