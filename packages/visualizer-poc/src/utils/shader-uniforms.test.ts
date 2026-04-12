/**
 * Verification tests for shader-uniforms.ts — ensures the shared uniform
 * creation and sync pipeline is consistent with the GLSL declarations.
 */

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createBaseUniforms, syncBaseUniforms, type UniformSyncData } from "./shader-uniforms";
import { sharedUniformsGLSL } from "../shaders/shared/uniforms.glsl";
import { DEFAULT_LIGHTING } from "./lighting-context";

// ── Expected uniform names (every uniform from createBaseUniforms) ──

const EXPECTED_UNIFORM_NAMES = [
  // Time
  "uTime", "uDynamicTime", "uBeatTime",
  // Core Audio
  "uBass", "uRms", "uCentroid", "uHighs", "uOnset", "uBeat", "uMids",
  "uEnergy", "uFlatness",
  // Smoothed / Derived Audio
  "uSlowEnergy", "uFastEnergy", "uFastBass", "uSpectralFlux",
  "uEnergyAccel", "uEnergyTrend", "uLocalTempo",
  // Beat / Rhythm
  "uTempo", "uOnsetSnap", "uBeatSnap", "uMusicalTime", "uSnapToMusicalTime",
  // Drum Stem
  "uDrumOnset", "uDrumBeat", "uStemBass", "uStemDrums", "uStemDrumOnset",
  // Vocal / Other Stem
  "uVocalEnergy", "uVocalPresence", "uStemVocalRms",
  "uOtherEnergy", "uOtherCentroid",
  // Chroma / Spectral
  "uChromaHue", "uChromaShift", "uAfterglowHue",
  "uContrast0", "uContrast1",
  "uChroma0", "uChroma1", "uChroma2",
  "uFFTTexture",
  // Section / Structure
  "uSectionProgress", "uSectionIndex",
  "uClimaxPhase", "uClimaxIntensity",
  "uCoherence", "uJamDensity",
  "uSongProgress", "uShaderHoldProgress",
  // Jam Evolution
  "uJamPhase", "uJamProgress",
  // Palette / Color
  "uPalettePrimary", "uPaletteSecondary", "uPaletteSaturation",
  "uEraSaturation", "uEraBrightness", "uEraSepia",
  // Post-Process Control
  "uBloomThreshold", "uLensDistortion", "uGradingIntensity",
  // Melodic / Harmonic
  "uMelodicPitch", "uMelodicDirection", "uChordIndex",
  "uHarmonicTension", "uChordConfidence",
  "uSectionType", "uEnergyForecast", "uPeakApproaching",
  "uBeatStability", "uDownbeat", "uBeatConfidence",
  "uMelodicConfidence", "uImprovisationScore",
  // Peak-of-Show
  "uPeakOfShow",
  // Hero Icon
  "uHeroIconTrigger", "uHeroIconProgress",
  // Show Film Stock
  "uShowWarmth", "uShowContrast", "uShowSaturation", "uShowGrain", "uShowBloom",
  // Venue
  "uVenueVignette",
  // 3D Camera
  "uCamPos", "uCamTarget", "uCamFov", "uCamDof", "uCamFocusDist",
  // Envelope
  "uEnvelopeBrightness", "uEnvelopeSaturation", "uEnvelopeHue",
  // Deep Audio (Level 2)
  "uTempoDerivative", "uDynamicRange", "uSpaceScore",
  "uTimbralBrightness", "uTimbralFlux", "uVocalPitch",
  // Effects
  "uPhilBombWave",
  // Semantic Labels (CLAP)
  "uSemanticPsychedelic", "uSemanticCosmic", "uSemanticChaotic",
  "uSemanticAggressive", "uSemanticTender", "uSemanticAmbient",
  "uSemanticRhythmic", "uSemanticTriumphant",
  // Per-Song Shader Parameter Modulation
  "uParamBassScale", "uParamEnergyScale", "uParamMotionSpeed",
  "uParamColorSatBias", "uParamComplexity", "uParamDrumReactivity",
  "uParamVocalWeight",
  // Shared Lighting Context
  "uKeyLightDir", "uKeyLightColor", "uKeyLightIntensity",
  "uAmbientColor", "uColorTemperature",
  // Temporal Coherence
  "uTemporalBlendStrength",
  // Per-Show Visual Identity
  "uShowGrainCharacter", "uShowBloomCharacter",
  "uShowTemperatureCharacter", "uShowContrastCharacter",
  // Spatial
  "uResolution", "uCamOffset",
];

// ── Helper: minimal valid UniformSyncData ──

