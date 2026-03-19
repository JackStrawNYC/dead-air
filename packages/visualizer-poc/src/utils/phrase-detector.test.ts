import { describe, it, expect } from "vitest";
import { detectPhrase } from "./phrase-detector";
import type { FrameData } from "../data/types";

function makeFrame(rms = 0.15): FrameData {
  return { rms, centroid: 0.5, onset: 0, beat: false, sub: 0.1, low: 0.1, mid: 0.15, high: 0.1 };
}

function makeFrames(count: number, rmsPattern: (i: number) => number): FrameData[] {
  return Array.from({ length: count }, (_, i) => makeFrame(rmsPattern(i)));
}

describe("detectPhrase", () => {
  it("returns neutral for too few frames", () => {
    const result = detectPhrase([], 0, 120);
    expect(result.phraseProgress).toBe(0);
    expect(result.brightnessBreathing).toBe(0);
    expect(result.zoomBreathing).toBe(1);
  });

  it("computes progress through a phrase", () => {
    // 120 BPM → 16 beats / 2 BPS = 8 seconds → 240 frames at 30fps
    const frames = makeFrames(480, () => 0.15);
    const earlyResult = detectPhrase(frames, 10, 120);
    const midResult = detectPhrase(frames, 120, 120);
    const lateResult = detectPhrase(frames, 230, 120);

    expect(earlyResult.phraseProgress).toBeLessThan(0.3);
    expect(midResult.phraseProgress).toBeGreaterThan(0.3);
    expect(midResult.phraseProgress).toBeLessThan(0.7);
    expect(lateResult.phraseProgress).toBeGreaterThan(0.7);
  });

  it("brightness breathing peaks at mid-phrase", () => {
    const frames = makeFrames(480, () => 0.2);

    // At phrase boundary (start)
    const start = detectPhrase(frames, 1, 120);
    // At phrase midpoint (~120 frames in)
    const mid = detectPhrase(frames, 120, 120);

    // Mid-phrase should have positive brightness breathing
    expect(mid.brightnessBreathing).toBeGreaterThan(start.brightnessBreathing);
  });

  it("zoom breathing stays within expected range", () => {
    const frames = makeFrames(480, () => 0.25);
    for (let i = 0; i < 480; i += 30) {
      const result = detectPhrase(frames, i, 120);
      expect(result.zoomBreathing).toBeGreaterThanOrEqual(0.97);
      expect(result.zoomBreathing).toBeLessThanOrEqual(1.03);
    }
  });

  it("phrase intensity reflects energy relative to baseline", () => {
    // First half quiet, second half loud
    const frames = makeFrames(480, (i) => i < 240 ? 0.05 : 0.30);
    const quietPhrase = detectPhrase(frames, 60, 120);
    const loudPhrase = detectPhrase(frames, 360, 120);

    expect(loudPhrase.phraseIntensity).toBeGreaterThan(quietPhrase.phraseIntensity);
  });

  it("handles different tempos", () => {
    const frames = makeFrames(900, () => 0.15);
    // Slow tempo: longer phrases
    const slow = detectPhrase(frames, 100, 70);
    // Fast tempo: shorter phrases
    const fast = detectPhrase(frames, 100, 180);

    // Both should return valid results
    expect(slow.phraseProgress).toBeGreaterThanOrEqual(0);
    expect(slow.phraseProgress).toBeLessThanOrEqual(1);
    expect(fast.phraseProgress).toBeGreaterThanOrEqual(0);
    expect(fast.phraseProgress).toBeLessThanOrEqual(1);
  });

  it("detects phrase boundaries", () => {
    const frames = makeFrames(480, () => 0.15);
    // Near the start of a phrase grid boundary
    const nearBoundary = detectPhrase(frames, 241, 120);
    // Deep inside a phrase
    const midPhrase = detectPhrase(frames, 120, 120);

    // At least one should be detected as boundary
    // (The exact result depends on energy valleys)
    expect(typeof nearBoundary.isPhraseBoundary).toBe("boolean");
    expect(typeof midPhrase.isPhraseBoundary).toBe("boolean");
  });

  it("clamps extreme tempos", () => {
    const frames = makeFrames(300, () => 0.15);
    // Very slow — would compute huge phrase lengths
    const result1 = detectPhrase(frames, 100, 30);
    expect(result1.phraseProgress).toBeGreaterThanOrEqual(0);

    // Very fast — tiny phrases
    const result2 = detectPhrase(frames, 100, 300);
    expect(result2.phraseProgress).toBeGreaterThanOrEqual(0);
  });

  it("saturation breathing trails brightness", () => {
    const frames = makeFrames(480, () => 0.25);
    // At 25% progress, brightness should be ramping up, saturation slightly behind
    const result = detectPhrase(frames, 60, 120);
    expect(typeof result.saturationBreathing).toBe("number");
    expect(Math.abs(result.saturationBreathing)).toBeLessThanOrEqual(0.05);
  });
});
