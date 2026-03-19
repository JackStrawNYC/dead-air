import { describe, it, expect } from "vitest";
import { computeTourModifiers, applyTourModifiers } from "./tour-position";
import type { TourPositionModifiers } from "./tour-position";
import type { ShowArcModifiers } from "../data/show-arc";

describe("computeTourModifiers", () => {
  it("returns neutral for standalone show (no fields)", () => {
    const m = computeTourModifiers({});
    expect(m.warmthShift).toBe(0);
    expect(m.brightnessOffset).toBe(0);
    expect(m.saturationOffset).toBe(0);
    expect(m.densityMult).toBe(1);
    expect(m.windowDurationMult).toBe(1);
    expect(m.abstractionOffset).toBe(0);
    expect(Object.keys(m.overlayBias)).toHaveLength(0);
  });

  it("night 1 of 4 is cooler/brighter than night 4", () => {
    const n1 = computeTourModifiers({ nightInRun: 1, totalNights: 4 });
    const n4 = computeTourModifiers({ nightInRun: 4, totalNights: 4 });

    // Night 1 cooler (more negative warmth)
    expect(n1.warmthShift).toBeLessThan(n4.warmthShift);
    // Night 1 brighter
    expect(n1.brightnessOffset).toBeGreaterThan(n4.brightnessOffset);
    // Night 4 richer saturation
    expect(n4.saturationOffset).toBeGreaterThan(n1.saturationOffset);
  });

  it("later nights have slower rotation, less density, more abstraction", () => {
    const n1 = computeTourModifiers({ nightInRun: 1, totalNights: 4 });
    const n4 = computeTourModifiers({ nightInRun: 4, totalNights: 4 });

    // Final night: slower rotation (higher windowDurationMult)
    expect(n4.windowDurationMult).toBeGreaterThan(n1.windowDurationMult);
    // Final night: less dense (lower densityMult)
    expect(n4.densityMult).toBeLessThan(n1.densityMult);
    // Final night: more abstract
    expect(n4.abstractionOffset).toBeGreaterThan(n1.abstractionOffset);
  });

  it("later nights bias toward sacred/nature, away from character", () => {
    const n4 = computeTourModifiers({ nightInRun: 4, totalNights: 4 });

    expect(n4.overlayBias.sacred).toBeGreaterThan(0);
    expect(n4.overlayBias.nature).toBeGreaterThan(0);
    expect(n4.overlayBias.character).toBeLessThan(0);
  });

  it("night 1 of 4 has no overlay bias (runProgress < 0.3 threshold)", () => {
    const n1 = computeTourModifiers({ nightInRun: 1, totalNights: 4 });
    expect(n1.overlayBias.sacred).toBeUndefined();
    expect(n1.overlayBias.nature).toBeUndefined();
    expect(n1.overlayBias.character).toBeUndefined();
  });

  it("daysOff=0 has no effect", () => {
    const m = computeTourModifiers({ daysOff: 0 });
    expect(m.warmthShift).toBe(0);
    expect(m.brightnessOffset).toBe(0);
    expect(m.densityMult).toBe(1);
    expect(m.windowDurationMult).toBe(1);
  });

  it("daysOff=7 produces fresh-legs boost", () => {
    const m = computeTourModifiers({ daysOff: 7 });

    // Brighter after rest
    expect(m.brightnessOffset).toBeGreaterThan(0);
    // Cooler (more negative warmth)
    expect(m.warmthShift).toBeLessThan(0);
    // Tighter rotation (lower windowDurationMult)
    expect(m.windowDurationMult).toBeLessThan(1);
    // Denser
    expect(m.densityMult).toBeGreaterThan(1);
    // Reactive bias
    expect(m.overlayBias.reactive).toBeGreaterThan(0);
  });

  it("daysOff=1 is minimal (freshness=0)", () => {
    const m = computeTourModifiers({ daysOff: 1 });
    expect(m.brightnessOffset).toBeCloseTo(0, 5);
    expect(m.warmthShift).toBeCloseTo(0, 5);
    expect(m.windowDurationMult).toBeCloseTo(1, 5);
    expect(m.densityMult).toBeCloseTo(1, 5);
  });

  it("combined: night 3 of 4 + 0 daysOff", () => {
    const m = computeTourModifiers({ nightInRun: 3, totalNights: 4, daysOff: 0 });
    // Night-in-run effect only — warmer than neutral
    expect(m.warmthShift).toBeGreaterThan(0);
    // No daysOff contribution
    expect(m.densityMult).toBeLessThan(1); // later night = spacious
  });

  it("combined: night 1 of 3 + 5 daysOff", () => {
    const m = computeTourModifiers({ nightInRun: 1, totalNights: 3, daysOff: 5 });
    // Night 1 cool + days-off cool = negative warmth
    expect(m.warmthShift).toBeLessThan(0);
    // Night 1 bright + days-off bright = positive
    expect(m.brightnessOffset).toBeGreaterThan(0);
  });

  it("clamps extreme inputs", () => {
    const m = computeTourModifiers({ nightInRun: 100, totalNights: 100, daysOff: 100 });
    expect(m.warmthShift).toBeGreaterThanOrEqual(-5);
    expect(m.warmthShift).toBeLessThanOrEqual(6);
    expect(m.brightnessOffset).toBeGreaterThanOrEqual(-0.05);
    expect(m.brightnessOffset).toBeLessThanOrEqual(0.05);
    expect(m.densityMult).toBeGreaterThanOrEqual(0.90);
    expect(m.densityMult).toBeLessThanOrEqual(1.10);
    expect(m.windowDurationMult).toBeGreaterThanOrEqual(0.90);
    expect(m.windowDurationMult).toBeLessThanOrEqual(1.10);
    expect(m.abstractionOffset).toBeGreaterThanOrEqual(0);
    expect(m.abstractionOffset).toBeLessThanOrEqual(0.08);
  });

  it("single-night run returns neutral night-in-run effect", () => {
    const m = computeTourModifiers({ nightInRun: 1, totalNights: 1 });
    // totalNights=1 means no arc (can't divide by 0)
    expect(m.warmthShift).toBe(0);
    expect(m.brightnessOffset).toBe(0);
    expect(m.densityMult).toBe(1);
  });
});

