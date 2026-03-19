import { describe, it, expect } from "vitest";
import { computeJamEvolution, getJamPhaseBoundaries, getJamPhaseSequence, getJamPhaseMode, JAM_PHASE_SHADER_POOLS, JAM_PHASE_INDEX } from "./jam-evolution";
import type { EnhancedFrameData } from "../data/types";

function makeFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.1,
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

describe("computeJamEvolution", () => {
  it("returns isLongJam=false for short songs", () => {
    // 5 minutes = 9000 frames (< 18000 threshold)
    const frames = Array.from({ length: 9000 }, () => makeFrame());
    const result = computeJamEvolution(frames, 4500);
    expect(result.isLongJam).toBe(false);
    expect(result.densityMult).toBe(1);
  });

  it("returns isLongJam=true for 10+ minute songs", () => {
    // 12 minutes = 21600 frames (> 18000 threshold)
    const frames = Array.from({ length: 21600 }, (_, i) =>
      makeFrame({ rms: 0.05 + Math.sin(i / 5000) * 0.15 }),
    );
    const result = computeJamEvolution(frames, 10000);
    expect(result.isLongJam).toBe(true);
  });

  it("exploration phase at beginning of long jam", () => {
    const frames = Array.from({ length: 21600 }, (_, i) => {
      // Energy arc: low → high → low
      const progress = i / 21600;
      const energy = 0.05 + Math.sin(progress * Math.PI) * 0.25;
      return makeFrame({ rms: energy });
    });
    const result = computeJamEvolution(frames, 500);
    expect(result.phase).toBe("exploration");
    expect(result.songProgress).toBeLessThan(0.1);
  });

  it("peak_space phase near energy peak", () => {
    const frames = Array.from({ length: 21600 }, (_, i) => {
      const progress = i / 21600;
      const energy = 0.05 + Math.sin(progress * Math.PI) * 0.25;
      return makeFrame({ rms: energy });
    });
    // At 50% through song (near the peak of the sine arc)
    const result = computeJamEvolution(frames, 10800);
    expect(["peak_space", "building"]).toContain(result.phase);
  });

  it("resolution phase near end of long jam", () => {
    const frames = Array.from({ length: 21600 }, (_, i) => {
      const progress = i / 21600;
      const energy = 0.05 + Math.sin(progress * Math.PI) * 0.25;
      return makeFrame({ rms: energy });
    });
    const result = computeJamEvolution(frames, 20000);
    expect(result.phase).toBe("resolution");
    expect(result.songProgress).toBeGreaterThan(0.9);
  });

  it("color temperature is cool during exploration", () => {
    const frames = Array.from({ length: 21600 }, (_, i) => {
      const progress = i / 21600;
      return makeFrame({ rms: 0.05 + Math.sin(progress * Math.PI) * 0.25 });
    });
    const result = computeJamEvolution(frames, 500);
    expect(result.colorTemperature).toBeLessThan(0);
  });

  it("density multiplier is sparse during exploration", () => {
    const frames = Array.from({ length: 21600 }, (_, i) => {
      const progress = i / 21600;
      return makeFrame({ rms: 0.05 + Math.sin(progress * Math.PI) * 0.25 });
    });
    const result = computeJamEvolution(frames, 500);
    expect(result.densityMult).toBeLessThan(1);
  });

  it("songProgress is accurate", () => {
    const frames = Array.from({ length: 21600 }, () => makeFrame());
    const result = computeJamEvolution(frames, 10800);
    expect(result.songProgress).toBeCloseTo(0.5, 1);
  });
});

