import { describe, it, expect, beforeEach } from "vitest";
import { BeatStabilityEstimator } from "./BeatStabilityEstimator";

describe("BeatStabilityEstimator", () => {
  let estimator: BeatStabilityEstimator;

  beforeEach(() => {
    estimator = new BeatStabilityEstimator(8); // 8-second window
  });

  it("returns zero stability with no beats", () => {
    const result = estimator.update(false, 1000);
    expect(result.beatStability).toBe(0);
    expect(result.beatConfidence).toBe(0);
  });

  it("returns low confidence with few beats", () => {
    estimator.update(true, 0);
    estimator.update(true, 500);
    const result = estimator.update(true, 1000);
    // Only 3 onsets = 2 intervals, confidence should be moderate at best
    expect(result.beatConfidence).toBeLessThan(0.8);
  });

  it("returns high stability for perfectly regular beats", () => {
    // 120 BPM = beat every 500ms, perfectly even
    for (let i = 0; i < 16; i++) {
      estimator.update(true, i * 500);
    }

    const result = estimator.update(false, 8000);
    expect(result.beatStability).toBeGreaterThan(0.9);
    expect(result.beatConfidence).toBeGreaterThan(0.8);
  });

  it("returns lower stability for irregular beats", () => {
    // Irregular intervals: 300, 700, 200, 800, 400, 600, 350, 650
    const times = [0, 300, 1000, 1200, 2000, 2400, 3000, 3350, 4000];
    for (const t of times) {
      estimator.update(true, t);
    }

    const result = estimator.update(false, 4500);
    // Should be less stable than perfectly regular beats
    expect(result.beatStability).toBeLessThan(0.8);
  });

  it("stability values are in 0-1 range", () => {
    // Feed various beat patterns
    for (let i = 0; i < 20; i++) {
      estimator.update(true, i * (300 + Math.sin(i) * 100));
    }

    const result = estimator.update(false, 10000);
    expect(result.beatStability).toBeGreaterThanOrEqual(0);
    expect(result.beatStability).toBeLessThanOrEqual(1);
    expect(result.beatConfidence).toBeGreaterThanOrEqual(0);
    expect(result.beatConfidence).toBeLessThanOrEqual(1);
  });

  it("prunes old beats outside window", () => {
    // Add beats in first second
    for (let i = 0; i < 4; i++) {
      estimator.update(true, i * 250);
    }

    // Jump to 10 seconds later (beyond 8-second window)
    const result = estimator.update(false, 10000);
    // Old beats should be pruned, so few/no intervals remain
    expect(result.beatConfidence).toBeLessThan(0.5);
  });

  it("confidence scales with number of beats", () => {
    // Add increasing number of beats and check confidence grows
    let prevConfidence = 0;
    for (let i = 0; i < 20; i++) {
      const result = estimator.update(true, i * 400);
      if (i > 4) {
        expect(result.beatConfidence).toBeGreaterThanOrEqual(prevConfidence - 0.01);
      }
      prevConfidence = result.beatConfidence;
    }
  });

  it("resets properly", () => {
    for (let i = 0; i < 10; i++) {
      estimator.update(true, i * 500);
    }

    estimator.reset();
    const result = estimator.update(false, 0);
    expect(result.beatStability).toBe(0);
    expect(result.beatConfidence).toBe(0);
  });
});
