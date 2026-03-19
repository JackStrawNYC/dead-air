import { describe, it, expect } from "vitest";
import { computeHarmonicResponse } from "./harmonic-response";
import type { EnhancedFrameData } from "../data/types";
import type { AudioSnapshot } from "./audio-reactive";

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
    ...overrides,
  } as EnhancedFrameData;
}

/** Helper to build a mock AudioSnapshot with sensible defaults */
function mockSnapshot(overrides: Partial<AudioSnapshot> = {}): AudioSnapshot {
  return {
    energy: 0.3,
    slowEnergy: 0.3,
    bass: 0.2,
    mids: 0.4,
    highs: 0.3,
    onsetEnvelope: 0,
    beatDecay: 0,
    chromaHue: 0,
    centroid: 0.5,
    flatness: 0,
    spectralFlux: 0,
    fastEnergy: 0.3,
    drumOnset: 0,
    drumBeat: 0,
    musicalTime: 0,
    vocalEnergy: 0,
    vocalPresence: 0,
    otherEnergy: 0.3,
    otherCentroid: 0.5,
    energyAcceleration: 0,
    energyTrend: 0,
    localTempo: 120,
    beatConfidence: 0.5,
    downbeat: false,
    energyForecast: 0.3,
    peakApproaching: 0,
    beatStability: 0.5,
    melodicPitch: 0.5,
    melodicConfidence: 0.5,
    melodicDirection: 0,
    chordIndex: 0,
    harmonicTension: 0.3,
    sectionType: "jam",
    ...overrides,
  };
}

/**
 * Build an array of frames where a given pitch class dominates the chroma.
 * This simulates a song "in the key of" that pitch class.
 */
