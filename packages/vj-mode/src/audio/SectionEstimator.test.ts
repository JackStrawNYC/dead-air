import { describe, it, expect, beforeEach } from "vitest";
import { SectionEstimator } from "./SectionEstimator";

describe("SectionEstimator", () => {
  let estimator: SectionEstimator;

  beforeEach(() => {
    estimator = new SectionEstimator(60, 3); // 60fps, 3s hysteresis
  });

  it("starts as verse by default", () => {
    const result = estimator.update(0.3, 0.5, 0.5, 0.3, 0);
    expect(result.sectionType).toBe("verse");
  });

  it("detects space in quiet passages", () => {
    // Feed quiet audio for >3 seconds
    for (let i = 0; i < 200; i++) {
      estimator.update(0.05, 0.1, 0.1, 0.5, i / 60);
    }

    const result = estimator.update(0.05, 0.1, 0.1, 0.5, 200 / 60);
    expect(result.sectionType).toBe("space");
  });

  it("detects chorus at high energy with stable beats", () => {
    // First establish some time (initial verse)
    for (let i = 0; i < 200; i++) {
      estimator.update(0.3, 0.5, 0.5, 0.3, i / 60);
    }

    // High energy, high stability, high beat confidence
    for (let i = 200; i < 400; i++) {
      estimator.update(0.7, 0.8, 0.7, 0.2, i / 60);
    }

    const result = estimator.update(0.7, 0.8, 0.7, 0.2, 400 / 60);
    expect(result.sectionType).toBe("chorus");
  });

  it("detects peak at very high energy", () => {
    for (let i = 0; i < 200; i++) {
      estimator.update(0.3, 0.5, 0.5, 0.3, i / 60);
    }

    // Need enough frames for EMA to settle at 0.85 (past 0.75 peak threshold)
    for (let i = 200; i < 800; i++) {
      estimator.update(0.85, 0.7, 0.5, 0.3, i / 60);
    }

    const result = estimator.update(0.85, 0.7, 0.5, 0.3, 800 / 60);
    expect(result.sectionType).toBe("peak");
  });

  it("detects jam at medium energy with beat instability", () => {
    for (let i = 0; i < 200; i++) {
      estimator.update(0.3, 0.5, 0.5, 0.3, i / 60);
    }

    // Medium-high energy, low stability, moderate beat confidence
    for (let i = 200; i < 400; i++) {
      estimator.update(0.45, 0.3, 0.5, 0.4, i / 60);
    }

    const result = estimator.update(0.45, 0.3, 0.5, 0.4, 400 / 60);
    expect(result.sectionType).toBe("jam");
  });

  it("respects hysteresis (does not change section too quickly)", () => {
    // Start in verse
    const r1 = estimator.update(0.3, 0.5, 0.5, 0.3, 0);
    expect(r1.sectionType).toBe("verse");

    // Suddenly go quiet (space conditions) but only 1 second later
    const r2 = estimator.update(0.05, 0.1, 0.1, 0.5, 1);
    expect(r2.sectionType).toBe("verse"); // should NOT change yet (hysteresis = 3s)
  });

  it("section progress starts at 0 and increases", () => {
    const r1 = estimator.update(0.3, 0.5, 0.5, 0.3, 0);
    expect(r1.sectionProgress).toBe(0);

    const r2 = estimator.update(0.3, 0.5, 0.5, 0.3, 10);
    expect(r2.sectionProgress).toBeGreaterThan(0);
    expect(r2.sectionProgress).toBeLessThanOrEqual(1);
  });

  it("section progress caps at 1", () => {
    // 60+ seconds in same section
    const result = estimator.update(0.3, 0.5, 0.5, 0.3, 120);
    expect(result.sectionProgress).toBe(1);
  });

  it("section type is a valid string", () => {
    const validTypes = ["verse", "chorus", "jam", "space", "build", "peak"];
    const result = estimator.update(0.5, 0.5, 0.5, 0.3, 0);
    expect(validTypes).toContain(result.sectionType);
  });

  it("resets properly", () => {
    for (let i = 0; i < 200; i++) {
      estimator.update(0.05, 0.1, 0.1, 0.5, i / 60);
    }

    estimator.reset();
    const result = estimator.update(0.3, 0.5, 0.5, 0.3, 0);
    expect(result.sectionType).toBe("verse");
    expect(result.sectionProgress).toBe(0);
  });
});
