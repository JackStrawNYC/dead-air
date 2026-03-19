import { describe, it, expect } from "vitest";
import { detectPeakOfShow, computeSongPeakScore } from "./peak-of-show";
import type { EnhancedFrameData } from "../data/types";

function makeFrame(rms = 0.15, flatness = 0.3): EnhancedFrameData {
  return { rms, centroid: 0.5, onset: 0, beat: false, sub: 0.1, low: 0.1, mid: 0.15, high: 0.1, flatness, chroma: [0,0,0,0,0,0,0,0,0,0,0,0], contrast: [0,0,0,0,0,0,0] };
}

function makeFrames(count: number, rms: number, flatness = 0.3): EnhancedFrameData[] {
  return Array.from({ length: count }, () => makeFrame(rms, flatness));
}

describe("detectPeakOfShow", () => {
  it("returns neutral when already fired", () => {
    const frames = makeFrames(300, 0.5, 0.1);
    const result = detectPeakOfShow(frames, 150, [0.01], true, 10, 20);
    expect(result.isActive).toBe(false);
    expect(result.intensity).toBe(0);
    expect(result.densityMult).toBe(1);
  });

  it("returns neutral when too early in the show", () => {
    const frames = makeFrames(300, 0.5, 0.1);
    const result = detectPeakOfShow(frames, 150, [], false, 2, 20);
    expect(result.isActive).toBe(false);
  });

  it("returns neutral for low energy", () => {
    const frames = makeFrames(300, 0.02, 0.5);
    const result = detectPeakOfShow(frames, 150, [], false, 12, 20);
    expect(result.isActive).toBe(false);
  });

  it("detects peak when energy exceeds previous peaks", () => {
    // Very high energy, low flatness (tonal/coherent), past 40% of show
    const frames = makeFrames(300, 0.4, 0.1);
    const previousPeaks = [0.03, 0.05, 0.04]; // Low previous peaks
    const result = detectPeakOfShow(frames, 150, previousPeaks, false, 12, 20);
    expect(result.isActive).toBe(true);
    expect(result.intensity).toBeGreaterThan(0);
    expect(result.brightnessBoost).toBeGreaterThan(0);
    expect(result.saturationBoost).toBeGreaterThan(0);
    expect(result.densityMult).toBeLessThan(1);
    expect(result.motionMult).toBeLessThan(1);
  });

  it("does not fire when below previous peak threshold", () => {
    const frames = makeFrames(300, 0.15, 0.3);
    const previousPeaks = [0.5, 0.6]; // Very high previous peaks
    const result = detectPeakOfShow(frames, 150, previousPeaks, false, 12, 20);
    expect(result.isActive).toBe(false);
  });

  it("brightness boost is within expected range", () => {
    const frames = makeFrames(300, 0.5, 0.05);
    const result = detectPeakOfShow(frames, 150, [0.01], false, 12, 20);
    expect(result.brightnessBoost).toBeGreaterThanOrEqual(0);
    expect(result.brightnessBoost).toBeLessThanOrEqual(0.08);
  });

  it("saturation boost is within expected range", () => {
    const frames = makeFrames(300, 0.5, 0.05);
    const result = detectPeakOfShow(frames, 150, [0.01], false, 12, 20);
    expect(result.saturationBoost).toBeGreaterThanOrEqual(0);
    expect(result.saturationBoost).toBeLessThanOrEqual(0.12);
  });

  it("handles too few frames", () => {
    const frames = makeFrames(30, 0.5, 0.1);
    const result = detectPeakOfShow(frames, 15, [], false, 12, 20);
    expect(result.isActive).toBe(false);
  });
});

describe("computeSongPeakScore", () => {
  it("returns 0 for too few frames", () => {
    expect(computeSongPeakScore(makeFrames(10, 0.3))).toBe(0);
  });

  it("returns higher score for high energy + low flatness", () => {
    const highScore = computeSongPeakScore(makeFrames(300, 0.4, 0.1));
    const lowScore = computeSongPeakScore(makeFrames(300, 0.1, 0.5));
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it("score increases with energy", () => {
    const low = computeSongPeakScore(makeFrames(300, 0.15, 0.2));
    const high = computeSongPeakScore(makeFrames(300, 0.35, 0.2));
    expect(high).toBeGreaterThan(low);
  });
});
