import { describe, it, expect } from "vitest";
import { seeded, seededLCG, seededShuffle } from "./seededRandom";

describe("seeded PRNG", () => {
  it("produces deterministic output for the same seed", () => {
    const rng1 = seeded(42);
    const rng2 = seeded(42);
    const values1 = Array.from({ length: 10 }, () => rng1());
    const values2 = Array.from({ length: 10 }, () => rng2());
    expect(values1).toEqual(values2);
  });

  it("produces different output for different seeds", () => {
    const rng1 = seeded(42);
    const rng2 = seeded(99);
    const v1 = rng1();
    const v2 = rng2();
    expect(v1).not.toEqual(v2);
  });

  it("returns values in [0, 1)", () => {
    const rng = seeded(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("produces reasonable distribution (no degenerate output)", () => {
    const rng = seeded(77);
    const values = Array.from({ length: 500 }, () => rng());
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    // Mean should be roughly 0.5 for uniform [0, 1)
    expect(avg).toBeGreaterThan(0.3);
    expect(avg).toBeLessThan(0.7);
  });

  it("handles zero seed", () => {
    const rng = seeded(0);
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it("handles negative seed", () => {
    const rng = seeded(-1);
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});

describe("seededLCG (Park-Miller)", () => {
  it("produces deterministic output", () => {
    const rng1 = seededLCG(42);
    const rng2 = seededLCG(42);
    const v1 = Array.from({ length: 10 }, () => rng1());
    const v2 = Array.from({ length: 10 }, () => rng2());
    expect(v1).toEqual(v2);
  });

  it("returns values in [0, 1)", () => {
    const rng = seededLCG(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("produces different output for different seeds", () => {
    const v1 = seededLCG(42)();
    const v2 = seededLCG(99)();
    expect(v1).not.toEqual(v2);
  });
});

describe("seededShuffle", () => {
  it("preserves all elements", () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = seededShuffle(arr, 42);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not mutate original array", () => {
    const arr = [1, 2, 3, 4, 5];
    seededShuffle(arr, 42);
    expect(arr).toEqual([1, 2, 3, 4, 5]);
  });

  it("is deterministic", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = seededShuffle(arr, 42);
    const b = seededShuffle(arr, 42);
    expect(a).toEqual(b);
  });

  it("produces different order for different seeds", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = seededShuffle(arr, 42);
    const b = seededShuffle(arr, 99);
    expect(a).not.toEqual(b);
  });

  it("handles empty array", () => {
    expect(seededShuffle([], 42)).toEqual([]);
  });

  it("handles single element", () => {
    expect(seededShuffle([1], 42)).toEqual([1]);
  });
});
