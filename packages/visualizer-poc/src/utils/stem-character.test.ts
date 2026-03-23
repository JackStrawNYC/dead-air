import { describe, it, expect } from "vitest";
import { computeStemCharacter, type StemCharacter } from "./stem-character";
import type { AudioSnapshot } from "./audio-reactive";

function makeSnapshot(overrides: Partial<AudioSnapshot> = {}): AudioSnapshot {
  return {
    energy: 0.15,
    bass: 0.2,
    mids: 0.2,
    highs: 0.15,
    flatness: 0.1,
    onsetEnvelope: 0.1,
    beatDecay: 0.3,
    chromaHue: 180,
    coherence: 0.5,
    isLocked: false,
    slowEnergy: 0.14,
    fastEnergy: 0.16,
    centroid: 0.4,
    spectralFlux: 0.1,
    vocalPresence: 0.1,
    vocalEnergy: 0.05,
    otherEnergy: 0.2,
    otherCentroid: 0.5,
    drumOnset: 0.15,
    drumBeat: 0.1,
    beatStability: 0.5,
    musicalTime: 0,
    energyAcceleration: 0,
    energyTrend: 0,
    localTempo: 120,
    beatConfidence: 0.5,
    downbeat: false,
    energyForecast: 0.15,
    peakApproaching: 0,
    melodicPitch: 0.5,
    melodicConfidence: 0.3,
    melodicDirection: 0,
    chordIndex: 0,
    harmonicTension: 0.2,
    chordConfidence: 0.5,
    sectionType: "verse",
    tempoDerivative: 0,
    dynamicRange: 0.5,
    spaceScore: 0,
    timbralBrightness: 0.5,
    timbralFlux: 0,
    vocalPitch: 0,
    vocalPitchConfidence: 0,
    semanticPsychedelic: 0,
    semanticAggressive: 0,
    semanticTender: 0,
    semanticCosmic: 0,
    semanticRhythmic: 0,
    semanticAmbient: 0,
    semanticChaotic: 0,
    semanticTriumphant: 0,
    ...overrides,
  };
}

describe("computeStemCharacter", () => {
  it("returns neutral for very low energy", () => {
    const snap = makeSnapshot({ energy: 0.01, bass: 0.01, otherEnergy: 0.01, drumOnset: 0.01, vocalEnergy: 0.01 });
    const result = computeStemCharacter(snap);
    expect(result.dominant).toBe("ensemble");
    expect(result.hueShift).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it("detects Jerry (guitar, high centroid)", () => {
    const snap = makeSnapshot({
      otherEnergy: 0.5, otherCentroid: 0.8,
      bass: 0.1, drumOnset: 0.1, vocalPresence: 0.1, vocalEnergy: 0.05,
    });
    const result = computeStemCharacter(snap);
    expect(result.dominant).toBe("jerry");
    expect(result.hueShift).toBeGreaterThan(0); // golden
    expect(result.temperature).toBeGreaterThan(0.3); // warm
    expect(result.saturationMult).toBeGreaterThan(1); // vivid
  });

  it("detects Phil (bass dominant)", () => {
    const snap = makeSnapshot({
      bass: 0.5, otherEnergy: 0.1, otherCentroid: 0.3,
      drumOnset: 0.1, vocalPresence: 0.05, vocalEnergy: 0.02,
    });
    const result = computeStemCharacter(snap);
    expect(result.dominant).toBe("phil");
    expect(result.hueShift).toBeLessThan(0); // indigo/cool
    expect(result.temperature).toBeLessThan(0); // cool
    expect(result.overlayDensityMult).toBeLessThan(1); // sparse depth
  });

  it("detects drums (tribal pulse)", () => {
    const snap = makeSnapshot({
      drumOnset: 0.5, bass: 0.1, otherEnergy: 0.1, otherCentroid: 0.4,
      vocalPresence: 0.05, vocalEnergy: 0.02,
    });
    const result = computeStemCharacter(snap);
    expect(result.dominant).toBe("drums");
    expect(result.motionMult).toBeGreaterThan(1); // energetic
    expect(result.overlayDensityMult).toBeGreaterThan(1); // dense
  });

  it("detects vocals (warmth mode)", () => {
    const snap = makeSnapshot({
      vocalPresence: 0.8, vocalEnergy: 0.4,
      otherEnergy: 0.15, bass: 0.1, drumOnset: 0.1,
    });
    const result = computeStemCharacter(snap);
    expect(result.dominant).toBe("vocals");
    expect(result.motionMult).toBeLessThan(1); // intimate
    expect(result.temperature).toBeGreaterThan(0); // warm
  });

  it("detects Bobby (guitar, low centroid)", () => {
    const snap = makeSnapshot({
      otherEnergy: 0.5, otherCentroid: 0.3,
      bass: 0.1, drumOnset: 0.1, vocalPresence: 0.1, vocalEnergy: 0.05,
    });
    const result = computeStemCharacter(snap);
    expect(result.dominant).toBe("bobby");
    expect(result.temperature).toBeGreaterThan(0); // warm but grounded
    expect(result.temperature).toBeLessThan(0.5); // not as hot as Jerry
  });
});
