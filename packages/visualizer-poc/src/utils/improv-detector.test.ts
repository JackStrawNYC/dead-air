import { describe, it, expect } from "vitest";
import { estimateImprovisationScore } from "./improv-detector";
import type { EnhancedFrameData } from "../data/types";

/** Helper to build a mock frame with sensible defaults */
function mockFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.3,
    centroid: 0.5,
    onset: 0,
    beat: false,
    sub: 0.2,
    low: 0.3,
    mid: 0.4,
    high: 0.3,
    chroma: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    contrast: [0, 0, 0, 0, 0, 0, 0],
    flatness: 0,
    beatConfidence: 0.5,
    localTempo: 120,
    ...overrides,
  } as EnhancedFrameData;
}

describe("estimateImprovisationScore", () => {
  it("returns 0 when fewer than 10 frames are available", () => {
    const frames = Array.from({ length: 5 }, () => mockFrame());
    expect(estimateImprovisationScore(frames, 2)).toBe(0);
  });

  it("stable music yields a low score near 0", () => {
    // 100 frames: constant tempo, steady chord, high beatConfidence, low tension
    const frames = Array.from({ length: 100 }, () =>
      mockFrame({
        localTempo: 120,
        chordIndex: 0.0, // constant C major
        beatConfidence: 0.9,
        rms: 0.3,
        harmonicTension: 0.1,
      }),
    );
    const score = estimateImprovisationScore(frames, 50);
    expect(score).toBeLessThan(0.2);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("improvisational passage yields a high score > 0.5", () => {
    // 100 frames: variable tempo, changing chords every 3 frames,
    // low beatConfidence, high energy, high tension
    const frames = Array.from({ length: 100 }, (_, i) =>
      mockFrame({
        localTempo: 100 + (i % 5) * 10, // varies 100-140
        chordIndex: Math.floor(i / 3) % 24 / 23, // changes every 3 frames
        beatConfidence: 0.3,
        rms: 0.5,
        harmonicTension: 0.7,
      }),
    );
    const score = estimateImprovisationScore(frames, 50);
    expect(score).toBeGreaterThan(0.5);
  });

  it("score is always in 0-1 range", () => {
    // Extreme improv inputs
    const extremeFrames = Array.from({ length: 100 }, (_, i) =>
      mockFrame({
        localTempo: 60 + Math.random() * 120,
        chordIndex: (i % 24) / 23,
        beatConfidence: 0,
        rms: 1.0,
        harmonicTension: 1.0,
      }),
    );
    const score = estimateImprovisationScore(extremeFrames, 50);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);

    // Extreme stable inputs
    const stableFrames = Array.from({ length: 100 }, () =>
      mockFrame({
        localTempo: 120,
        chordIndex: 0,
        beatConfidence: 1.0,
        rms: 0,
        harmonicTension: 0,
      }),
    );
    const stableScore = estimateImprovisationScore(stableFrames, 50);
    expect(stableScore).toBeGreaterThanOrEqual(0);
    expect(stableScore).toBeLessThanOrEqual(1);
  });

  it("tempo variance contributes to the score", () => {
    // Frames with steady tempo
    const steady = Array.from({ length: 100 }, () =>
      mockFrame({ localTempo: 120, chordIndex: 0, beatConfidence: 0.5, rms: 0.3, harmonicTension: 0.3 }),
    );
    // Frames with wild tempo swings
    const wild = Array.from({ length: 100 }, (_, i) =>
      mockFrame({ localTempo: 80 + (i % 10) * 8, chordIndex: 0, beatConfidence: 0.5, rms: 0.3, harmonicTension: 0.3 }),
    );
    const steadyScore = estimateImprovisationScore(steady, 50);
    const wildScore = estimateImprovisationScore(wild, 50);
    expect(wildScore).toBeGreaterThan(steadyScore);
  });

  // ─── Threshold reachability (regression guard for May 2026 audit) ───
  // Prior calibration (tempo_std/15, changes/4, smooth sigma=1s) made the
  // formula compress: real Dead jams maxed at ~0.5 and never crossed the
  // 0.65 improv_spike trigger or the 0.6 shader-variety bias. These tests
  // pin the formula's reach so a future tweak can't silently revert it.

  it("realistic Dead jam (Bertha-style) crosses the 0.6 shader-variety bias threshold", () => {
    // Tempo wandering 120-128 (8 BPM peak-to-peak — std ~3 BPM),
    // 1.5 chord changes/sec, beatConf ~0.45 (loose), energy ~0.45,
    // tension ~0.55. This is a moderately-jammy mid-set passage.
    const frames = Array.from({ length: 120 }, (_, i) =>
      mockFrame({
        localTempo: 120 + 8 * Math.sin(i * 0.2),  // 4 BPM std
        chordIndex: (Math.floor(i / 20) % 24) / 23, // change every 20 frames = 1.5/sec
        beatConfidence: 0.45,
        rms: 0.45,
        harmonicTension: 0.55,
      }),
    );
    const score = estimateImprovisationScore(frames, 60);
    expect(score, `Dead jam should cross 0.6 (got ${score.toFixed(3)})`).toBeGreaterThan(0.6);
  });

  it("Drums/Space-style passage crosses the 0.65 improv_spike trigger threshold", () => {
    // Tempo drifting 100-130 (std ~10 BPM), 2 chord changes/sec,
    // beatConf ~0.3 (free time), energy ~0.4, tension ~0.7. Drums>Space
    // exploration zone where the trigger should fire.
    const frames = Array.from({ length: 120 }, (_, i) =>
      mockFrame({
        localTempo: 115 + 15 * Math.sin(i * 0.13),
        chordIndex: (Math.floor(i / 15) % 24) / 23, // 2/sec
        beatConfidence: 0.3,
        rms: 0.4,
        harmonicTension: 0.7,
      }),
    );
    const score = estimateImprovisationScore(frames, 60);
    expect(score, `D/S should cross 0.65 (got ${score.toFixed(3)})`).toBeGreaterThan(0.65);
  });

  it("verse-style structured passage stays below 0.4 (no false-positive triggers)", () => {
    // Steady 120 BPM, chord change every ~2 sec (0.5/sec), beatConf 0.85,
    // energy 0.3, low tension. Should never trigger as improv.
    const frames = Array.from({ length: 120 }, (_, i) =>
      mockFrame({
        localTempo: 120 + 0.5 * Math.sin(i * 0.1),
        chordIndex: (Math.floor(i / 60) % 4) / 23,
        beatConfidence: 0.85,
        rms: 0.3,
        harmonicTension: 0.15,
      }),
    );
    const score = estimateImprovisationScore(frames, 60);
    expect(score, `verse must stay below 0.4 (got ${score.toFixed(3)})`).toBeLessThan(0.4);
  });

  it("respects custom windowSize parameter", () => {
    // First 50 frames stable, next 50 frames chaotic
    const frames: EnhancedFrameData[] = [
      ...Array.from({ length: 50 }, () =>
        mockFrame({ localTempo: 120, chordIndex: 0, beatConfidence: 0.9, rms: 0.2, harmonicTension: 0.1 }),
      ),
      ...Array.from({ length: 50 }, (_, i) =>
        mockFrame({ localTempo: 80 + i * 1.2, chordIndex: (i % 24) / 23, beatConfidence: 0.2, rms: 0.6, harmonicTension: 0.8 }),
      ),
    ];
    // Small window in stable section
    const stableZone = estimateImprovisationScore(frames, 25, 30);
    // Small window in chaotic section
    const chaoticZone = estimateImprovisationScore(frames, 75, 30);
    expect(chaoticZone).toBeGreaterThan(stableZone);
  });
});
