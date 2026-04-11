import { describe, it, expect } from "vitest";
import { findMusicEnd } from "./music-end";
import type { EnhancedFrameData } from "../data/types";

function mockFrame(rms: number): EnhancedFrameData {
  return {
    rms,
    centroid: 0,
    onset: 0,
    beat: false,
    sub: 0,
    low: 0,
    mid: 0,
    high: 0,
    chroma: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    contrast: [0, 0, 0, 0, 0, 0, 0],
    flatness: 0,
  };
}

describe("findMusicEnd", () => {
  it("returns totalFrames for empty frames array", () => {
    expect(findMusicEnd([], 1000)).toBe(1000);
  });

  it("returns totalFrames when all frames have high RMS (no dead air)", () => {
    const frames = Array.from({ length: 1000 }, () => mockFrame(0.3));
    expect(findMusicEnd(frames, 1000)).toBe(1000);
  });

  it("detects music end when long silence tail exists (>300 frames)", () => {
    // 600 frames of music followed by 400 frames of silence
    const musicalFrames = Array.from({ length: 600 }, () => mockFrame(0.3));
    const silentFrames = Array.from({ length: 400 }, () => mockFrame(0.01));
    const frames = [...musicalFrames, ...silentFrames];
    const totalFrames = frames.length;

    const result = findMusicEnd(frames, totalFrames);
    // Should detect the end of music somewhere before totalFrames
    expect(result).toBeLessThan(totalFrames);
    // The scan steps backwards by 30 frames with a 90-frame smoothing window,
    // so the detected frame may be slightly past the boundary where the
    // averaged window still contains enough musical energy to pass threshold.
    // Allow for the smoothing window overlap (up to ~half window + step size).
    expect(result).toBeLessThanOrEqual(650);
  });

  it("returns totalFrames when silence tail is too short (<300 frames)", () => {
    // 800 frames of music followed by 200 frames of silence (< MIN_TAIL_GAP=300)
    const musicalFrames = Array.from({ length: 800 }, () => mockFrame(0.3));
    const silentFrames = Array.from({ length: 200 }, () => mockFrame(0.01));
    const frames = [...musicalFrames, ...silentFrames];
    const totalFrames = frames.length;

    const result = findMusicEnd(frames, totalFrames);
    expect(result).toBe(totalFrames);
  });

  it("handles frames with RMS just above the threshold", () => {
    // All frames slightly above threshold (0.13) — clearly musical
    // (threshold is 0.12 smoothed RMS)
    const frames = Array.from({ length: 500 }, () => mockFrame(0.13));
    const totalFrames = frames.length;

    const result = findMusicEnd(frames, totalFrames);
    expect(result).toBe(totalFrames);
  });

  it("handles frames with RMS below the threshold as silence", () => {
    // All frames below threshold (0.05) — treated as silence
    // With only silence, lastMusicalFrame stays 0
    // tailGap = 500 - 0 = 500 >= MIN_TAIL_GAP (300) → returns 0
    const frames = Array.from({ length: 500 }, () => mockFrame(0.05));
    const totalFrames = frames.length;

    const result = findMusicEnd(frames, totalFrames);
    expect(result).toBe(0);
  });

  it("handles very short frame arrays gracefully", () => {
    const frames = [mockFrame(0.3), mockFrame(0.3), mockFrame(0.01)];
    // Fewer frames than SMOOTH_WINDOW (90), so scan loop won't find anything
    const result = findMusicEnd(frames, frames.length);
    // With fewer than SMOOTH_WINDOW frames, lastMusicalFrame stays 0
    // tailGap = 3 - 0 = 3, which is < MIN_TAIL_GAP (300)
    expect(result).toBe(frames.length);
  });

  it("finds music end in a realistic scenario with gradual fade", () => {
    // 900 frames of music, then 100 frames of gradual fade, then 500 frames of silence
    const music = Array.from({ length: 900 }, () => mockFrame(0.25));
    const fade = Array.from({ length: 100 }, (_, i) =>
      mockFrame(0.25 * (1 - i / 100)),
    );
    const silence = Array.from({ length: 500 }, () => mockFrame(0.01));
    const frames = [...music, ...fade, ...silence];
    const totalFrames = frames.length;

    const result = findMusicEnd(frames, totalFrames);
    // Should find the end of music somewhere before the silence
    expect(result).toBeLessThan(totalFrames);
    // The detected end should be in the music or fade region
    expect(result).toBeLessThanOrEqual(1000);
  });
});
