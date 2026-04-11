import { describe, it, expect } from "vitest";
import { RingBuffer } from "./ring-buffer";

describe("RingBuffer", () => {
  describe("construction", () => {
    it("creates a buffer with the given capacity", () => {
      const buf = new RingBuffer(10);
      expect(buf.capacity).toBe(10);
      expect(buf.size).toBe(0);
    });

    it("throws on zero capacity", () => {
      expect(() => new RingBuffer(0)).toThrow("capacity must be >= 1");
    });

    it("throws on negative capacity", () => {
      expect(() => new RingBuffer(-5)).toThrow("capacity must be >= 1");
    });
  });

  describe("push and size", () => {
    it("increments size on push", () => {
      const buf = new RingBuffer(5);
      buf.push(1.0, 0);
      expect(buf.size).toBe(1);
      buf.push(2.0, 1);
      expect(buf.size).toBe(2);
    });

    it("caps size at capacity", () => {
      const buf = new RingBuffer(3);
      buf.push(1, 0);
      buf.push(2, 1);
      buf.push(3, 2);
      buf.push(4, 3); // evicts 1
      expect(buf.size).toBe(3);
    });

    it("tracks lastFrameIndex", () => {
      const buf = new RingBuffer(5);
      expect(buf.lastFrameIndex).toBe(-1);
      buf.push(1.0, 42);
      expect(buf.lastFrameIndex).toBe(42);
      buf.push(2.0, 100);
      expect(buf.lastFrameIndex).toBe(100);
    });
  });

  describe("mean", () => {
    it("returns 0 for empty buffer", () => {
      const buf = new RingBuffer(5);
      expect(buf.mean()).toBe(0);
    });

    it("returns the value for a single element", () => {
      const buf = new RingBuffer(5);
      buf.push(0.7, 0);
      expect(buf.mean()).toBeCloseTo(0.7, 10);
    });

    it("computes correct mean for multiple elements", () => {
      const buf = new RingBuffer(10);
      buf.push(2, 0);
      buf.push(4, 1);
      buf.push(6, 2);
      expect(buf.mean()).toBeCloseTo(4, 10);
    });

    it("maintains correct running mean after eviction", () => {
      const buf = new RingBuffer(3);
      buf.push(10, 0);
      buf.push(20, 1);
      buf.push(30, 2);
      expect(buf.mean()).toBeCloseTo(20, 10); // (10+20+30)/3

      buf.push(40, 3); // evicts 10 → {20, 30, 40}
      expect(buf.mean()).toBeCloseTo(30, 10); // (20+30+40)/3

      buf.push(50, 4); // evicts 20 → {30, 40, 50}
      expect(buf.mean()).toBeCloseTo(40, 10); // (30+40+50)/3
    });

    it("handles large number of pushes without drift", () => {
      const buf = new RingBuffer(5);
      // Push 1000 values, final 5 should be 996..1000
      for (let i = 0; i < 1000; i++) {
        buf.push(i, i);
      }
      // Mean of 995, 996, 997, 998, 999 = 997
      expect(buf.mean()).toBeCloseTo(997, 5);
    });
  });

  describe("weightedMean", () => {
    it("returns 0 for empty buffer", () => {
      const buf = new RingBuffer(5);
      expect(buf.weightedMean([1, 1, 1])).toBe(0);
    });

    it("returns the value when buffer has one element", () => {
      const buf = new RingBuffer(5);
      buf.push(0.5, 0);
      // Weight[0] = newest (and only) value
      expect(buf.weightedMean([1.0])).toBeCloseTo(0.5, 10);
    });

    it("applies weights in chronological order (oldest first)", () => {
      const buf = new RingBuffer(5);
      buf.push(1, 0); // oldest → weight[0]
      buf.push(2, 1);
      buf.push(3, 2); // newest → weight[2]

      // Weighted mean: (1*0 + 2*0 + 3*1) / (0+0+1) = 3
      expect(buf.weightedMean([0, 0, 1])).toBeCloseTo(3, 10);

      // Weighted mean: (1*1 + 2*0 + 3*0) / (1+0+0) = 1
      expect(buf.weightedMean([1, 0, 0])).toBeCloseTo(1, 10);

      // Equal weights: (1+2+3)/3 = 2
      expect(buf.weightedMean([1, 1, 1])).toBeCloseTo(2, 10);
    });

    it("handles partial fill: fewer values than weights", () => {
      const buf = new RingBuffer(10);
      buf.push(5, 0);
      buf.push(10, 1);
      // Only 2 values, weights array longer — extra weights ignored
      const weights = [0.5, 1.0, 0.5, 0.25];
      // (5*0.5 + 10*1.0) / (0.5+1.0) = 12.5/1.5 = 8.333...
      expect(buf.weightedMean(weights)).toBeCloseTo(12.5 / 1.5, 10);
    });

    it("works with Float64Array weights", () => {
      const buf = new RingBuffer(3);
      buf.push(2, 0);
      buf.push(4, 1);
      buf.push(6, 2);
      const weights = new Float64Array([0.25, 0.5, 1.0]);
      // (2*0.25 + 4*0.5 + 6*1.0) / (0.25+0.5+1.0) = (0.5+2+6)/1.75 = 8.5/1.75
      expect(buf.weightedMean(weights)).toBeCloseTo(8.5 / 1.75, 10);
    });
  });

  describe("isCurrent", () => {
    it("returns false for empty buffer", () => {
      const buf = new RingBuffer(5);
      expect(buf.isCurrent(0)).toBe(false);
    });

    it("returns true for same frame", () => {
      const buf = new RingBuffer(5);
      buf.push(1, 10);
      expect(buf.isCurrent(10)).toBe(true);
    });

    it("returns true for next sequential frame", () => {
      const buf = new RingBuffer(5);
      buf.push(1, 10);
      expect(buf.isCurrent(11)).toBe(true);
    });

    it("returns false for gap forward", () => {
      const buf = new RingBuffer(5);
      buf.push(1, 10);
      expect(buf.isCurrent(15)).toBe(false);
    });

    it("returns false for backward seek", () => {
      const buf = new RingBuffer(5);
      buf.push(1, 100);
      expect(buf.isCurrent(50)).toBe(false);
    });
  });

  describe("clear", () => {
    it("resets all state", () => {
      const buf = new RingBuffer(5);
      buf.push(10, 0);
      buf.push(20, 1);
      buf.push(30, 2);
      buf.clear();
      expect(buf.size).toBe(0);
      expect(buf.mean()).toBe(0);
      expect(buf.lastFrameIndex).toBe(-1);
      expect(buf.isCurrent(0)).toBe(false);
    });

    it("allows reuse after clear", () => {
      const buf = new RingBuffer(3);
      buf.push(100, 0);
      buf.push(200, 1);
      buf.clear();
      buf.push(5, 10);
      expect(buf.size).toBe(1);
      expect(buf.mean()).toBeCloseTo(5, 10);
      expect(buf.lastFrameIndex).toBe(10);
    });
  });

  describe("at", () => {
    it("returns undefined for out-of-range index", () => {
      const buf = new RingBuffer(5);
      expect(buf.at(0)).toBeUndefined();
      expect(buf.at(-1)).toBeUndefined();
    });

    it("returns values in chronological order", () => {
      const buf = new RingBuffer(5);
      buf.push(10, 0);
      buf.push(20, 1);
      buf.push(30, 2);
      expect(buf.at(0)).toBe(10); // oldest
      expect(buf.at(1)).toBe(20);
      expect(buf.at(2)).toBe(30); // newest
      expect(buf.at(3)).toBeUndefined();
    });

    it("returns correct values after wraparound", () => {
      const buf = new RingBuffer(3);
      buf.push(1, 0);
      buf.push(2, 1);
      buf.push(3, 2);
      buf.push(4, 3); // evicts 1
      buf.push(5, 4); // evicts 2
      expect(buf.at(0)).toBe(3); // oldest surviving
      expect(buf.at(1)).toBe(4);
      expect(buf.at(2)).toBe(5); // newest
    });
  });

  describe("edge cases", () => {
    it("capacity of 1 acts as single-value store", () => {
      const buf = new RingBuffer(1);
      buf.push(42, 0);
      expect(buf.size).toBe(1);
      expect(buf.mean()).toBe(42);
      buf.push(99, 1);
      expect(buf.size).toBe(1);
      expect(buf.mean()).toBe(99);
    });

    it("handles zero values correctly", () => {
      const buf = new RingBuffer(3);
      buf.push(0, 0);
      buf.push(0, 1);
      buf.push(0, 2);
      expect(buf.mean()).toBe(0);
    });

    it("handles negative values correctly", () => {
      const buf = new RingBuffer(3);
      buf.push(-1, 0);
      buf.push(0, 1);
      buf.push(1, 2);
      expect(buf.mean()).toBeCloseTo(0, 10);
    });
  });
});
