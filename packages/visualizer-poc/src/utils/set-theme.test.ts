import { describe, it, expect } from "vitest";
import { getSetTheme } from "./set-theme";

describe("getSetTheme", () => {
  it("returns warm, punchy theme for set 1", () => {
    const theme = getSetTheme(1);
    expect(theme.saturationMult).toBe(1.10);
    expect(theme.warmthShift).toBe(5);
    expect(theme.brightnessOffset).toBe(0.03);
  });

  it("returns cool, ethereal theme for set 2", () => {
    const theme = getSetTheme(2);
    expect(theme.saturationMult).toBe(0.90);
    expect(theme.warmthShift).toBe(-8);
    expect(theme.brightnessOffset).toBe(-0.05);
  });

  it("returns subdued, intimate theme for encore (set 3)", () => {
    const theme = getSetTheme(3);
    expect(theme.saturationMult).toBe(0.85);
    expect(theme.warmthShift).toBe(0);
    expect(theme.brightnessOffset).toBe(-0.08);
  });

  it("returns neutral theme for unknown set number", () => {
    const theme = getSetTheme(99);
    expect(theme.saturationMult).toBe(1.0);
    expect(theme.warmthShift).toBe(0);
    expect(theme.brightnessOffset).toBe(0);
  });

  it("returns neutral theme for set 0", () => {
    const theme = getSetTheme(0);
    expect(theme.saturationMult).toBe(1.0);
    expect(theme.warmthShift).toBe(0);
    expect(theme.brightnessOffset).toBe(0);
  });

  it("returns neutral theme for negative set number", () => {
    const theme = getSetTheme(-1);
    expect(theme.saturationMult).toBe(1.0);
    expect(theme.warmthShift).toBe(0);
    expect(theme.brightnessOffset).toBe(0);
  });
});
