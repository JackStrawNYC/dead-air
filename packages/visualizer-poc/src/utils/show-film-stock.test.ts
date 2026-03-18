import { describe, it, expect } from "vitest";
import { deriveFilmStock, FilmStockParams } from "./show-film-stock";

describe("deriveFilmStock", () => {
  it("returns deterministic results for the same seed", () => {
    const a = deriveFilmStock(12345);
    const b = deriveFilmStock(12345);
    expect(a).toEqual(b);
  });

  it("returns different results for different seeds", () => {
    const a = deriveFilmStock(100);
    const b = deriveFilmStock(200);
    const c = deriveFilmStock(999999);
    // At least one parameter should differ between each pair
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
    expect(b).not.toEqual(c);
  });

  it("keeps all values within specified bounds", () => {
    // Test across many seeds to ensure bounds hold
    for (let seed = 0; seed < 500; seed++) {
      const fs = deriveFilmStock(seed * 7919); // prime stride for spread
      expect(fs.warmth).toBeGreaterThanOrEqual(-0.15);
      expect(fs.warmth).toBeLessThanOrEqual(0.15);
      expect(fs.contrast).toBeGreaterThanOrEqual(0.85);
      expect(fs.contrast).toBeLessThanOrEqual(1.15);
      expect(fs.saturation).toBeGreaterThanOrEqual(-0.12);
      expect(fs.saturation).toBeLessThanOrEqual(0.12);
      expect(fs.grain).toBeGreaterThanOrEqual(0.7);
      expect(fs.grain).toBeLessThanOrEqual(1.4);
      expect(fs.bloom).toBeGreaterThanOrEqual(0.6);
      expect(fs.bloom).toBeLessThanOrEqual(1.4);
    }
  });

  it("produces varied distribution across seeds", () => {
    // Collect values across many seeds and check they span the range
    const samples: FilmStockParams[] = [];
    for (let i = 0; i < 100; i++) {
      samples.push(deriveFilmStock(i * 31337));
    }
    const warmths = samples.map((s) => s.warmth);
    const range = Math.max(...warmths) - Math.min(...warmths);
    // Should span at least 50% of the theoretical range (0.30)
    expect(range).toBeGreaterThan(0.15);
  });
});
