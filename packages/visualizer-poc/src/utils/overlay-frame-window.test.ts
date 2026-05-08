import { describe, it, expect } from "vitest";
import {
  pickFrameAtQuantile,
  sliceWindow,
  OVERLAY_VARIANTS,
  buildVariantWindows,
} from "./overlay-frame-window";
import type { EnhancedFrameData } from "../data/types";

function fr(rms: number, extra: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return { rms, ...extra } as EnhancedFrameData;
}

describe("pickFrameAtQuantile", () => {
  it("0.0 → quietest frame, 1.0 → loudest frame", () => {
    const frames = [fr(0.5), fr(0.1), fr(0.9), fr(0.3)];
    expect(pickFrameAtQuantile(frames, 0.0)).toBe(1); // 0.1
    expect(pickFrameAtQuantile(frames, 0.999)).toBe(2); // 0.9
  });

  it("0.5 picks a median-ish frame", () => {
    const frames = Array.from({ length: 100 }, (_, i) => fr(i / 100));
    const idx = pickFrameAtQuantile(frames, 0.5);
    expect(frames[idx].rms).toBeGreaterThanOrEqual(0.4);
    expect(frames[idx].rms).toBeLessThanOrEqual(0.6);
  });

  it("0.1 picks a quiet frame", () => {
    const frames = Array.from({ length: 100 }, (_, i) => fr(i / 100));
    const idx = pickFrameAtQuantile(frames, 0.1);
    expect(frames[idx].rms).toBeLessThanOrEqual(0.15);
  });

  it("0.9 picks a loud frame", () => {
    const frames = Array.from({ length: 100 }, (_, i) => fr(i / 100));
    const idx = pickFrameAtQuantile(frames, 0.9);
    expect(frames[idx].rms).toBeGreaterThanOrEqual(0.85);
  });

  it("returns 0 on empty input", () => {
    expect(pickFrameAtQuantile([], 0.5)).toBe(0);
  });

  it("treats missing rms as 0", () => {
    const frames = [fr(0.5), {} as EnhancedFrameData, fr(0.9)];
    expect(pickFrameAtQuantile(frames, 0.0)).toBe(1);
  });
});

describe("sliceWindow", () => {
  it("returns exactly `width` frames when center is in-bounds", () => {
    const frames = Array.from({ length: 100 }, (_, i) => fr(i));
    const win = sliceWindow(frames, 50, 60);
    expect(win.length).toBe(60);
    expect(win[0].rms).toBe(20);
    expect(win[30].rms).toBe(50);
    expect(win[59].rms).toBe(79);
  });

  it("pads with last frame when window runs off the end", () => {
    const frames = Array.from({ length: 100 }, (_, i) => fr(i));
    const win = sliceWindow(frames, 95, 60);
    expect(win.length).toBe(60);
    expect(win[win.length - 1].rms).toBe(99); // padded with last
  });

  it("clamps start to 0 when window runs off the front", () => {
    const frames = Array.from({ length: 100 }, (_, i) => fr(i));
    const win = sliceWindow(frames, 5, 60);
    expect(win.length).toBe(60);
    expect(win[0].rms).toBe(0);
  });

  it("returns empty when source frames are empty", () => {
    expect(sliceWindow([], 0, 60)).toEqual([]);
  });
});

describe("OVERLAY_VARIANTS", () => {
  it("emits exactly 3 variants", () => {
    expect(OVERLAY_VARIANTS).toHaveLength(3);
  });

  it("mid variant uses empty suffix for Rust backward-compat", () => {
    const mid = OVERLAY_VARIANTS.find((v) => v.pct === 0.50);
    expect(mid?.suffix).toBe("");
  });

  it("variants span low/mid/high quantiles", () => {
    const pcts = OVERLAY_VARIANTS.map((v) => v.pct).sort();
    expect(pcts[0]).toBeLessThan(0.25);
    expect(pcts[2]).toBeGreaterThan(0.75);
  });
});

describe("buildVariantWindows", () => {
  it("returns 3 (variant, window) pairs sized to windowFrames", () => {
    const frames = Array.from({ length: 1000 }, (_, i) => fr(i / 1000));
    const out = buildVariantWindows(frames, 60);
    expect(out).toHaveLength(3);
    for (const { window } of out) {
      expect(window.length).toBe(60);
    }
  });

  it("low-quantile window has lower-rms center than high", () => {
    const frames = Array.from({ length: 1000 }, (_, i) => fr(i / 1000));
    const [low, , high] = buildVariantWindows(frames, 60);
    expect(low.window[30].rms).toBeLessThan(high.window[30].rms);
  });
});
