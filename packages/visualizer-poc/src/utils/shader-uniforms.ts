/**
 * Shared shader uniform creation and per-frame syncing.
 *
 * All three quad renderers (FullscreenQuad, MultiPassQuad, DualShaderQuad)
 * need the same ~90 base uniforms. This module provides:
 *
 *   createBaseUniforms()  — returns the default uniform object
 *   syncBaseUniforms()    — sets all shared uniform values from a typed data bag
 *
 * Renderer-specific uniforms (uPrevFrame, uSceneA/B, uBlendMode, etc.) are
 * added by each renderer after calling createBaseUniforms().
 */

import * as THREE from "three";
import { compute3DCamera } from "./camera-3d";
import { computeLightingState, type LightingState } from "./lighting-context";
import { DEFAULT_SHADER_PARAMS, type ShaderParameterProfile } from "../config/shader-parameters";
import type { CameraProfile } from "../config/camera-profiles";
import type { FilmStockParams } from "./show-film-stock";
import type { VenueProfile } from "./venue-profiles";
import type { ShowVisualSeed } from "./show-visual-seed";

// ── Era constants (canonical source of truth) ──
//
// May 2026 audit: prior values (sat 0.88-1.10, brightness 0.95-1.01, sepia
// 0.0-0.15) made 1972 and 1977 visually identical to a viewer — era was
// just a hue tint. Widened below so each era reads as a distinct film
// stock; black-lift and contrast-scale are NEW per-era uniforms that the
// postprocess block consumes alongside the existing brightness/sepia
// (real film stocks have lifted blacks and softer S-curves; digital is
// clean and contrasty). Each era now reads:
//
//   primal    1965-1974 — old film, faded poster, lifted warm blacks
//   classic   1976-1979 — peak Wall of Sound, polished, vivid
//   hiatus    1975 — transitional, restrained
//   touch_of_grey 1985-1989 — MTV-era pop, contrasty
//   revival   1990-1995 — clean digital, neutral

export const ERA_SATURATION: Record<string, number> = {
  primal: 0.85,
  classic: 1.10,
  hiatus: 0.92,
  touch_of_grey: 1.18,
  revival: 1.00,
};

export const ERA_BRIGHTNESS: Record<string, number> = {
  primal: 0.93,
  classic: 1.04,
  hiatus: 0.96,
  touch_of_grey: 1.05,
  revival: 1.00,
};

export const ERA_SEPIA: Record<string, number> = {
  primal: 0.18,
  classic: 0.05,
  hiatus: 0.10,
  touch_of_grey: 0.00,
  revival: 0.00,
};

/** Lifted-blacks floor — older film stocks can't hit pure black; 0.06 ≈
 *  warm darkness of 16mm super-8. Digital eras = 0. */
export const ERA_BLACK_LIFT: Record<string, number> = {
  primal: 0.06,
  classic: 0.02,
  hiatus: 0.04,
  touch_of_grey: 0.00,
  revival: 0.00,
};

/** S-curve contrast multiplier — older film has softer rolloff (< 1.0),
 *  modern digital has higher contrast (> 1.0). 1.0 = neutral. */
export const ERA_CONTRAST_SCALE: Record<string, number> = {
  primal: 0.92,
  classic: 1.05,
  hiatus: 0.95,
  touch_of_grey: 1.10,
  revival: 1.00,
};

/** Reverse map: sectionTypeFloat (0-7) back to string for lighting context */
const SECTION_TYPE_NAMES = ["intro", "verse", "chorus", "bridge", "solo", "jam", "outro", "space"];

// ── Smooth audio data shape (matches AudioDataContext.smooth) ──

