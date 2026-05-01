import { describe, it, expect } from "vitest";
import { GaussianSmoother } from "./gaussian-smoother";

/**
 * Reference brute-force Gaussian smooth — mirrors AudioReactiveCanvas.smoothValue()
 * exactly for comparison.
 */
function bruteForceGaussian<T>(
  frames: T[],
  idx: number,
  accessor: (f: T) => number,
  window: number,
): number {
  let sum = 0;
  let weightSum = 0;
  const sigma = window * 0.5;
  for (let i = Math.max(0, idx - window); i <= Math.min(frames.length - 1, idx + window); i++) {
    const dist = i - idx;
    const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));
    sum += accessor(frames[i]) * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? sum / weightSum : 0;
}

/** Simple frame-like object for testing */
interface TestFrame {
  value: number;
}

function makeFrames(values: number[]): TestFrame[] {
  return values.map((v) => ({ value: v }));
}

describe("GaussianSmoother", () => {
  describe("construction", () => {
    it("creates a smoother with given window", () => {
      const s = new GaussianSmoother(10);
      expect(s.window).toBe(10);
      expect(s.sigma).toBeCloseTo(5, 10);
    });

    it("throws on negative window", () => {
      expect(() => new GaussianSmoother(-1)).toThrow("window must be >= 0");
    });

    it("handles zero window (pass-through)", () => {
      const s = new GaussianSmoother(0);
      expect(s.window).toBe(0);
      const val = s.update(0, 0.75);
      expect(val).toBeCloseTo(0.75, 10);
    });
  });

  describe("sequential update", () => {
    it("returns the value for the first frame", () => {
      const s = new GaussianSmoother(10);
      const val = s.update(0, 0.5);
      expect(val).toBeCloseTo(0.5, 5);
    });

    it("smooths values over sequential frames", () => {
      const s = new GaussianSmoother(5);
      const values = [0.1, 0.1, 0.1, 0.5, 0.5, 0.5, 0.9, 0.9, 0.9, 0.9];

      const results: number[] = [];
      for (let i = 0; i < values.length; i++) {
        results.push(s.update(i, values[i]));
      }

      // Early frames should be close to 0.1 (only low values in buffer)
      expect(results[2]).toBeLessThan(0.2);

      // Middle frames should be transitioning
      expect(results[5]).toBeGreaterThan(0.2);
      expect(results[5]).toBeLessThan(0.8);

      // Late frames should be close to 0.9
      expect(results[9]).toBeGreaterThan(0.7);
    });

    it("get() returns last computed value", () => {
      const s = new GaussianSmoother(5);
      s.update(0, 0.3);
      s.update(1, 0.6);
      const val = s.update(2, 0.9);
      expect(s.get()).toBeCloseTo(val, 10);
    });

    it("currentFrame tracks the last updated frame", () => {
      const s = new GaussianSmoother(5);
      expect(s.currentFrame).toBe(-1);
      s.update(0, 1);
      expect(s.currentFrame).toBe(0);
      s.update(1, 2);
      expect(s.currentFrame).toBe(1);
    });
  });

  describe("recompute (brute-force fallback)", () => {
    it("matches brute-force Gaussian for mid-array index", () => {
      const values = Array.from({ length: 100 }, (_, i) => Math.sin(i * 0.1) * 0.5 + 0.5);
      const frames = makeFrames(values);
      const window = 15;

      const s = new GaussianSmoother(window);
      const result = s.recompute(frames, 50, (f) => f.value);
      const expected = bruteForceGaussian(frames, 50, (f) => f.value, window);

      expect(result).toBeCloseTo(expected, 10);
    });

    it("matches brute-force at array start (partial window)", () => {
      const values = Array.from({ length: 50 }, (_, i) => i / 50);
      const frames = makeFrames(values);
      const window = 20;

      const s = new GaussianSmoother(window);
      const result = s.recompute(frames, 3, (f) => f.value);
      const expected = bruteForceGaussian(frames, 3, (f) => f.value, window);

      expect(result).toBeCloseTo(expected, 10);
    });

    it("matches brute-force at array end (partial window)", () => {
      const values = Array.from({ length: 50 }, (_, i) => i / 50);
      const frames = makeFrames(values);
      const window = 20;

      const s = new GaussianSmoother(window);
      const result = s.recompute(frames, 48, (f) => f.value);
      const expected = bruteForceGaussian(frames, 48, (f) => f.value, window);

      expect(result).toBeCloseTo(expected, 10);
    });

    it("matches brute-force for various window sizes", () => {
      const values = Array.from({ length: 200 }, (_, i) =>
        Math.sin(i * 0.05) * 0.4 + 0.5,
      );
      const frames = makeFrames(values);

      for (const window of [5, 10, 15, 30, 90]) {
        const s = new GaussianSmoother(window);
        for (const idx of [0, 10, 50, 100, 150, 199]) {
          const result = s.recompute(frames, idx, (f) => f.value);
          const expected = bruteForceGaussian(frames, idx, (f) => f.value, window);
          expect(result).toBeCloseTo(expected, 8);
        }
      }
    });

    it("refills ring buffer so subsequent sequential frames are fast", () => {
      const values = Array.from({ length: 100 }, (_, i) => i * 0.01);
      const frames = makeFrames(values);
      const window = 10;

      const s = new GaussianSmoother(window);

      // Recompute at frame 50
      s.recompute(frames, 50, (f) => f.value);

      // Now sequential update at frame 51 should work without recompute
      expect(s.isSeek(51)).toBe(false);
      const seqVal = s.update(51, values[51]);
      expect(seqVal).toBeGreaterThan(0);
      expect(s.currentFrame).toBe(51);
    });
  });

  describe("seek detection", () => {
    it("detects forward seek", () => {
      const s = new GaussianSmoother(10);
      s.update(0, 1);
      s.update(1, 2);
      s.update(2, 3);
      expect(s.isSeek(3)).toBe(false); // sequential
      expect(s.isSeek(10)).toBe(true); // jump forward
    });

    it("detects backward seek", () => {
      const s = new GaussianSmoother(10);
      s.update(50, 1);
      s.update(51, 2);
      expect(s.isSeek(52)).toBe(false);
      expect(s.isSeek(40)).toBe(true); // jump backward
    });

    it("no seek on first frame", () => {
      const s = new GaussianSmoother(10);
      expect(s.isSeek(0)).toBe(false); // lastFrameIndex is -1 → not a seek
    });

    it("same frame is not a seek", () => {
      const s = new GaussianSmoother(10);
      s.update(5, 1);
      expect(s.isSeek(5)).toBe(false);
    });
  });

  describe("update after seek clears buffer", () => {
    it("returns the raw value after seek (buffer cleared)", () => {
      const s = new GaussianSmoother(10);
      // Fill with sequential frames
      for (let i = 0; i < 20; i++) {
        s.update(i, 0.1);
      }
      // Seek to distant frame — update should detect non-sequential
      const val = s.update(500, 0.9);
      // With a cleared buffer containing only one value, should return ~0.9
      expect(val).toBeCloseTo(0.9, 5);
    });
  });

  describe("clear", () => {
    it("resets all state", () => {
      const s = new GaussianSmoother(10);
      s.update(0, 0.5);
      s.update(1, 0.6);
      s.clear();
      expect(s.get()).toBe(0);
      expect(s.currentFrame).toBe(-1);
      expect(s.isSeek(0)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("single-element frame array", () => {
      const frames = makeFrames([0.42]);
      const s = new GaussianSmoother(10);
      const result = s.recompute(frames, 0, (f) => f.value);
      expect(result).toBeCloseTo(0.42, 10);
    });

    it("window larger than frame count", () => {
      const frames = makeFrames([0.1, 0.2, 0.3]);
      const s = new GaussianSmoother(50);
      const result = s.recompute(frames, 1, (f) => f.value);
      const expected = bruteForceGaussian(frames, 1, (f) => f.value, 50);
      expect(result).toBeCloseTo(expected, 10);
    });

    it("all-zero values", () => {
      const frames = makeFrames([0, 0, 0, 0, 0]);
      const s = new GaussianSmoother(3);
      const result = s.recompute(frames, 2, (f) => f.value);
      expect(result).toBe(0);
    });

    it("constant values produce constant output", () => {
      const frames = makeFrames(Array(100).fill(0.7));
      const s = new GaussianSmoother(15);
      for (const idx of [0, 10, 50, 99]) {
        const result = s.recompute(frames, idx, (f) => f.value);
        expect(result).toBeCloseTo(0.7, 8);
      }
    });

    it("step function smoothing is symmetric around step", () => {
      // 50 frames of 0, then 50 frames of 1
      const frames = makeFrames(
        Array.from({ length: 100 }, (_, i) => (i < 50 ? 0 : 1)),
      );
      const s = new GaussianSmoother(10);
      const atStep = s.recompute(frames, 50, (f) => f.value);
      // At the step boundary, the Gaussian-weighted mean should be close to 0.5
      expect(atStep).toBeGreaterThan(0.3);
      expect(atStep).toBeLessThan(0.7);
    });

    it("Remotion-style render order: seek + recompute + sequential", () => {
      // Simulate Remotion worker rendering frames 200-210, then jumping to 500-510
      const values = Array.from({ length: 1000 }, (_, i) =>
        Math.sin(i * 0.02) * 0.5 + 0.5,
      );
      const frames = makeFrames(values);
      const window = 12;
      const s = new GaussianSmoother(window);

      // Sequential batch 200-210
      for (let i = 200; i <= 210; i++) {
        if (s.isSeek(i)) {
          s.recompute(frames, i, (f) => f.value);
        } else {
          s.update(i, values[i]);
        }
      }
      expect(s.currentFrame).toBe(210);

      // Jump to 500 — should detect seek
      expect(s.isSeek(500)).toBe(true);
      const recompVal = s.recompute(frames, 500, (f) => f.value);
      const expected = bruteForceGaussian(frames, 500, (f) => f.value, window);
      expect(recompVal).toBeCloseTo(expected, 10);

      // Continue sequentially 501-510
      for (let i = 501; i <= 510; i++) {
        expect(s.isSeek(i)).toBe(false);
        s.update(i, values[i]);
      }
      expect(s.currentFrame).toBe(510);
    });
  });
});
