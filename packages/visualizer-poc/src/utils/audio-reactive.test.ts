import { describe, it, expect } from "vitest";
import {
  gaussianSmooth,
  onsetEnvelope,
  beatDecay,
  smoothedChromaHue,
  audioMap,
  computeAudioSnapshot,
  computeSpectralFlux,
  buildBeatArray,
  computeMusicalTime,
} from "./audio-reactive";
import type { EnhancedFrameData } from "../data/types";

/** Create a minimal frame with default zeros */
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

describe("gaussianSmooth", () => {
  it("returns the value at a single frame", () => {
    const frames = [makeFrame({ rms: 0.5 })];
    expect(gaussianSmooth(frames, 0, (f) => f.rms, 10)).toBeCloseTo(0.5, 3);
  });

  it("smooths over a window of frames", () => {
    const frames = Array.from({ length: 100 }, (_, i) =>
      makeFrame({ rms: i < 50 ? 0.1 : 0.3 }),
    );
    // At the boundary (index 50), should be between 0.1 and 0.3
    const val = gaussianSmooth(frames, 50, (f) => f.rms, 20);
    expect(val).toBeGreaterThan(0.1);
    expect(val).toBeLessThan(0.3);
  });

  it("weights center more than edges", () => {
    const frames = [
      makeFrame({ rms: 0 }),
      makeFrame({ rms: 0 }),
      makeFrame({ rms: 1 }),
      makeFrame({ rms: 0 }),
      makeFrame({ rms: 0 }),
    ];
    const val = gaussianSmooth(frames, 2, (f) => f.rms, 2);
    expect(val).toBeGreaterThan(0.3); // Center-weighted: 1.0 / totalWeight ≈ 0.40
  });
});

describe("onsetEnvelope", () => {
  it("returns 0 when no onsets present", () => {
    const frames = Array.from({ length: 20 }, () => makeFrame());
    expect(onsetEnvelope(frames, 10)).toBe(0);
  });

  it("returns full value at onset frame", () => {
    const frames = Array.from({ length: 20 }, () => makeFrame());
    frames[10] = makeFrame({ onset: 0.8 });
    expect(onsetEnvelope(frames, 10)).toBeCloseTo(0.8, 3);
  });

  it("decays after onset", () => {
    const frames = Array.from({ length: 20 }, () => makeFrame());
    frames[5] = makeFrame({ onset: 1.0 });
    const atOnset = onsetEnvelope(frames, 5);
    const after5 = onsetEnvelope(frames, 10);
    expect(after5).toBeLessThan(atOnset);
    expect(after5).toBeGreaterThan(0);
  });
});

describe("beatDecay", () => {
  it("returns 0 when no beats present", () => {
    const frames = Array.from({ length: 50 }, () => makeFrame());
    expect(beatDecay(frames, 25)).toBe(0);
  });

  it("returns 1.0 at beat frame", () => {
    const frames = Array.from({ length: 50 }, () => makeFrame());
    frames[25] = makeFrame({ beat: true });
    expect(beatDecay(frames, 25)).toBeCloseTo(1.0, 3);
  });

  it("decays with half-life", () => {
    const frames = Array.from({ length: 50 }, () => makeFrame());
    frames[10] = makeFrame({ beat: true });
    const at20 = beatDecay(frames, 30); // 20 frames after beat
    expect(at20).toBeCloseTo(0.5, 1); // Should be ~0.5 at halfLife
  });
});

describe("smoothedChromaHue", () => {
  it("returns correct hue for dominant chroma", () => {
    // All frames have dominant pitch at index 0 (C) → hue = 0
    const chroma = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as [
      number, number, number, number, number, number,
      number, number, number, number, number, number,
    ];
    const frames = Array.from({ length: 10 }, () =>
      makeFrame({ chroma }),
    );
    const hue = smoothedChromaHue(frames, 5, 3);
    expect(hue).toBeCloseTo(0, 0); // C = 0 degrees
  });

  it("returns ~180 for dominant pitch at index 6", () => {
    // Index 6 = F# → 6/12 * 360 = 180 degrees
    const chroma = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0] as [
      number, number, number, number, number, number,
      number, number, number, number, number, number,
    ];
    const frames = Array.from({ length: 10 }, () =>
      makeFrame({ chroma }),
    );
    const hue = smoothedChromaHue(frames, 5, 3);
    expect(hue).toBeCloseTo(180, 0);
  });
});