export interface SmoothAudioData {
  rms: number;
  centroid: number;
  bass: number;
  mids: number;
  highs: number;
  onset: number;
  energy: number;
  sectionProgress: number;
  sectionIndex: number;
  chromaHue: number;
  contrast: number[];
  flatness: number;
  onsetSnap: number;
  beatSnap: number;
  chromaShift: number;
  afterglowHue: number;
  slowEnergy: number;
  stemBass: number;
  chroma: number[];
  fastEnergy: number;
  fastBass: number;
  drumOnset: number;
  drumBeat: number;
  spectralFlux: number;
  vocalEnergy: number;
  vocalPresence: number;
  otherEnergy: number;
  otherCentroid: number;
  energyAcceleration: number;
  energyTrend: number;
  localTempo: number;
  melodicPitch: number;
  melodicDirection: number;
  chordIndex: number;
  harmonicTension: number;
  chordConfidence: number;
  sectionTypeFloat: number;
  energyForecast: number;
  peakApproaching: number;
  beatStability: number;
  improvisationScore: number;
  downbeat: number;
  beatConfidence: number;
  melodicConfidence: number;
  tempoDerivative: number;
  dynamicRange: number;
  spaceScore: number;
  timbralBrightness: number;
  timbralFlux: number;
  vocalPitch: number;
  semanticPsychedelic: number;
  semanticAggressive: number;
  semanticTender: number;
  semanticCosmic: number;
  semanticRhythmic: number;
  semanticAmbient: number;
  semanticChaotic: number;
  semanticTriumphant: number;
  philBombWave: number;
}

/** Everything needed to sync base uniforms each frame */
export interface UniformSyncData {
  time: number;
  dynamicTime: number;
  beatDecay: number;
  smooth: SmoothAudioData;
  palettePrimary: number;
  paletteSecondary: number;
  paletteSaturation: number;
  tempo: number;
  musicalTime: number;
  climaxPhase: number;
  climaxIntensity: number;
  heroTrigger: number;
  heroProgress: number;
  jamDensity: number;
  jamPhase: number;
  jamProgress: number;
  coherence: number;
  isLocked: boolean;
  peakOfShow: number;
  songProgress: number;
  shaderHoldProgress: number;
  eraSaturation: number;
  eraBrightness: number;
  eraSepia: number;
  /** Per-era lifted-blacks floor — film stocks can't hit pure black. */
  eraBlackLift: number;
  /** Per-era S-curve contrast scale — older film softer, digital more contrasty. */
  eraContrastScale: number;
  filmStock: FilmStockParams;
  venueProfile: VenueProfile;
  /** Shader internal resolution width (may differ from output width for downscaling) */
  shaderWidth: number;
  /** Shader internal resolution height */
  shaderHeight: number;
  sceneConfig: {
    gradingIntensity: number;
    cameraProfile?: CameraProfile;
    shaderParams?: ShaderParameterProfile;
  };
  envelope: { brightness: number; saturation: number; hue: number };
  /** Mutable ref to LightingState for EMA smoothing across frames */
  lightingRef: { current: LightingState };
  /** Per-show visual seed (null = no show-level modulation) */
  showVisualSeed?: ShowVisualSeed | null;
}

/**
 * Create the base set of ~90 uniforms shared by all quad renderers.
 *
 * @param fftTexture  Optional FFT DataTexture — FullscreenQuad and MultiPassQuad
 *                    pass their managed texture; DualShaderQuad can pass null to
 *                    get a default 64-bin placeholder.
 */
