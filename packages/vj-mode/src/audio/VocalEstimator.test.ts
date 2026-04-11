import { describe, it, expect, beforeEach } from "vitest";
import { VocalEstimator } from "./VocalEstimator";

describe("VocalEstimator", () => {
  let estimator: VocalEstimator;

  beforeEach(() => {
    estimator = new VocalEstimator(60, 15);
  });

  it("returns zero for silent input", () => {
    const result = estimator.update(0, 0, 0, 0, 0);
    expect(result.vocalPresence).toBe(0);
    expect(result.vocalEnergy).toBe(0);
  });

  it("detects vocal presence from tonal mid-range signal", () => {
    // Tonal (low flatness), mid-range centroid, decent mids
    for (let i = 0; i < 30; i++) {
      estimator.update(0.6, 0.3, 0.3, 0.1, 0.5);
    }

    const result = estimator.update(0.6, 0.3, 0.3, 0.1, 0.5);
    expect(result.vocalPresence).toBeGreaterThan(0.2);
    expect(result.vocalEnergy).toBeGreaterThan(0);
  });

  it("returns low vocal presence for noisy/percussive signal", () => {
    // High flatness = noise-like (drums, cymbals)
    for (let i = 0; i < 30; i++) {
      estimator.update(0.5, 0.7, 0.6, 0.8, 0.5);
    }

    const result = estimator.update(0.5, 0.7, 0.6, 0.8, 0.5);
    // Should be lower than tonal signal
    expect(result.vocalPresence).toBeLessThan(0.3);
  });

  it("returns low vocal presence for bass-heavy signal", () => {
    // Very low centroid = bass-dominated, not vocal
    for (let i = 0; i < 30; i++) {
      estimator.update(0.1, 0.05, 0.05, 0.2, 0.5);
    }

    const result = estimator.update(0.1, 0.05, 0.05, 0.2, 0.5);
    expect(result.vocalPresence).toBeLessThan(0.2);
  });

  it("vocal presence is in 0-1 range", () => {
    for (let i = 0; i < 30; i++) {
      estimator.update(0.8, 0.8, 0.35, 0.05, 0.9);
    }

    const result = estimator.update(0.8, 0.8, 0.35, 0.05, 0.9);
    expect(result.vocalPresence).toBeGreaterThanOrEqual(0);
    expect(result.vocalPresence).toBeLessThanOrEqual(1);
    expect(result.vocalEnergy).toBeGreaterThanOrEqual(0);
    expect(result.vocalEnergy).toBeLessThanOrEqual(1);
  });

  it("smooths values over time (EMA behavior)", () => {
    // Step from zero to vocal signal
    const r1 = estimator.update(0, 0, 0, 0, 0);
    const r2 = estimator.update(0.7, 0.3, 0.3, 0.1, 0.6);

    // Should not jump instantly to max value due to EMA
    expect(r2.vocalPresence).toBeLessThan(0.8);
    expect(r2.vocalPresence).toBeGreaterThan(r1.vocalPresence);
  });

  it("resets properly", () => {
    for (let i = 0; i < 30; i++) {
      estimator.update(0.6, 0.3, 0.3, 0.1, 0.5);
    }

    estimator.reset();
    const result = estimator.update(0, 0, 0, 0, 0);
    expect(result.vocalPresence).toBe(0);
    expect(result.vocalEnergy).toBe(0);
  });
});