function makeMinimalSyncData(): UniformSyncData {
  return {
    time: 1.5,
    dynamicTime: 1.2,
    beatDecay: 0.3,
    smooth: {
      rms: 0.4, centroid: 0.5, bass: 0.3, mids: 0.2, highs: 0.15,
      onset: 0.0, energy: 0.5, sectionProgress: 0.25, sectionIndex: 1,
      chromaHue: 0.7, contrast: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
      flatness: 0.3, onsetSnap: 0.0, beatSnap: 0.0, chromaShift: 0.0,
      afterglowHue: 0.0, slowEnergy: 0.4, stemBass: 0.3,
      chroma: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.1, 0.2, 0.3],
      fastEnergy: 0.5, fastBass: 0.3, drumOnset: 0.0, drumBeat: 0.0,
      spectralFlux: 0.1, vocalEnergy: 0.2, vocalPresence: 0.3,
      otherEnergy: 0.1, otherCentroid: 0.4, energyAcceleration: 0.0,
      energyTrend: 0.0, localTempo: 120, melodicPitch: 0.5,
      melodicDirection: 0.0, chordIndex: 0, harmonicTension: 0.3,
      chordConfidence: 0.7, sectionTypeFloat: 2, energyForecast: 0.5,
      peakApproaching: 0.0, beatStability: 0.6, improvisationScore: 0.2,
      downbeat: 0.0, beatConfidence: 0.8, melodicConfidence: 0.6,
      tempoDerivative: 0.0, dynamicRange: 0.5, spaceScore: 0.0,
      timbralBrightness: 0.5, timbralFlux: 0.1, vocalPitch: 0.0,
      semanticPsychedelic: 0.0, semanticAggressive: 0.0,
      semanticTender: 0.0, semanticCosmic: 0.0, semanticRhythmic: 0.0,
      semanticAmbient: 0.0, semanticChaotic: 0.0, semanticTriumphant: 0.0,
      philBombWave: 0.0,
    },
    palettePrimary: 0.3, paletteSecondary: 0.6, paletteSaturation: 1.0,
    tempo: 120, musicalTime: 0.0,
    climaxPhase: 0, climaxIntensity: 0,
    heroTrigger: 0, heroProgress: 0,
    jamDensity: 0.5, jamPhase: -1, jamProgress: 0,
    coherence: 0.5, isLocked: false, peakOfShow: 0,
    songProgress: 0.5, shaderHoldProgress: 0.3,
    eraSaturation: 1.0, eraBrightness: 1.0, eraSepia: 0.0,
    filmStock: { warmth: 0, contrast: 1, saturation: 0, grain: 1, bloom: 1, halation: 0 },
    venueProfile: { warmth: 0, vignette: 0.2, grainMult: 1, bloomMult: 1, contrast: 1, palette: "neutral" },
    shaderWidth: 1920, shaderHeight: 1080,
    sceneConfig: { gradingIntensity: 1.0 },
    envelope: { brightness: 1, saturation: 1, hue: 0 },
    lightingRef: { current: { ...DEFAULT_LIGHTING } },
  };
}

// ── Tests ──

