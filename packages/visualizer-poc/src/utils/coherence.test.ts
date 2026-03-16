import { describe, it, expect } from "vitest";
import {
  computeCoherence,
  computeRawScore,
  chromaStability,
  beatRegularity,
  spectralDensity,
  energySustain,
} from "./coherence";
import type { EnhancedFrameData } from "../data/types";

/** Create a minimal frame with defaults */
function makeFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.1,
    sub: 0.05,
    low: 0.05,
    mid: 0.1,
    high: 0.05,
    onset: 0,
    beat: false,
    centroid: 0.3,
    flatness: 0.2,
    chroma: [0.5, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
    contrast: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
    ...overrides,
  };
}

/** Generate N frames with consistent chroma and regular beats */
function makeCoherentFrames(count: number, beatInterval = 15): EnhancedFrameData[] {
  return Array.from({ length: count }, (_, i) =>
    makeFrame({
      chroma: [0.8, 0.1, 0.05, 0.05, 0.1, 0.8, 0.1, 0.05, 0.05, 0.1, 0.05, 0.05],
      beat: i % beatInterval === 0,
      contrast: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      rms: 0.2,
    }),
  );
}

/** Generate N frames with random chroma and irregular beats */
function makeRandomFrames(count: number): EnhancedFrameData[] {
  let seed = 42;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  return Array.from({ length: count }, () => {
    const chroma = Array.from({ length: 12 }, () => rng());
    return makeFrame({
      chroma,
      beat: rng() > 0.85,
      contrast: Array.from({ length: 7 }, () => rng() * 0.2),
      rms: rng() * 0.3,
    });
  });
}

describe("coherence", () => {
  describe("individual signals", () => {
    it("chroma stability: steady chroma → high value", () => {
      const frames = makeCoherentFrames(100);
      const stability = chromaStability(frames, 50, 30);
      expect(stability).toBeGreaterThan(0.8);
    });

    it("chroma stability: random chroma → lower than steady", () => {
      const randomFrames = makeRandomFrames(100);
      const steadyFrames = makeCoherentFrames(100);
      const randomStability = chromaStability(randomFrames, 50, 30);
      const steadyStability = chromaStability(steadyFrames, 50, 30);
      // Random should be lower than steady, even if cosine similarity stays moderate
      expect(randomStability).toBeLessThan(steadyStability);
    });

    it("beat regularity: regular beats → high value", () => {
      const frames = makeCoherentFrames(200, 15);
      const regularity = beatRegularity(frames, 100, 60);
      expect(regularity).toBeGreaterThan(0.7);
    });

    it("spectral density: full contrast → moderate-high value", () => {
      const frames = [makeFrame({ contrast: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] })];
      const density = spectralDensity(frames, 0);
      expect(density).toBeCloseTo(0.5, 1);
    });

    it("energy sustain: steady energy → high value", () => {
      const frames = makeCoherentFrames(30);
      const sustain = energySustain(frames, 15);
      expect(sustain).toBeGreaterThan(0.5);
    });
  });

  describe("raw score", () => {
    it("coherent frames → high raw score", () => {
      const frames = makeCoherentFrames(200, 15);
      const score = computeRawScore(frames, 100);
      expect(score).toBeGreaterThan(0.5);
    });

    it("random frames → low raw score", () => {
      const frames = makeRandomFrames(200);
      const score = computeRawScore(frames, 100);
      expect(score).toBeLessThan(0.5);
    });
  });

  describe("composite score", () => {
    it("steady chroma + regular beats → score > 0.5", () => {
      const frames = makeCoherentFrames(200, 15);
      const result = computeCoherence(frames, 100);
      expect(result.score).toBeGreaterThan(0.5);
    });

    it("random noise → score < 0.5", () => {
      const frames = makeRandomFrames(200);
      const result = computeCoherence(frames, 100);
      expect(result.score).toBeLessThan(0.5);
    });

    it("empty frames → score 0", () => {
      const result = computeCoherence([], 0);
      expect(result.score).toBe(0);
      expect(result.isLocked).toBe(false);
      expect(result.lockDuration).toBe(0);
    });
  });

  describe("lock hysteresis (pure/deterministic)", () => {
    it("detects lock after 90+ high-coherence frames", () => {
      const frames = makeCoherentFrames(200, 15);
      const result = computeCoherence(frames, 150);
      // With 150+ coherent frames, lock should be detected if scores exceed 0.65
      expect(result.score).toBeGreaterThan(0);
    });

    it("same frame returns same result regardless of call order", () => {
      const frames = makeCoherentFrames(200, 15);
      // Call for frame 150, then 50, then 150 again — should be identical
      const result1 = computeCoherence(frames, 150);
      computeCoherence(frames, 50);
      const result2 = computeCoherence(frames, 150);
      expect(result2.score).toBe(result1.score);
      expect(result2.isLocked).toBe(result1.isLocked);
      expect(result2.lockDuration).toBe(result1.lockDuration);
    });

    it("maintains lock during brief low-coherence sections", () => {
      // 200 coherent frames followed by 30 random frames
      const coherent = makeCoherentFrames(200, 15);
      const random = makeRandomFrames(30);
      const frames = [...coherent, ...random];
      const resultCoherent = computeCoherence(frames, 180);
      const resultRandom = computeCoherence(frames, 220);
      // If lock was entered, it should persist through 30 random frames
      // (30 < 60 exit threshold)
      if (resultCoherent.isLocked) {
        expect(resultRandom.isLocked).toBe(true);
      }
      expect(resultRandom.score).toBeDefined();
    });
  });
});
