import { describe, it, expect, beforeEach } from "vitest";
import { JamDensityEstimator } from "./JamDensityEstimator";

describe("JamDensityEstimator", () => {
  let estimator: JamDensityEstimator;

  beforeEach(() => {
    estimator = new JamDensityEstimator(30, 3, 60); // 30s window, 3min long jam, 60fps
  });

  it("returns zero density with no onsets", () => {
    const result = estimator.update(0, false, 0);
    expect(result.jamDensity).toBe(0);
    expect(result.isLongJam).toBe(false);
  });

  it("density increases with frequent onsets", () => {
    // Feed many onsets over time
    for (let i = 0; i < 300; i++) {
      estimator.update(0.5, i % 10 === 0, i * 16.67); // beat every 10 frames
    }

    const result = estimator.update(0.5, true, 300 * 16.67);
    expect(result.jamDensity).toBeGreaterThan(0.1);
  });

  it("density stays low with sparse onsets", () => {
    // Very few onsets over a long period
    for (let i = 0; i < 300; i++) {
      estimator.update(0.05, false, i * 16.67); // below threshold, no beats
    }

    const result = estimator.update(0.05, false, 300 * 16.67);
    expect(result.jamDensity).toBeLessThan(0.1);
  });

  it("density is in 0-1 range", () => {
    // Dense onsets every frame
    for (let i = 0; i < 300; i++) {
      estimator.update(0.8, true, i * 16.67);
    }

    const result = estimator.update(0.8, true, 300 * 16.67);
    expect(result.jamDensity).toBeGreaterThanOrEqual(0);
    expect(result.jamDensity).toBeLessThanOrEqual(1);
  });

  it("isLongJam is false before 3 minutes", () => {
    // Run for 2 minutes
    const twoMinMs = 2 * 60 * 1000;
    const result = estimator.update(0.5, true, twoMinMs, "jam");
    expect(result.isLongJam).toBe(false);
  });

  it("isLongJam is true after 3 minutes in same section", () => {
    // Start a section
    estimator.update(0.5, true, 0, "jam");

    // Jump to 3.5 minutes later, same section
    const threeAndHalfMinMs = 3.5 * 60 * 1000;
    const result = estimator.update(0.5, true, threeAndHalfMinMs, "jam");
    expect(result.isLongJam).toBe(true);
  });

  it("isLongJam resets when section changes", () => {
    // Start a "jam" section
    estimator.update(0.5, true, 0, "jam");

    // 4 minutes into jam
    estimator.update(0.5, true, 4 * 60 * 1000, "jam");

    // Section changes to "verse"
    const result = estimator.update(0.5, true, 4 * 60 * 1000 + 100, "verse");
    expect(result.isLongJam).toBe(false); // restarted timer
  });

  it("prunes old onsets outside window", () => {
    // Add onsets at time 0
    for (let i = 0; i < 100; i++) {
      estimator.update(0.5, true, i * 10);
    }

    // Jump to 60 seconds later (well beyond 30s window)
    // No new onsets
    for (let i = 0; i < 60; i++) {
      estimator.update(0.05, false, 35000 + i * 16.67);
    }

    const result = estimator.update(0.05, false, 36000);
    // Old onsets should be pruned, density should have decreased
    expect(result.jamDensity).toBeLessThan(0.5);
  });

  it("resets properly", () => {
    for (let i = 0; i < 100; i++) {
      estimator.update(0.8, true, i * 16.67, "jam");
    }

    estimator.reset();
    const result = estimator.update(0, false, 0);
    expect(result.jamDensity).toBe(0);
    expect(result.isLongJam).toBe(false);
  });
});