describe("createBaseUniforms", () => {
  it("returns an object with ALL expected uniform names", () => {
    const uniforms = createBaseUniforms();
    const keys = Object.keys(uniforms);

    for (const name of EXPECTED_UNIFORM_NAMES) {
      expect(keys, `missing uniform: ${name}`).toContain(name);
    }
  });

  it("does not have unexpected extra uniforms beyond the expected set", () => {
    const uniforms = createBaseUniforms();
    const keys = Object.keys(uniforms);
    const expectedSet = new Set(EXPECTED_UNIFORM_NAMES);

    for (const key of keys) {
      expect(expectedSet.has(key), `unexpected extra uniform: ${key}`).toBe(true);
    }
  });

  it("has correct uniform count", () => {
    const uniforms = createBaseUniforms();
    expect(Object.keys(uniforms).length).toBe(EXPECTED_UNIFORM_NAMES.length);
  });

  it("has correct default values for shader parameter uniforms", () => {
    const u = createBaseUniforms();
    // Scales default to 1.0
    expect(u.uParamBassScale.value).toBe(1.0);
    expect(u.uParamEnergyScale.value).toBe(1.0);
    expect(u.uParamMotionSpeed.value).toBe(1.0);
    expect(u.uParamDrumReactivity.value).toBe(1.0);
    expect(u.uParamVocalWeight.value).toBe(1.0);
    // Biases default to 0.0
    expect(u.uParamColorSatBias.value).toBe(0.0);
    expect(u.uParamComplexity.value).toBe(0.0);
  });

  it("has correct default values for lighting uniforms", () => {
    const u = createBaseUniforms();
    // Key light direction
    const dir = u.uKeyLightDir.value as THREE.Vector3;
    expect(dir.x).toBeCloseTo(0.3);
    expect(dir.y).toBeCloseTo(0.8);
    expect(dir.z).toBeCloseTo(0.5);
    // Key light color
    const color = u.uKeyLightColor.value as THREE.Vector3;
    expect(color.x).toBeCloseTo(1.0);
    expect(color.y).toBeCloseTo(0.95);
    expect(color.z).toBeCloseTo(0.9);
    // Key light intensity
    expect(u.uKeyLightIntensity.value).toBe(0.7);
    // Ambient color
    const ambient = u.uAmbientColor.value as THREE.Vector3;
    expect(ambient.x).toBeCloseTo(0.08);
    expect(ambient.y).toBeCloseTo(0.07);
    expect(ambient.z).toBeCloseTo(0.09);
    // Color temperature
    expect(u.uColorTemperature.value).toBe(0.0);
  });

  it("has correct default for uTemporalBlendStrength", () => {
    const u = createBaseUniforms();
    expect(u.uTemporalBlendStrength.value).toBe(0.0);
  });

  it("provides a default FFT texture when none is passed", () => {
    const u = createBaseUniforms();
    const tex = u.uFFTTexture.value as THREE.DataTexture;
    expect(tex).toBeInstanceOf(THREE.DataTexture);
    expect(tex.image.width).toBe(64);
  });

  it("accepts an external FFT texture", () => {
    const custom = new THREE.DataTexture(new Uint8Array(128), 128, 1, THREE.RedFormat);
    const u = createBaseUniforms(custom);
    expect(u.uFFTTexture.value).toBe(custom);
  });
});

describe("syncBaseUniforms", () => {
  it("does not throw with valid minimal input", () => {
    const u = createBaseUniforms();
    const data = makeMinimalSyncData();
    expect(() => syncBaseUniforms(u, data)).not.toThrow();
  });

  it("syncs shader parameter uniforms from sceneConfig", () => {
    const u = createBaseUniforms();
    const data = makeMinimalSyncData();
    data.sceneConfig.shaderParams = {
      bassScale: 1.5,
      energyScale: 0.8,
      motionSpeed: 0.6,
      colorSaturationBias: -0.1,
      complexityBias: 0.3,
      drumReactivity: 2.0,
      vocalWeight: 0.5,
    };
    syncBaseUniforms(u, data);
    expect(u.uParamBassScale.value).toBe(1.5);
    expect(u.uParamEnergyScale.value).toBe(0.8);
    expect(u.uParamMotionSpeed.value).toBe(0.6);
    expect(u.uParamColorSatBias.value).toBe(-0.1);
    expect(u.uParamComplexity.value).toBe(0.3);
    expect(u.uParamDrumReactivity.value).toBe(2.0);
    expect(u.uParamVocalWeight.value).toBe(0.5);
  });

  it("falls back to defaults when shaderParams is undefined", () => {
    const u = createBaseUniforms();
    const data = makeMinimalSyncData();
    data.sceneConfig.shaderParams = undefined;
    syncBaseUniforms(u, data);
    expect(u.uParamBassScale.value).toBe(1.0);
    expect(u.uParamEnergyScale.value).toBe(1.0);
    expect(u.uParamMotionSpeed.value).toBe(1.0);
    expect(u.uParamColorSatBias.value).toBe(0.0);
    expect(u.uParamComplexity.value).toBe(0.0);
    expect(u.uParamDrumReactivity.value).toBe(1.0);
    expect(u.uParamVocalWeight.value).toBe(1.0);
  });

  it("updates lighting uniforms via computeLightingState", () => {
    const u = createBaseUniforms();
    const data = makeMinimalSyncData();
    syncBaseUniforms(u, data);
    // Lighting should have been computed (values will differ from defaults
    // because computeLightingState applies section-specific + energy modulation)
    expect(typeof u.uKeyLightIntensity.value).toBe("number");
    expect(typeof u.uColorTemperature.value).toBe("number");
    const dir = u.uKeyLightDir.value as THREE.Vector3;
    expect(dir.length()).toBeGreaterThan(0);
  });

  it("sets uTemporalBlendStrength to 0.0", () => {
    const u = createBaseUniforms();
    const data = makeMinimalSyncData();
    syncBaseUniforms(u, data);
    expect(u.uTemporalBlendStrength.value).toBe(0.0);
  });

  it("computes 3D camera uniforms", () => {
    const u = createBaseUniforms();
    const data = makeMinimalSyncData();
    syncBaseUniforms(u, data);
    const pos = u.uCamPos.value as THREE.Vector3;
    expect(pos).toBeInstanceOf(THREE.Vector3);
    expect(typeof u.uCamFov.value).toBe("number");
    expect(typeof u.uCamDof.value).toBe("number");
  });

  it("syncs deep audio uniforms", () => {
    const u = createBaseUniforms();
    const data = makeMinimalSyncData();
    data.smooth.tempoDerivative = 0.42;
    data.smooth.dynamicRange = 0.7;
    data.smooth.spaceScore = 0.8;
    data.smooth.timbralBrightness = 0.6;
    data.smooth.timbralFlux = 0.15;
    data.smooth.vocalPitch = 0.55;
    syncBaseUniforms(u, data);
    expect(u.uTempoDerivative.value).toBe(0.42);
    expect(u.uDynamicRange.value).toBe(0.7);
    expect(u.uSpaceScore.value).toBe(0.8);
    expect(u.uTimbralBrightness.value).toBe(0.6);
    expect(u.uTimbralFlux.value).toBe(0.15);
    expect(u.uVocalPitch.value).toBe(0.55);
  });

  it("syncs semantic uniforms", () => {
    const u = createBaseUniforms();
    const data = makeMinimalSyncData();
    data.smooth.semanticPsychedelic = 0.8;
    data.smooth.semanticCosmic = 0.6;
    syncBaseUniforms(u, data);
    expect(u.uSemanticPsychedelic.value).toBe(0.8);
    expect(u.uSemanticCosmic.value).toBe(0.6);
  });
});

