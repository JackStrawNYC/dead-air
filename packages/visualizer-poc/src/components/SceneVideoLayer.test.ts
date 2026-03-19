import { describe, it, expect } from "vitest";
import {
  computeVideoOpacity,
  selectVideoBlendMode,
  isVideoFirstMoment,
  computeBeatCutInterval,
} from "./SceneVideoLayer";

// ─── computeVideoOpacity ───

describe("computeVideoOpacity", () => {
  it("quiet energy returns 0.70", () => {
    expect(computeVideoOpacity(0.02, false)).toBe(0.70);
    expect(computeVideoOpacity(0.05, true)).toBe(0.70);
  });

  it("build section intensifies with energy", () => {
    const low = computeVideoOpacity(0.05, false, "build");
    const mid = computeVideoOpacity(0.20, false, "build");
    expect(low).toBeCloseTo(0.425, 2);
    expect(mid).toBeCloseTo(0.50, 2);
    expect(mid).toBeGreaterThan(low);
  });

  it("build climax phase also intensifies", () => {
    const opacity = computeVideoOpacity(0.05, false, undefined, "build");
    expect(opacity).toBeCloseTo(0.425, 2);
  });

  it("peak + curated flashes on beat", () => {
    // With strong beat snap
    const withBeat = computeVideoOpacity(0.50, true, undefined, undefined, 0.8);
    expect(withBeat).toBeCloseTo(0.48, 2); // 0.60 * 0.8

    // Without beat snap → falls to base 0.15
    const noBeat = computeVideoOpacity(0.50, true, undefined, undefined, 0.1);
    expect(noBeat).toBe(0.15);
  });

  it("peak + general stays hidden at 0.03", () => {
    expect(computeVideoOpacity(0.50, false)).toBe(0.03);
    expect(computeVideoOpacity(0.80, false)).toBe(0.03);
  });

  it("climax + curated returns 0.80", () => {
    expect(computeVideoOpacity(0.50, true, undefined, "climax")).toBe(0.80);
    expect(computeVideoOpacity(0.60, true, undefined, "sustain")).toBe(0.80);
  });

  it("mid energy default returns gentle presence", () => {
    const opacity = computeVideoOpacity(0.15, false);
    expect(opacity).toBeCloseTo(0.455, 2);
    expect(opacity).toBeLessThan(0.50);
    expect(opacity).toBeGreaterThan(0.30);
  });
});

// ─── selectVideoBlendMode ───

describe("selectVideoBlendMode", () => {
  it("images always return screen", () => {
    expect(selectVideoBlendMode(true, 0.0)).toBe("screen");
    expect(selectVideoBlendMode(true, 0.5)).toBe("screen");
    expect(selectVideoBlendMode(true, 0.9, "verse", "climax")).toBe("screen");
  });

  it("climax returns color-burn for videos", () => {
    expect(selectVideoBlendMode(false, 0.5, undefined, "climax")).toBe("color-burn");
    expect(selectVideoBlendMode(false, 0.5, undefined, "sustain")).toBe("color-burn");
  });

  it("dark verse returns multiply", () => {
    expect(selectVideoBlendMode(false, 0.05, "verse")).toBe("multiply");
    expect(selectVideoBlendMode(false, 0.10, "intro")).toBe("multiply");
  });

  it("high energy non-climax returns overlay", () => {
    expect(selectVideoBlendMode(false, 0.40)).toBe("overlay");
    expect(selectVideoBlendMode(false, 0.30, "chorus")).toBe("overlay");
  });

  it("quiet atmospheric returns screen", () => {
    expect(selectVideoBlendMode(false, 0.10)).toBe("screen");
    expect(selectVideoBlendMode(false, 0.20)).toBe("screen");
  });
});

// ─── isVideoFirstMoment ───

describe("isVideoFirstMoment", () => {
  it("true for curated + climax + energy", () => {
    expect(isVideoFirstMoment(true, 0.5, "climax")).toBe(true);
    expect(isVideoFirstMoment(true, 0.4, "sustain")).toBe(true);
  });

  it("false for general media", () => {
    expect(isVideoFirstMoment(false, 0.5, "climax")).toBe(false);
  });

  it("false for low energy", () => {
    expect(isVideoFirstMoment(true, 0.1, "climax")).toBe(false);
  });

  it("false for non-climax phases", () => {
    expect(isVideoFirstMoment(true, 0.5, "build")).toBe(false);
    expect(isVideoFirstMoment(true, 0.5, undefined)).toBe(false);
  });
});

// ─── computeBeatCutInterval ───

describe("computeBeatCutInterval", () => {
  it("returns Infinity at low energy (no cuts)", () => {
    expect(computeBeatCutInterval(0.0)).toBe(Infinity);
    expect(computeBeatCutInterval(0.10)).toBe(Infinity);
    expect(computeBeatCutInterval(0.20)).toBe(Infinity);
  });

  it("interval decreases with energy", () => {
    const lowEnergy = computeBeatCutInterval(0.30);
    const highEnergy = computeBeatCutInterval(0.80);
    expect(lowEnergy).toBeGreaterThan(highEnergy);
    expect(lowEnergy).toBeLessThan(150);
    expect(highEnergy).toBeGreaterThan(20);
  });

  it("peak energy gives ~54 frames", () => {
    // 150 - 0.8 * 120 = 54
    expect(computeBeatCutInterval(0.80)).toBe(54);
  });
});
