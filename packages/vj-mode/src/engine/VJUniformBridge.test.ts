import { describe, it, expect } from "vitest";
import { createVJUniforms, mapToUniforms } from "./VJUniformBridge";
import type { SmoothedAudioState } from "../audio/types";

function makeState(overrides: Partial<SmoothedAudioState> = {}): SmoothedAudioState {
  return {
    rms: 0, bass: 0, mids: 0, highs: 0, centroid: 0,
    energy: 0, slowEnergy: 0, fastEnergy: 0, fastBass: 0,
    onset: 0, onsetSnap: 0, beatSnap: 0, beatDecay: 0,
    drumOnset: 0, drumBeat: 0, spectralFlux: 0,
    chromaHue: 0, chromaShift: 0, afterglowHue: 0,
    flatness: 0,
    chroma: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    contrast: [0, 0, 0, 0, 0, 0, 0],
    sectionProgress: 0, sectionIndex: 0,
    stemBass: 0, vocalEnergy: 0, vocalPresence: 0, otherEnergy: 0, otherCentroid: 0,
    musicalTime: 0, tempo: 120, isBeat: false,
    climaxPhase: 0, climaxIntensity: 0,
    time: 0, dynamicTime: 0,
    palettePrimary: 0.5, paletteSecondary: 0.7, paletteSaturation: 1,
    chordIndex: 0, chordConfidence: 0, harmonicTension: 0,
    beatStability: 0, beatConfidence: 0,
    sectionType: "verse",
    jamDensity: 0.5, isLongJam: false, coherence: 0, isLocked: false,
    ...overrides,
  };
}

describe("VJUniformBridge", () => {
  it("creates all expected uniforms", () => {
    const u = createVJUniforms(1920, 1080);

    expect(u.uTime).toBeDefined();
    expect(u.uTime.value).toBe(0);
    expect(u.uResolution.value.x).toBe(1920);
    expect(u.uResolution.value.y).toBe(1080);
    expect(u.uBass).toBeDefined();
    expect(u.uRms).toBeDefined();
    expect(u.uVocalEnergy).toBeDefined();
    expect(u.uContrast0).toBeDefined();
    expect(u.uChroma0).toBeDefined();
    expect(u.uCamOffset).toBeDefined();
  });

  it("maps all state values to uniforms", () => {
    const u = createVJUniforms(1920, 1080);
    const state = makeState({
      rms: 0.42,
      bass: 0.7,
      mids: 0.3,
      highs: 0.1,
      time: 10.5,
      dynamicTime: 8.2,
      palettePrimary: 0.6,
      tempo: 130,
      energy: 0.5,
    });

    mapToUniforms(state, u);

    expect(u.uRms.value).toBe(0.42);
    expect(u.uBass.value).toBe(0.7);
    expect(u.uMids.value).toBe(0.3);
    expect(u.uHighs.value).toBe(0.1);
    expect(u.uTime.value).toBe(10.5);
    expect(u.uDynamicTime.value).toBe(8.2);
    expect(u.uPalettePrimary.value).toBe(0.6);
    expect(u.uTempo.value).toBe(130);
    expect(u.uEnergy.value).toBe(0.5);
  });

  it("maps contrast and chroma arrays to vec4 uniforms", () => {
    const u = createVJUniforms(1920, 1080);
    const state = makeState({
      contrast: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
      chroma: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.85, 0.75],
    });

    mapToUniforms(state, u);

    expect(u.uContrast0.value.x).toBe(0.1);
    expect(u.uContrast0.value.y).toBe(0.2);
    expect(u.uContrast0.value.z).toBe(0.3);
    expect(u.uContrast0.value.w).toBe(0.4);
    expect(u.uContrast1.value.x).toBe(0.5);
    expect(u.uContrast1.value.y).toBe(0.6);
    expect(u.uContrast1.value.z).toBe(0.7);

    expect(u.uChroma0.value.x).toBe(0.1);
    expect(u.uChroma1.value.w).toBe(0.8);
    expect(u.uChroma2.value.z).toBe(0.85);
  });

  it("computes camera offset from bass and time", () => {
    const u = createVJUniforms(1920, 1080);
    const state = makeState({ bass: 0.8, time: 5.0, dynamicTime: 4.0 });

    mapToUniforms(state, u);

    // Camera offset should be non-zero with bass present
    const camX = u.uCamOffset.value.x;
    const camY = u.uCamOffset.value.y;
    expect(Math.abs(camX) + Math.abs(camY)).toBeGreaterThan(0);
  });

  it("maps isLocked to snapToMusicalTime", () => {
    const u = createVJUniforms(1920, 1080);

    mapToUniforms(makeState({ isLocked: false }), u);
    expect(u.uSnapToMusicalTime.value).toBe(0);

    mapToUniforms(makeState({ isLocked: true }), u);
    expect(u.uSnapToMusicalTime.value).toBe(1);
  });
});
