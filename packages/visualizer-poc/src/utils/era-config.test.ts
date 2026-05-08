/**
 * Era config — verify each era reads as a distinct film stock, not just
 * a hue tint. Audit identified that prior values made 1972 and 1977
 * visually identical to a viewer.
 */
import { describe, it, expect } from "vitest";
import {
  ERA_SATURATION,
  ERA_BRIGHTNESS,
  ERA_SEPIA,
  ERA_BLACK_LIFT,
  ERA_CONTRAST_SCALE,
} from "./shader-uniforms";

const ERAS = ["primal", "classic", "hiatus", "touch_of_grey", "revival"] as const;

describe("Era config — distinguishability", () => {
  it("all 5 eras have all 5 values defined", () => {
    for (const era of ERAS) {
      expect(ERA_SATURATION[era]).toBeDefined();
      expect(ERA_BRIGHTNESS[era]).toBeDefined();
      expect(ERA_SEPIA[era]).toBeDefined();
      expect(ERA_BLACK_LIFT[era]).toBeDefined();
      expect(ERA_CONTRAST_SCALE[era]).toBeDefined();
    }
  });

  it("primal (1972) and classic (1977) saturation differ by > 15%", () => {
    // Audit pinned this — primal=0.85, classic=1.10 → 25% gap. Anything
    // tighter and a viewer can't distinguish on screen.
    const gap = Math.abs(ERA_SATURATION.classic - ERA_SATURATION.primal);
    expect(gap, `primal/classic saturation gap = ${gap.toFixed(2)}`).toBeGreaterThan(0.15);
  });

  it("primal and classic brightness differ by > 8%", () => {
    const gap = Math.abs(ERA_BRIGHTNESS.classic - ERA_BRIGHTNESS.primal);
    expect(gap, `primal/classic brightness gap = ${gap.toFixed(2)}`).toBeGreaterThan(0.08);
  });

  it("primal has heavier sepia + lifted blacks than digital eras", () => {
    expect(ERA_SEPIA.primal).toBeGreaterThan(ERA_SEPIA.touch_of_grey);
    expect(ERA_SEPIA.primal).toBeGreaterThan(ERA_SEPIA.revival);
    expect(ERA_BLACK_LIFT.primal).toBeGreaterThan(ERA_BLACK_LIFT.revival);
    expect(ERA_BLACK_LIFT.primal).toBeGreaterThan(0.04);
  });

  it("primal contrast is softer than touch_of_grey (film vs MTV)", () => {
    expect(ERA_CONTRAST_SCALE.primal).toBeLessThan(1.0);
    expect(ERA_CONTRAST_SCALE.touch_of_grey).toBeGreaterThan(1.0);
  });

  it("revival (digital era) is a clean neutral baseline", () => {
    expect(ERA_BRIGHTNESS.revival).toBe(1.0);
    expect(ERA_SEPIA.revival).toBe(0.0);
    expect(ERA_BLACK_LIFT.revival).toBe(0.0);
    expect(ERA_CONTRAST_SCALE.revival).toBe(1.0);
  });

  it("eras are pairwise distinct on at least 2 of 5 dimensions", () => {
    // No two eras should share 4+ identical values — that would mean the
    // viewer can't tell them apart even if a couple knobs differ.
    for (let i = 0; i < ERAS.length; i++) {
      for (let j = i + 1; j < ERAS.length; j++) {
        const a = ERAS[i], b = ERAS[j];
        const matches = [
          ERA_SATURATION[a] === ERA_SATURATION[b],
          ERA_BRIGHTNESS[a] === ERA_BRIGHTNESS[b],
          ERA_SEPIA[a] === ERA_SEPIA[b],
          ERA_BLACK_LIFT[a] === ERA_BLACK_LIFT[b],
          ERA_CONTRAST_SCALE[a] === ERA_CONTRAST_SCALE[b],
        ].filter(Boolean).length;
        expect(matches, `${a} vs ${b} match on ${matches}/5 dimensions`).toBeLessThanOrEqual(3);
      }
    }
  });
});