describe("getJamPhaseBoundaries", () => {
  const longFrames = Array.from({ length: 21600 }, (_, i) => {
    const progress = i / 21600;
    return makeFrame({ rms: 0.05 + Math.sin(progress * Math.PI) * 0.25 });
  });

  it("returns null for short songs", () => {
    const frames = Array.from({ length: 9000 }, () => makeFrame());
    expect(getJamPhaseBoundaries(frames)).toBeNull();
  });

  it("returns boundaries for long jams", () => {
    const b = getJamPhaseBoundaries(longFrames);
    expect(b).not.toBeNull();
    expect(b!.explorationEnd).toBeGreaterThan(0);
    expect(b!.buildingEnd).toBeGreaterThan(b!.explorationEnd);
    expect(b!.peakSpaceEnd).toBeGreaterThan(b!.buildingEnd);
    expect(b!.totalFrames).toBe(21600);
  });

  it("boundaries are ordered", () => {
    const b = getJamPhaseBoundaries(longFrames)!;
    expect(b.explorationEnd).toBeLessThan(b.buildingEnd);
    expect(b.buildingEnd).toBeLessThan(b.peakSpaceEnd);
    expect(b.peakSpaceEnd).toBeLessThan(b.totalFrames);
  });

  it("respects lower threshold for drums/space", () => {
    const shortDSFrames = Array.from({ length: 6000 }, (_, i) =>
      makeFrame({ rms: 0.05 + Math.sin((i / 6000) * Math.PI) * 0.2 }),
    );
    expect(getJamPhaseBoundaries(shortDSFrames, false)).toBeNull();
    expect(getJamPhaseBoundaries(shortDSFrames, true)).not.toBeNull();
  });
});

describe("getJamPhaseMode", () => {
  it("returns a mode from the exploration pool", () => {
    const mode = getJamPhaseMode("exploration", 42);
    expect(JAM_PHASE_SHADER_POOLS.exploration).toContain(mode);
  });

  it("returns a mode from the peak_space pool", () => {
    const mode = getJamPhaseMode("peak_space", 42);
    expect(JAM_PHASE_SHADER_POOLS.peak_space).toContain(mode);
  });

  it("is deterministic for same seed", () => {
    const a = getJamPhaseMode("building", 123);
    const b = getJamPhaseMode("building", 123);
    expect(a).toBe(b);
  });

  it("varies with different seeds", () => {
    const modes = new Set<string>();
    for (let s = 0; s < 20; s++) {
      modes.add(getJamPhaseMode("peak_space", s * 1000));
    }
    expect(modes.size).toBeGreaterThan(1);
  });

  it("avoids current default mode when possible", () => {
    // Try many seeds — at least some should avoid the default
    let avoided = 0;
    for (let s = 0; s < 20; s++) {
      const mode = getJamPhaseMode("exploration", s, undefined, "deep_ocean");
      if (mode !== "deep_ocean") avoided++;
    }
    expect(avoided).toBeGreaterThan(10);
  });
});

describe("getJamPhaseSequence", () => {
  it("returns modes for all 4 phases", () => {
    const seq = getJamPhaseSequence(42);
    expect(seq.exploration).toBeDefined();
    expect(seq.building).toBeDefined();
    expect(seq.peak_space).toBeDefined();
    expect(seq.resolution).toBeDefined();
  });

  it("no two adjacent phases use the same shader", () => {
    // Test multiple seeds
    for (let s = 0; s < 20; s++) {
      const seq = getJamPhaseSequence(s * 777);
      expect(seq.exploration).not.toBe(seq.building);
      expect(seq.building).not.toBe(seq.peak_space);
      expect(seq.peak_space).not.toBe(seq.resolution);
    }
  });

  it("is deterministic for same seed", () => {
    const a = getJamPhaseSequence(42);
    const b = getJamPhaseSequence(42);
    expect(a).toEqual(b);
  });
});

describe("JAM_PHASE_INDEX", () => {
  it("maps phases to sequential integers", () => {
    expect(JAM_PHASE_INDEX.exploration).toBe(0);
    expect(JAM_PHASE_INDEX.building).toBe(1);
    expect(JAM_PHASE_INDEX.peak_space).toBe(2);
    expect(JAM_PHASE_INDEX.resolution).toBe(3);
  });
});