export function createBaseUniforms(
  fftTexture?: THREE.DataTexture | null,
): Record<string, THREE.IUniform> {
  const defaultFFT = fftTexture ?? (() => {
    const t = new THREE.DataTexture(new Uint8Array(64), 64, 1, THREE.RedFormat);
    t.needsUpdate = true;
    return t;
  })();

  return {
    uTime: { value: 0 },
    uDynamicTime: { value: 0 },
    uBeatTime: { value: 0 },
    uBass: { value: 0 },
    uRms: { value: 0 },
    uCentroid: { value: 0 },
    uHighs: { value: 0 },
    uOnset: { value: 0 },
    uBeat: { value: 0 },
    uMids: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uEnergy: { value: 0 },
    uSectionProgress: { value: 0 },
    uSectionIndex: { value: 0 },
    uChromaHue: { value: 0 },
    uFlatness: { value: 0 },
    uPalettePrimary: { value: 0 },
    uPaletteSecondary: { value: 0 },
    uPaletteSaturation: { value: 1 },
    uTempo: { value: 120 },
    uOnsetSnap: { value: 0 },
    uBeatSnap: { value: 0 },
    uChromaShift: { value: 0 },
    uAfterglowHue: { value: 0 },
    uMusicalTime: { value: 0 },
    uClimaxPhase: { value: 0 },
    uClimaxIntensity: { value: 0 },
    uSlowEnergy: { value: 0 },
    uStemBass: { value: 0 },
    uStemDrums: { value: 0 },
    uStemDrumOnset: { value: 0 },
    uStemVocalRms: { value: 0 },
    uContrast0: { value: new THREE.Vector4(0, 0, 0, 0) },
    uContrast1: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma0: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma1: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma2: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCamOffset: { value: new THREE.Vector2(0, 0) },
    uJamDensity: { value: 0.5 },
    uSongProgress: { value: 0 },
    uShaderHoldProgress: { value: 0 },
    uJamPhase: { value: -1 },
    uJamProgress: { value: 0 },
    uCoherence: { value: 0 },
    uFastEnergy: { value: 0 },
    uFastBass: { value: 0 },
    uDrumOnset: { value: 0 },
    uDrumBeat: { value: 0 },
    uSpectralFlux: { value: 0 },
    uVocalEnergy: { value: 0 },
    uVocalPresence: { value: 0 },
    uOtherEnergy: { value: 0 },
    uOtherCentroid: { value: 0 },
    uSnapToMusicalTime: { value: 0 },
    uEraSaturation: { value: 1.0 },
    uEraBrightness: { value: 1.0 },
    uEraSepia: { value: 0.0 },
    uEraBlackLift: { value: 0.0 },
    uEraContrastScale: { value: 1.0 },
    uBloomThreshold: { value: 0.0 },
    uLensDistortion: { value: 0.0 },
    uGradingIntensity: { value: 1.0 },
    uEnergyAccel: { value: 0 },
    uEnergyTrend: { value: 0 },
    uLocalTempo: { value: 120 },
    uFFTTexture: { value: defaultFFT },
    uMelodicPitch: { value: 0 },
    uMelodicDirection: { value: 0 },
    uChordIndex: { value: 0 },
    uHarmonicTension: { value: 0 },
    uChordConfidence: { value: 0.5 },
    uSectionType: { value: 5 },
    uEnergyForecast: { value: 0 },
    uPeakApproaching: { value: 0 },
    uBeatStability: { value: 0.5 },
    uImprovisationScore: { value: 0 },
    uDownbeat: { value: 0 },
    uBeatConfidence: { value: 0.5 },
    uMelodicConfidence: { value: 0.5 },
    uPeakOfShow: { value: 0 },
    uHeroIconTrigger: { value: 0 },
    uHeroIconProgress: { value: 0 },
    uShowWarmth: { value: 0 },
    uShowContrast: { value: 1 },
    uShowSaturation: { value: 0 },
    uShowGrain: { value: 1 },
    uShowBloom: { value: 1 },
    uVenueVignette: { value: 0.2 },
    uCamPos: { value: new THREE.Vector3(0, 0, -3.5) },
    uCamTarget: { value: new THREE.Vector3(0, 0, 0) },
    uCamFov: { value: 50 },
    uCamDof: { value: 0 },
    uCamFocusDist: { value: 3 },
    uEnvelopeBrightness: { value: 1 },
    uEnvelopeSaturation: { value: 1 },
    uEnvelopeHue: { value: 0 },
    uTempoDerivative: { value: 0 },
    uDynamicRange: { value: 0.5 },
    uSpaceScore: { value: 0 },
    uTimbralBrightness: { value: 0.5 },
    uTimbralFlux: { value: 0 },
    uVocalPitch: { value: 0 },
    uSemanticPsychedelic: { value: 0 },
    uSemanticCosmic: { value: 0 },
    uSemanticChaotic: { value: 0 },
    uSemanticAggressive: { value: 0 },
    uSemanticTender: { value: 0 },
    uSemanticAmbient: { value: 0 },
    uSemanticRhythmic: { value: 0 },
    uSemanticTriumphant: { value: 0 },
    uPhilBombWave: { value: 0 },
    uParamBassScale: { value: 1.0 },
    uParamEnergyScale: { value: 1.0 },
    uParamMotionSpeed: { value: 1.0 },
    uParamColorSatBias: { value: 0.0 },
    uParamComplexity: { value: 0.0 },
    uParamDrumReactivity: { value: 1.0 },
    uParamVocalWeight: { value: 1.0 },
    uKeyLightDir: { value: new THREE.Vector3(0.3, 0.8, 0.5) },
    uKeyLightColor: { value: new THREE.Vector3(1.0, 0.95, 0.9) },
    uKeyLightIntensity: { value: 0.7 },
    uAmbientColor: { value: new THREE.Vector3(0.08, 0.07, 0.09) },
    uColorTemperature: { value: 0.0 },
    uTemporalBlendStrength: { value: 0.0 },
    uShowGrainCharacter: { value: 0.5 },
    uShowBloomCharacter: { value: 0.0 },
    uShowTemperatureCharacter: { value: 0.0 },
    uShowContrastCharacter: { value: 0.5 },
  };
}