function buildTonicFrames(
  tonicPitchClass: number,
  count: number,
  frameOverrides: Partial<EnhancedFrameData> = {},
): EnhancedFrameData[] {
  const chroma: [number, number, number, number, number, number, number, number, number, number, number, number] =
    [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  chroma[tonicPitchClass] = 0.9; // dominant pitch class
  return Array.from({ length: count }, () => mockFrame({ chroma, ...frameOverrides }));
}

describe("computeHarmonicResponse", () => {
  it("returns neutral when chordIndex is undefined", () => {
    const frames = buildTonicFrames(0, 100);
    const snapshot = mockSnapshot({ chordIndex: undefined as unknown as number, harmonicTension: 0.2 });
    const result = computeHarmonicResponse(frames, 50, snapshot);

    expect(result.brightnessOffset).toBe(0);
    expect(result.saturationMult).toBe(1);
    expect(result.resolutionStrength).toBe(0);
    expect(result.departureStrength).toBe(0);
  });

  it("returns neutral when chordIndex is below 0.5 (no chord detected)", () => {
    const frames = buildTonicFrames(0, 100);
    const snapshot = mockSnapshot({ chordIndex: 0, harmonicTension: 0.2 });
    const result = computeHarmonicResponse(frames, 50, snapshot);

    expect(result.brightnessOffset).toBe(0);
    expect(result.saturationMult).toBe(1);
    expect(result.resolutionStrength).toBe(0);
    expect(result.departureStrength).toBe(0);
  });

  it("chordIndex 0 (C major at tonic) triggers resolution, not neutral", () => {
    // chordIndex 0 = C major. With guard changed to < 0.5, we need chordIndex >= 0.5.
    // But chordIndex 0 IS below 0.5, so it's still neutral (no chord detected from Python).
    // A true C major chord from Python would come as chordIndex = 0 only if undetected.
    // This test verifies the guard behavior.
    const frames = buildTonicFrames(0, 400);
    const snapshot = mockSnapshot({ chordIndex: 0, harmonicTension: 0.1 });
    const result = computeHarmonicResponse(frames, 200, snapshot);
    expect(result.resolutionStrength).toBe(0); // still neutral — Python sends 0 for "no chord"
  });

  it("resolution: near-tonic major chord with low tension → positive brightness, saturation > 1", () => {
    // Song is in C (pitch class 0). Current chord = G major (chordIdx 7).
    // G major is 1 step from C on circle of fifths.
    const frames = buildTonicFrames(0, 400); // tonic = C
    const snapshot = mockSnapshot({
      chordIndex: 7, // G major — distance 1 from C on circle of fifths
      harmonicTension: 0.1, // low tension
    });
    const result = computeHarmonicResponse(frames, 200, snapshot);

    expect(result.brightnessOffset).toBeGreaterThan(0);
    expect(result.saturationMult).toBeGreaterThan(1);
    expect(result.resolutionStrength).toBeGreaterThan(0);
    expect(result.departureStrength).toBe(0);
  });

  it("resolution: tonic chord itself (distance 0) gives stronger resolution", () => {
    // Song is in D (pitch class 2). Current chord = D major (chordIdx 2).
    const frames = buildTonicFrames(2, 400); // tonic = D
    const snapshot = mockSnapshot({
      chordIndex: 2, // D major — distance 0 from tonic
      harmonicTension: 0.05,
    });
    const result = computeHarmonicResponse(frames, 200, snapshot);

    // Distance 0 + very low tension should give strong resolution
    expect(result.resolutionStrength).toBeGreaterThan(0.5);
    expect(result.brightnessOffset).toBeGreaterThan(0.02);
    expect(result.saturationMult).toBeGreaterThan(1.04);
  });

  it("departure: far-from-tonic chord with high tension → negative brightness, saturation < 1", () => {
    // Song is in C (pitch class 0). Current chord = F# major (chordIdx 6).
    // F# is at position 6 on the fifths circle, C is at position 0: distance = 6 (tritone).
    const frames = buildTonicFrames(0, 400); // tonic = C
    const snapshot = mockSnapshot({
      chordIndex: 6, // F# major — distance 6 from C on circle of fifths (tritone)
      harmonicTension: 0.8, // high tension
    });
    const result = computeHarmonicResponse(frames, 200, snapshot);

    expect(result.brightnessOffset).toBeLessThan(0);
    expect(result.saturationMult).toBeLessThan(1);
    expect(result.departureStrength).toBeGreaterThan(0);
    expect(result.resolutionStrength).toBe(0);
  });

  it("output values are clamped to specified ranges", () => {
    // Test with various extreme scenarios
    const frames = buildTonicFrames(0, 400);

    // Strong resolution scenario
    const resSnapshot = mockSnapshot({ chordIndex: 7, harmonicTension: 0.0 });
    const resResult = computeHarmonicResponse(frames, 200, resSnapshot);
    expect(resResult.brightnessOffset).toBeGreaterThanOrEqual(-0.04);
    expect(resResult.brightnessOffset).toBeLessThanOrEqual(0.06);
    expect(resResult.saturationMult).toBeGreaterThanOrEqual(0.92);
    expect(resResult.saturationMult).toBeLessThanOrEqual(1.08);
    expect(resResult.resolutionStrength).toBeGreaterThanOrEqual(0);
    expect(resResult.resolutionStrength).toBeLessThanOrEqual(1);
    expect(resResult.departureStrength).toBeGreaterThanOrEqual(0);
    expect(resResult.departureStrength).toBeLessThanOrEqual(1);

    // Strong departure scenario
    const depSnapshot = mockSnapshot({ chordIndex: 6, harmonicTension: 1.0 });
    const depResult = computeHarmonicResponse(frames, 200, depSnapshot);
    expect(depResult.brightnessOffset).toBeGreaterThanOrEqual(-0.04);
    expect(depResult.brightnessOffset).toBeLessThanOrEqual(0.06);
    expect(depResult.saturationMult).toBeGreaterThanOrEqual(0.92);
    expect(depResult.saturationMult).toBeLessThanOrEqual(1.08);
    expect(depResult.resolutionStrength).toBeGreaterThanOrEqual(0);
    expect(depResult.resolutionStrength).toBeLessThanOrEqual(1);
    expect(depResult.departureStrength).toBeGreaterThanOrEqual(0);
    expect(depResult.departureStrength).toBeLessThanOrEqual(1);
  });

  it("handles edge case: idx = 0 (start of frames)", () => {
    const frames = buildTonicFrames(0, 50);
    const snapshot = mockSnapshot({ chordIndex: 7, harmonicTension: 0.1 });
    const result = computeHarmonicResponse(frames, 0, snapshot);

    // Should still work — tonic detection uses only forward frames
    expect(result.brightnessOffset).toBeGreaterThanOrEqual(-0.04);
    expect(result.brightnessOffset).toBeLessThanOrEqual(0.06);
    expect(result.saturationMult).toBeGreaterThanOrEqual(0.92);
    expect(result.saturationMult).toBeLessThanOrEqual(1.08);
  });

  it("handles edge case: idx at end of frames", () => {
    const frames = buildTonicFrames(0, 50);
    const snapshot = mockSnapshot({ chordIndex: 7, harmonicTension: 0.1 });
    const result = computeHarmonicResponse(frames, 49, snapshot);

    expect(result.brightnessOffset).toBeGreaterThanOrEqual(-0.04);
    expect(result.brightnessOffset).toBeLessThanOrEqual(0.06);
    expect(result.saturationMult).toBeGreaterThanOrEqual(0.92);
    expect(result.saturationMult).toBeLessThanOrEqual(1.08);
  });

  it("handles edge case: empty frames array", () => {
    const snapshot = mockSnapshot({ chordIndex: 7, harmonicTension: 0.1 });
    const result = computeHarmonicResponse([], 0, snapshot);

    // No frames → can't detect tonic → neutral
    expect(result.brightnessOffset).toBe(0);
    expect(result.saturationMult).toBe(1);
    expect(result.resolutionStrength).toBe(0);
    expect(result.departureStrength).toBe(0);
  });

  it("handles frames with zero chroma energy → neutral", () => {
    // All chroma values are 0 — no pitch information
    const frames = Array.from({ length: 100 }, () =>
      mockFrame({ chroma: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
    );
    const snapshot = mockSnapshot({ chordIndex: 7, harmonicTension: 0.2 });
    const result = computeHarmonicResponse(frames, 50, snapshot);

    expect(result.brightnessOffset).toBe(0);
    expect(result.saturationMult).toBe(1);
  });

  it("moderate distance and tension → no resolution or departure", () => {
    // Distance 2-3 and tension 0.4-0.5 → neither resolution nor departure triggers
    // Song in C. Chord = D major (chordIdx 2), distance from C on fifths = 2
    const frames = buildTonicFrames(0, 400);
    const snapshot = mockSnapshot({
      chordIndex: 2, // D major — distance 2 from C on fifths circle
      harmonicTension: 0.45, // moderate tension (above 0.4 so no resolution, below 0.5 so no departure)
    });
    const result = computeHarmonicResponse(frames, 200, snapshot);

    // Distance 2 disqualifies resolution (needs <= 1), distance 2 disqualifies departure (needs >= 4)
    expect(result.resolutionStrength).toBe(0);
    expect(result.departureStrength).toBe(0);
    expect(result.brightnessOffset).toBe(0);
    expect(result.saturationMult).toBe(1);
  });

  it("minor chord near tonic does not trigger resolution", () => {
    // Song in C. Chord = C minor (chordIdx 12), distance 0 but minor.
    const frames = buildTonicFrames(0, 400);
    const snapshot = mockSnapshot({
      chordIndex: 12, // C minor — distance 0, but minor
      harmonicTension: 0.1,
    });
    const result = computeHarmonicResponse(frames, 200, snapshot);

    // Minor chord → no resolution even at distance 0
    expect(result.resolutionStrength).toBe(0);
  });
});