describe("applyTourModifiers", () => {
  const baseArc: ShowArcModifiers = {
    overlayBias: { character: 0.15, sacred: 0.05 },
    densityMult: 1.2,
    windowDurationMult: 0.8,
    saturationOffset: 0.05,
    brightnessOffset: 0.03,
    hueShift: 5,
    abstractionLevel: 0.1,
  };

  it("neutral tour modifiers produce identity composition", () => {
    const neutral: TourPositionModifiers = {
      warmthShift: 0,
      brightnessOffset: 0,
      saturationOffset: 0,
      densityMult: 1,
      windowDurationMult: 1,
      abstractionOffset: 0,
      overlayBias: {},
    };
    const result = applyTourModifiers(baseArc, neutral);
    expect(result.hueShift).toBe(baseArc.hueShift);
    expect(result.brightnessOffset).toBe(baseArc.brightnessOffset);
    expect(result.saturationOffset).toBe(baseArc.saturationOffset);
    expect(result.densityMult).toBe(baseArc.densityMult);
    expect(result.windowDurationMult).toBe(baseArc.windowDurationMult);
    expect(result.abstractionLevel).toBe(baseArc.abstractionLevel);
    expect(result.overlayBias).toEqual(baseArc.overlayBias);
  });

  it("additive composition for offsets", () => {
    const tour: TourPositionModifiers = {
      warmthShift: 3,
      brightnessOffset: -0.02,
      saturationOffset: 0.01,
      densityMult: 1,
      windowDurationMult: 1,
      abstractionOffset: 0.04,
      overlayBias: {},
    };
    const result = applyTourModifiers(baseArc, tour);
    expect(result.hueShift).toBeCloseTo(5 + 3);
    expect(result.brightnessOffset).toBeCloseTo(0.03 + -0.02);
    expect(result.saturationOffset).toBeCloseTo(0.05 + 0.01);
    expect(result.abstractionLevel).toBeCloseTo(0.1 + 0.04);
  });

  it("multiplicative composition for multipliers", () => {
    const tour: TourPositionModifiers = {
      warmthShift: 0,
      brightnessOffset: 0,
      saturationOffset: 0,
      densityMult: 0.95,
      windowDurationMult: 1.08,
      abstractionOffset: 0,
      overlayBias: {},
    };
    const result = applyTourModifiers(baseArc, tour);
    expect(result.densityMult).toBeCloseTo(1.2 * 0.95);
    expect(result.windowDurationMult).toBeCloseTo(0.8 * 1.08);
  });

  it("overlay bias merge adds new categories and sums existing", () => {
    const tour: TourPositionModifiers = {
      warmthShift: 0,
      brightnessOffset: 0,
      saturationOffset: 0,
      densityMult: 1,
      windowDurationMult: 1,
      abstractionOffset: 0,
      overlayBias: { sacred: 0.05, nature: 0.03 },
    };
    const result = applyTourModifiers(baseArc, tour);
    // sacred: 0.05 (base) + 0.05 (tour) = 0.10
    expect(result.overlayBias.sacred).toBeCloseTo(0.10);
    // nature: new from tour
    expect(result.overlayBias.nature).toBeCloseTo(0.03);
    // character: unchanged from base
    expect(result.overlayBias.character).toBe(0.15);
  });

  it("abstraction clamps to [0, 1]", () => {
    const highBase: ShowArcModifiers = {
      ...baseArc,
      abstractionLevel: 0.95,
    };
    const tour: TourPositionModifiers = {
      warmthShift: 0,
      brightnessOffset: 0,
      saturationOffset: 0,
      densityMult: 1,
      windowDurationMult: 1,
      abstractionOffset: 0.08,
      overlayBias: {},
    };
    const result = applyTourModifiers(highBase, tour);
    expect(result.abstractionLevel).toBe(1);
  });
});