/**
 * Sync all base uniform values from the per-frame data bag.
 *
 * This is a pure function with no side-effects beyond mutating the uniform
 * `.value` fields. Camera offset, 3D camera, and lighting are computed inline.
 */
export function syncBaseUniforms(
  u: Record<string, THREE.IUniform>,
  data: UniformSyncData,
): void {
  const {
    time, dynamicTime, beatDecay, smooth,
    palettePrimary, paletteSecondary, paletteSaturation,
    tempo, musicalTime, climaxPhase, climaxIntensity,
    heroTrigger, heroProgress, jamDensity, jamPhase, jamProgress,
    coherence, isLocked, peakOfShow, songProgress, shaderHoldProgress,
    eraSaturation, eraBrightness, eraSepia, eraBlackLift, eraContrastScale,
    filmStock, venueProfile,
    shaderWidth, shaderHeight,
    sceneConfig, envelope, lightingRef,
  } = data;

  u.uTime.value = time;
  u.uDynamicTime.value = dynamicTime;
  // Beat-locked time: scales wall-clock time by tempo/120 so animation
  // oscillators run faster on faster songs without needing to track beat phase.
  u.uBeatTime.value = time * ((tempo ?? 120) / 120);
  u.uBass.value = smooth.bass;
  u.uRms.value = smooth.rms;
  u.uCentroid.value = smooth.centroid;
  u.uHighs.value = smooth.highs;
  u.uOnset.value = smooth.onset;
  u.uBeat.value = beatDecay;
  u.uMids.value = smooth.mids;
  (u.uResolution.value as THREE.Vector2).set(shaderWidth, shaderHeight);
  u.uEnergy.value = smooth.energy;
  u.uSectionProgress.value = smooth.sectionProgress;
  u.uSectionIndex.value = smooth.sectionIndex;
  u.uChromaHue.value = smooth.chromaHue;
  u.uFlatness.value = smooth.flatness;
  u.uPalettePrimary.value = palettePrimary;
  u.uPaletteSecondary.value = paletteSecondary;
  u.uPaletteSaturation.value = paletteSaturation;
  u.uTempo.value = tempo;
  u.uOnsetSnap.value = smooth.onsetSnap;
  u.uBeatSnap.value = smooth.beatSnap;
  u.uChromaShift.value = smooth.chromaShift;
  u.uAfterglowHue.value = smooth.afterglowHue;
  u.uMusicalTime.value = musicalTime;
  u.uClimaxPhase.value = climaxPhase;
  u.uClimaxIntensity.value = climaxIntensity;
  u.uJamDensity.value = jamDensity;
  u.uJamPhase.value = jamPhase;
  u.uJamProgress.value = jamProgress;
  // When coherence is locked (IT moment), boost the coherence uniform
  // above 1.0 to signal transcendent state. Shaders interpret uCoherence > 1.0
  // as "amplified evolution" — deeper colors, more intricate geometry, maximum
  // pattern stability. The visual world deepens instead of freezing.
  u.uCoherence.value = isLocked ? Math.min(2.0, coherence * 1.5 + 0.5) : coherence;
  u.uSongProgress.value = songProgress ?? 0;
  u.uShaderHoldProgress.value = shaderHoldProgress ?? 0;
  u.uSlowEnergy.value = smooth.slowEnergy;
  u.uStemBass.value = smooth.stemBass;
  u.uStemDrums.value = smooth.drumOnset; // drums energy = drum onset
  u.uStemDrumOnset.value = smooth.drumOnset;
  u.uStemVocalRms.value = smooth.vocalEnergy;
  u.uFastEnergy.value = smooth.fastEnergy;
  u.uFastBass.value = smooth.fastBass;
  u.uDrumOnset.value = smooth.drumOnset;
  u.uDrumBeat.value = smooth.drumBeat;
  u.uSpectralFlux.value = smooth.spectralFlux;
  u.uVocalEnergy.value = smooth.vocalEnergy;
  u.uVocalPresence.value = smooth.vocalPresence;
  u.uOtherEnergy.value = smooth.otherEnergy;
  u.uOtherCentroid.value = smooth.otherCentroid;
  u.uSnapToMusicalTime.value = isLocked ? 1.0 : 0.0;
  u.uEraSaturation.value = eraSaturation;
  u.uEraBrightness.value = eraBrightness;
  u.uEraSepia.value = eraSepia;
  u.uEraBlackLift.value = eraBlackLift;
  u.uEraContrastScale.value = eraContrastScale;
  u.uBloomThreshold.value = -0.08 - smooth.energy * 0.18;
  u.uLensDistortion.value = 0.02 + smooth.energy * 0.06;
  u.uGradingIntensity.value = sceneConfig.gradingIntensity;
  u.uEnergyAccel.value = smooth.energyAcceleration;
  u.uEnergyTrend.value = smooth.energyTrend;
  u.uLocalTempo.value = smooth.localTempo;
  u.uMelodicPitch.value = smooth.melodicPitch;
  u.uMelodicDirection.value = smooth.melodicDirection;
  u.uChordIndex.value = smooth.chordIndex;
  u.uHarmonicTension.value = smooth.harmonicTension;
  u.uChordConfidence.value = smooth.chordConfidence;
  u.uSectionType.value = smooth.sectionTypeFloat;
  u.uEnergyForecast.value = smooth.energyForecast;
  u.uPeakApproaching.value = smooth.peakApproaching;
  u.uBeatStability.value = smooth.beatStability;
  u.uImprovisationScore.value = smooth.improvisationScore ?? 0;
  u.uDownbeat.value = smooth.downbeat;
  u.uBeatConfidence.value = smooth.beatConfidence;
  u.uMelodicConfidence.value = smooth.melodicConfidence ?? 0.5;
  u.uPeakOfShow.value = peakOfShow;
  u.uHeroIconTrigger.value = heroTrigger;
  u.uHeroIconProgress.value = heroProgress;
  u.uShowWarmth.value = filmStock.warmth + venueProfile.warmth;
  u.uShowContrast.value = filmStock.contrast;
  u.uShowSaturation.value = filmStock.saturation;
  u.uShowGrain.value = filmStock.grain * venueProfile.grainMult;
  u.uShowBloom.value = filmStock.bloom * venueProfile.bloomMult;
  u.uVenueVignette.value = venueProfile.vignette;
  u.uEnvelopeBrightness.value = envelope.brightness;
  u.uEnvelopeSaturation.value = envelope.saturation;
  u.uEnvelopeHue.value = envelope.hue;
  u.uTempoDerivative.value = smooth.tempoDerivative ?? 0;
  u.uDynamicRange.value = smooth.dynamicRange ?? 0.5;
  u.uSpaceScore.value = smooth.spaceScore ?? 0;
  u.uTimbralBrightness.value = smooth.timbralBrightness ?? 0.5;
  u.uTimbralFlux.value = smooth.timbralFlux ?? 0;
  u.uVocalPitch.value = smooth.vocalPitch ?? 0;
  u.uSemanticPsychedelic.value = smooth.semanticPsychedelic ?? 0;
  u.uSemanticCosmic.value = smooth.semanticCosmic ?? 0;
  u.uSemanticChaotic.value = smooth.semanticChaotic ?? 0;
  u.uSemanticAggressive.value = smooth.semanticAggressive ?? 0;
  u.uSemanticTender.value = smooth.semanticTender ?? 0;
  u.uSemanticAmbient.value = smooth.semanticAmbient ?? 0;
  u.uSemanticRhythmic.value = smooth.semanticRhythmic ?? 0;
  u.uSemanticTriumphant.value = smooth.semanticTriumphant ?? 0;
  u.uPhilBombWave.value = smooth.philBombWave ?? 0;

  // Per-song shader parameter modulation (from SceneConfig)
  const sp = sceneConfig.shaderParams ?? DEFAULT_SHADER_PARAMS;
  u.uParamBassScale.value = sp.bassScale ?? 1.0;
  u.uParamEnergyScale.value = sp.energyScale ?? 1.0;
  u.uParamMotionSpeed.value = sp.motionSpeed ?? 1.0;
  u.uParamColorSatBias.value = sp.colorSaturationBias ?? 0.0;
  u.uParamComplexity.value = sp.complexityBias ?? 0.0;
  u.uParamDrumReactivity.value = sp.drumReactivity ?? 1.0;
  u.uParamVocalWeight.value = sp.vocalWeight ?? 1.0;

  // Shared lighting context (EMA-smoothed, section + energy + temperature driven)
  {
    const sectionName = SECTION_TYPE_NAMES[Math.round(smooth.sectionTypeFloat)] ?? "jam";
    const lighting = computeLightingState(lightingRef.current, {
      sectionType: sectionName,
      energy: smooth.energy,
      temperature: 0, // narrative temperature applied externally when available
    });
    lightingRef.current = lighting;
    (u.uKeyLightDir.value as THREE.Vector3).set(lighting.keyLightDir[0], lighting.keyLightDir[1], lighting.keyLightDir[2]);
    (u.uKeyLightColor.value as THREE.Vector3).set(lighting.keyLightColor[0], lighting.keyLightColor[1], lighting.keyLightColor[2]);
    u.uKeyLightIntensity.value = lighting.keyLightIntensity;
    (u.uAmbientColor.value as THREE.Vector3).set(lighting.ambientColor[0], lighting.ambientColor[1], lighting.ambientColor[2]);
    u.uColorTemperature.value = lighting.colorTemperature;
  }

  // Temporal blend — disabled by default (0.0), set by render pipeline when active
  u.uTemporalBlendStrength.value = 0.0;

  // Per-show visual identity (from ShowVisualSeed)
  {
    const svs = data.showVisualSeed;
    u.uShowGrainCharacter.value = svs?.grainPreference ?? 0.5;
    u.uShowBloomCharacter.value = svs?.bloomBias ?? 0.0;
    u.uShowTemperatureCharacter.value = svs?.paletteTemperature ?? 0.0;
    u.uShowContrastCharacter.value = svs?.contrastCharacter ?? 0.5;
  }

  // 3D Camera (uses profile from SceneConfig context)
  const cam3d = compute3DCamera(
    time, dynamicTime, smooth.energy, smooth.bass,
    smooth.fastEnergy, smooth.vocalPresence, smooth.drumOnset,
    smooth.sectionProgress, smooth.sectionIndex,
    climaxPhase, climaxIntensity,
    smooth.beatStability, smooth.beatSnap,
    sceneConfig.cameraProfile ?? undefined,
  );
  (u.uCamPos.value as THREE.Vector3).set(cam3d.position[0], cam3d.position[1], cam3d.position[2]);
  (u.uCamTarget.value as THREE.Vector3).set(cam3d.target[0], cam3d.target[1], cam3d.target[2]);
  u.uCamFov.value = cam3d.fov;
  u.uCamDof.value = cam3d.dofStrength;
  u.uCamFocusDist.value = cam3d.focusDistance;

  // Contrast + chroma vec4s
  const c = smooth.contrast;
  (u.uContrast0.value as THREE.Vector4).set(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0);
  (u.uContrast1.value as THREE.Vector4).set(c[4] ?? 0, c[5] ?? 0, c[6] ?? 0, 0);

  const ch = smooth.chroma;
  (u.uChroma0.value as THREE.Vector4).set(ch[0] ?? 0, ch[1] ?? 0, ch[2] ?? 0, ch[3] ?? 0);
  (u.uChroma1.value as THREE.Vector4).set(ch[4] ?? 0, ch[5] ?? 0, ch[6] ?? 0, ch[7] ?? 0);
  (u.uChroma2.value as THREE.Vector4).set(ch[8] ?? 0, ch[9] ?? 0, ch[10] ?? 0, ch[11] ?? 0);

  // Camera offset: approximate CameraMotion's drift for parallax
  const bassAmp = smooth.bass * 12.0;
  const camOffX = Math.sin(time * 3.7) * bassAmp * 0.5 + Math.sin(dynamicTime * 0.03 * Math.PI * 2) * 4;
  const camOffY = Math.cos(time * 2.3) * bassAmp * 0.3 + Math.cos(dynamicTime * 0.03 * Math.PI * 2 * 0.7 + 1.3) * 2.4;
  (u.uCamOffset.value as THREE.Vector2).set(camOffX, camOffY);
}