describe("audioMap", () => {
  it("clamps at low end", () => {
    expect(audioMap(0, 0.1, 0.5, 0, 100)).toBe(0);
  });

  it("clamps at high end", () => {
    expect(audioMap(1, 0.1, 0.5, 0, 100)).toBe(100);
  });

  it("maps midpoint with smoothstep", () => {
    const mid = audioMap(0.3, 0.1, 0.5, 0, 100);
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThan(60);
  });
});

describe("computeAudioSnapshot", () => {
  it("returns all fields", () => {
    const frames = Array.from({ length: 100 }, () =>
      makeFrame({ rms: 0.15, sub: 0.1, low: 0.1, mid: 0.2, high: 0.15, centroid: 0.5, flatness: 0.3 }),
    );
    const snap = computeAudioSnapshot(frames, 50);
    expect(snap).toHaveProperty("energy");
    expect(snap).toHaveProperty("slowEnergy");
    expect(snap).toHaveProperty("bass");
    expect(snap).toHaveProperty("mids");
    expect(snap).toHaveProperty("highs");
    expect(snap).toHaveProperty("onsetEnvelope");
    expect(snap).toHaveProperty("beatDecay");
    expect(snap).toHaveProperty("chromaHue");
    expect(snap).toHaveProperty("centroid");
    expect(snap).toHaveProperty("flatness");
    expect(snap.energy).toBeCloseTo(0.15, 1);
  });
});

describe("computeSpectralFlux", () => {
  it("returns 0 for identical contrast vectors", () => {
    const frames = Array.from({ length: 20 }, () =>
      makeFrame({ contrast: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] }),
    );
    expect(computeSpectralFlux(frames, 10)).toBeCloseTo(0, 3);
  });

  it("returns positive value for changing contrast", () => {
    const frames = Array.from({ length: 20 }, (_, i) =>
      makeFrame({
        contrast: i < 10
          ? [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]
          : [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
      }),
    );
    expect(computeSpectralFlux(frames, 10)).toBeGreaterThan(0);
  });
});

describe("computeAudioSnapshot includes spectralFlux", () => {
  it("snapshot has spectralFlux field", () => {
    const frames = Array.from({ length: 100 }, () =>
      makeFrame({ rms: 0.15, sub: 0.1, low: 0.1, mid: 0.2, high: 0.15, centroid: 0.5, flatness: 0.3 }),
    );
    const snap = computeAudioSnapshot(frames, 50);
    expect(snap).toHaveProperty("spectralFlux");
    expect(typeof snap.spectralFlux).toBe("number");
  });
});

describe("buildBeatArray", () => {
  it("returns indices where beat is true", () => {
    const frames = [
      makeFrame({ beat: false }),
      makeFrame({ beat: true }),
      makeFrame({ beat: false }),
      makeFrame({ beat: true }),
    ];
    expect(buildBeatArray(frames)).toEqual([1, 3]);
  });

  it("returns empty array when no beats", () => {
    const frames = Array.from({ length: 10 }, () => makeFrame());
    expect(buildBeatArray(frames)).toEqual([]);
  });
});

describe("computeMusicalTime", () => {
  it("falls back to tempo-based estimate with no beats", () => {
    const mt = computeMusicalTime([], 30, 30, 120);
    // 30 frames at 30fps = 1 second, 120 BPM = 2 beats/sec → musicalTime = 2.0
    expect(mt).toBeCloseTo(2.0, 3);
  });

  it("returns integer at beat boundaries", () => {
    const beatArray = [0, 15, 30];
    const mt = computeMusicalTime(beatArray, 15, 30, 120);
    expect(mt).toBeCloseTo(1.0, 3);
  });

  it("returns fractional value between beats", () => {
    const beatArray = [0, 30];
    const mt = computeMusicalTime(beatArray, 15, 30, 120);
    expect(mt).toBeCloseTo(0.5, 3);
  });
});

describe("computeAudioSnapshot includes musicalTime", () => {
  it("defaults musicalTime to 0 without beat params", () => {
    const frames = Array.from({ length: 100 }, () =>
      makeFrame({ rms: 0.15 }),
    );
    const snap = computeAudioSnapshot(frames, 50);
    expect(snap.musicalTime).toBe(0);
  });

  it("computes musicalTime when beat params provided", () => {
    const frames = Array.from({ length: 100 }, (_, i) =>
      makeFrame({ rms: 0.15, beat: i % 15 === 0 }),
    );
    const beatArray = buildBeatArray(frames);
    const snap = computeAudioSnapshot(frames, 22, beatArray, 30, 120);
    expect(snap.musicalTime).toBeGreaterThan(0);
  });
});
