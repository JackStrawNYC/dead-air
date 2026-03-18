import { describe, it, expect } from "vitest";
import { computeSegueHueRotation } from "./segue-blend";
import type { ColorPalette } from "../data/types";

describe("computeSegueHueRotation", () => {
  const paletteA: ColorPalette = { primary: 180, secondary: 90 };
  const paletteB: ColorPalette = { primary: 60, secondary: 300 };

  it("returns 0 when palette is undefined", () => {
    const result = computeSegueHueRotation(
      undefined, false, false, undefined, undefined, 50, 200, 30,
    );
    expect(result).toBe(0);
  });

  it("returns paletteHueRotation(palette) for normal non-segue frame", () => {
    // No segue flags: should return the standard palette rotation
    const result = computeSegueHueRotation(
      paletteA, false, false, undefined, undefined, 50, 200, 30,
    );
    // paletteHueRotation computes rotation relative to default 270.
    // For primary=180: diff = 180 - 270 = -90, rotation = -90 * 0.25 = -22.5
    expect(result).toBeCloseTo(-22.5);
  });

  it("segue in: frame < fadeFrames blends from segueFromPalette to palette", () => {
    const fadeFrames = 30;
    const durationInFrames = 200;

    // At frame 0 (start of segue in), progress=0 → blended = segueFromPalette (paletteB)
    // paletteB primary=60: diff from 270 = 60-270 = -210, wrap → 150, rotation=150*0.25=37.5
    const atStart = computeSegueHueRotation(
      paletteA, true, false, paletteB, undefined, 0, durationInFrames, fadeFrames,
    );
    expect(atStart).toBeCloseTo(37.5);

    // At frame near fadeFrames, progress=29/30 → blended primary ≈ 176
    // blendHue(60, 180, 29/30) = 60 + 120*(29/30) = 176
    // paletteHueRotation({primary:176}): diff=176-270=-94, rotation=-94*0.25=-23.5
    const atEnd = computeSegueHueRotation(
      paletteA, true, false, paletteB, undefined, fadeFrames - 1, durationInFrames, fadeFrames,
    );
    expect(atEnd).toBeCloseTo(-23.5);

    // The blend transitions from paletteB rotation toward paletteA rotation
    expect(atStart).toBeGreaterThan(atEnd);
  });

  it("segue out: frame > duration - fadeFrames blends from palette to segueToPalette", () => {
    const fadeFrames = 30;
    const durationInFrames = 200;

    // At the start of segue out: progress=1/30 → blended primary ≈ 176
    // blendHue(180, 60, 1/30) = 180 + (-120)*(1/30) = 176
    // paletteHueRotation({primary:176}): diff=176-270=-94, rotation=-94*0.25=-23.5
    const outStart = computeSegueHueRotation(
      paletteA, false, true, undefined, paletteB, durationInFrames - fadeFrames + 1, durationInFrames, fadeFrames,
    );
    expect(outStart).toBeCloseTo(-23.5);

    // At the end of segue out: progress=29/30 → blended primary ≈ 64
    // blendHue(180, 60, 29/30) = 180 + (-120)*(29/30) = 64
    // paletteHueRotation({primary:64}): diff=64-270=-206, wrap → 154, rotation=154*0.25=38.5
    const outEnd = computeSegueHueRotation(
      paletteA, false, true, undefined, paletteB, durationInFrames - 1, durationInFrames, fadeFrames,
    );
    expect(outEnd).toBeCloseTo(38.5);

    // The blend transitions from paletteA rotation toward paletteB rotation
    expect(outEnd).toBeGreaterThan(outStart);
  });

  it("non-segue frames in a segue song return normal palette rotation", () => {
    const fadeFrames = 30;
    const durationInFrames = 200;

    // Frame in the middle of the song (not in fade zones)
    const midFrame = computeSegueHueRotation(
      paletteA, true, true, paletteB, paletteB, 100, durationInFrames, fadeFrames,
    );
    // Frame 100 is past fadeFrames (30) and before durationInFrames-fadeFrames (170)
    // So it returns paletteHueRotation(paletteA)
    expect(midFrame).toBeCloseTo(-22.5);
  });

  it("segue in without segueFromPalette returns normal palette rotation", () => {
    const result = computeSegueHueRotation(
      paletteA, true, false, undefined, undefined, 5, 200, 30,
    );
    // segueIn=true but segueFromPalette is undefined, so falls through
    expect(result).toBeCloseTo(-22.5);
  });

  it("segue out without segueToPalette returns normal palette rotation", () => {
    const result = computeSegueHueRotation(
      paletteA, false, true, undefined, undefined, 195, 200, 30,
    );
    // segueOut=true but segueToPalette is undefined, so falls through
    expect(result).toBeCloseTo(-22.5);
  });
});