describe("GLSL ↔ TypeScript uniform parity", () => {
  it("every GLSL uniform declaration has a matching createBaseUniforms key", () => {
    // Parse GLSL source for `uniform <type> <name>;` declarations
    const uniformRegex = /uniform\s+(?:float|vec[234]|mat[234]|sampler2D|int)\s+(\w+)\s*;/g;
    const glslNames = new Set<string>();
    let match;
    while ((match = uniformRegex.exec(sharedUniformsGLSL)) !== null) {
      glslNames.add(match[1]);
    }

    const uniforms = createBaseUniforms();
    const tsNames = new Set(Object.keys(uniforms));

    // Every GLSL name should exist in TS
    for (const name of glslNames) {
      expect(tsNames.has(name), `GLSL declares '${name}' but createBaseUniforms() is missing it`).toBe(true);
    }

    // Every TS name should exist in GLSL
    for (const name of tsNames) {
      expect(glslNames.has(name), `createBaseUniforms() has '${name}' but GLSL is missing declaration`).toBe(true);
    }
  });

  it("GLSL uniform count matches TypeScript uniform count", () => {
    const uniformRegex = /uniform\s+(?:float|vec[234]|mat[234]|sampler2D|int)\s+(\w+)\s*;/g;
    const glslNames = new Set<string>();
    let match;
    while ((match = uniformRegex.exec(sharedUniformsGLSL)) !== null) {
      glslNames.add(match[1]);
    }

    const uniforms = createBaseUniforms();
    expect(Object.keys(uniforms).length).toBe(glslNames.size);
  });

  it("GLSL vector uniform types match TypeScript value types", () => {
    const u = createBaseUniforms();

    // vec2 uniforms should be THREE.Vector2
    expect(u.uResolution.value).toBeInstanceOf(THREE.Vector2);
    expect(u.uCamOffset.value).toBeInstanceOf(THREE.Vector2);

    // vec3 uniforms should be THREE.Vector3
    expect(u.uCamPos.value).toBeInstanceOf(THREE.Vector3);
    expect(u.uCamTarget.value).toBeInstanceOf(THREE.Vector3);
    expect(u.uKeyLightDir.value).toBeInstanceOf(THREE.Vector3);
    expect(u.uKeyLightColor.value).toBeInstanceOf(THREE.Vector3);
    expect(u.uAmbientColor.value).toBeInstanceOf(THREE.Vector3);

    // vec4 uniforms should be THREE.Vector4
    expect(u.uContrast0.value).toBeInstanceOf(THREE.Vector4);
    expect(u.uContrast1.value).toBeInstanceOf(THREE.Vector4);
    expect(u.uChroma0.value).toBeInstanceOf(THREE.Vector4);
    expect(u.uChroma1.value).toBeInstanceOf(THREE.Vector4);
    expect(u.uChroma2.value).toBeInstanceOf(THREE.Vector4);
  });
});
