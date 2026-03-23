/**
 * VJUniformBridge — maps SmoothedAudioState to Three.js shader uniforms.
 * Exactly replicates the uniform update pattern from FullscreenQuad.tsx.
 */

import * as THREE from "three";
import type { SmoothedAudioState } from "../audio/types";
import { useVJStore, type GrainStrength } from "../state/VJStore";

export interface VJUniforms {
  uTime: THREE.IUniform<number>;
  uDynamicTime: THREE.IUniform<number>;
  uBass: THREE.IUniform<number>;
  uRms: THREE.IUniform<number>;
  uCentroid: THREE.IUniform<number>;
  uHighs: THREE.IUniform<number>;
  uOnset: THREE.IUniform<number>;
  uBeat: THREE.IUniform<number>;
  uMids: THREE.IUniform<number>;
  uResolution: THREE.IUniform<THREE.Vector2>;
  uEnergy: THREE.IUniform<number>;
  uSectionProgress: THREE.IUniform<number>;
  uSectionIndex: THREE.IUniform<number>;
  uChromaHue: THREE.IUniform<number>;
  uFlatness: THREE.IUniform<number>;
  uPalettePrimary: THREE.IUniform<number>;
  uPaletteSecondary: THREE.IUniform<number>;
  uPaletteSaturation: THREE.IUniform<number>;
  uTempo: THREE.IUniform<number>;
  uOnsetSnap: THREE.IUniform<number>;
  uBeatSnap: THREE.IUniform<number>;
  uChromaShift: THREE.IUniform<number>;
  uAfterglowHue: THREE.IUniform<number>;
  uMusicalTime: THREE.IUniform<number>;
  uClimaxPhase: THREE.IUniform<number>;
  uClimaxIntensity: THREE.IUniform<number>;
  uSlowEnergy: THREE.IUniform<number>;
  uStemBass: THREE.IUniform<number>;
  uContrast0: THREE.IUniform<THREE.Vector4>;
  uContrast1: THREE.IUniform<THREE.Vector4>;
  uChroma0: THREE.IUniform<THREE.Vector4>;
  uChroma1: THREE.IUniform<THREE.Vector4>;
  uChroma2: THREE.IUniform<THREE.Vector4>;
  uCamOffset: THREE.IUniform<THREE.Vector2>;
  uJamDensity: THREE.IUniform<number>;
  uCoherence: THREE.IUniform<number>;
  uFastEnergy: THREE.IUniform<number>;
  uFastBass: THREE.IUniform<number>;
  uDrumOnset: THREE.IUniform<number>;
  uDrumBeat: THREE.IUniform<number>;
  uSpectralFlux: THREE.IUniform<number>;
  uVocalEnergy: THREE.IUniform<number>;
  uVocalPresence: THREE.IUniform<number>;
  uOtherEnergy: THREE.IUniform<number>;
  uOtherCentroid: THREE.IUniform<number>;
  uSnapToMusicalTime: THREE.IUniform<number>;
  // Melodic/harmonic
  uMelodicPitch: THREE.IUniform<number>;
  uMelodicDirection: THREE.IUniform<number>;
  uMelodicConfidence: THREE.IUniform<number>;
  uChordIndex: THREE.IUniform<number>;
  uChordConfidence: THREE.IUniform<number>;
  uHarmonicTension: THREE.IUniform<number>;
  // Section/structure
  uSectionType: THREE.IUniform<number>;
  uEnergyForecast: THREE.IUniform<number>;
  uPeakApproaching: THREE.IUniform<number>;
  uBeatStability: THREE.IUniform<number>;
  uBeatConfidence: THREE.IUniform<number>;
  uDownbeat: THREE.IUniform<number>;
  uImprovisationScore: THREE.IUniform<number>;
  uJamPhase: THREE.IUniform<number>;
  // Deep audio
  uTempoDerivative: THREE.IUniform<number>;
  uDynamicRange: THREE.IUniform<number>;
  uSpaceScore: THREE.IUniform<number>;
  uTimbralBrightness: THREE.IUniform<number>;
  uTimbralFlux: THREE.IUniform<number>;
  uVocalPitch: THREE.IUniform<number>;
  // Energy acceleration
  uEnergyAccel: THREE.IUniform<number>;
  // Envelope (from CSS-level grading)
  uEnvelopeBrightness: THREE.IUniform<number>;
  uEnvelopeSaturation: THREE.IUniform<number>;
  uEnvelopeHue: THREE.IUniform<number>;
  // Era/show
  uEraSaturation: THREE.IUniform<number>;
  uEraBrightness: THREE.IUniform<number>;
  uEraSepia: THREE.IUniform<number>;
  uShowWarmth: THREE.IUniform<number>;
  uShowContrast: THREE.IUniform<number>;
  uShowSaturation: THREE.IUniform<number>;
  uShowGrain: THREE.IUniform<number>;
  uShowBloom: THREE.IUniform<number>;
  uVenueVignette: THREE.IUniform<number>;
  // Post-process
  uBloomThreshold: THREE.IUniform<number>;
  uLensDistortion: THREE.IUniform<number>;
  uGradingIntensity: THREE.IUniform<number>;
  // FX uniforms
  uFxBloom: THREE.IUniform<number>;
  uFxGrain: THREE.IUniform<number>;
  uFxFlare: THREE.IUniform<number>;
  uFxHalation: THREE.IUniform<number>;
  uFxCA: THREE.IUniform<number>;
  uFxStageFlood: THREE.IUniform<number>;
  uFxBeatPulse: THREE.IUniform<number>;
  uFxCRT: THREE.IUniform<number>;
  uFxAnaglyph: THREE.IUniform<number>;
  uFxPaletteCycle: THREE.IUniform<number>;
  uFxThermalShimmer: THREE.IUniform<number>;
  uFxBloomThreshold: THREE.IUniform<number>;
  uFxFeedbackDecay: THREE.IUniform<number>;
  [key: string]: THREE.IUniform;
}

/** Create the full set of uniforms matching FullscreenQuad.tsx */
export function createVJUniforms(width: number, height: number): VJUniforms {
  return {
    uTime: { value: 0 },
    uDynamicTime: { value: 0 },
    uBass: { value: 0 },
    uRms: { value: 0 },
    uCentroid: { value: 0 },
    uHighs: { value: 0 },
    uOnset: { value: 0 },
    uBeat: { value: 0 },
    uMids: { value: 0 },
    uResolution: { value: new THREE.Vector2(width, height) },
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
    uContrast0: { value: new THREE.Vector4(0, 0, 0, 0) },
    uContrast1: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma0: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma1: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma2: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCamOffset: { value: new THREE.Vector2(0, 0) },
    uJamDensity: { value: 0.5 },
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
    // Melodic/harmonic
    uMelodicPitch: { value: 0.5 },
    uMelodicDirection: { value: 0 },
    uMelodicConfidence: { value: 0 },
    uChordIndex: { value: 0 },
    uChordConfidence: { value: 0 },
    uHarmonicTension: { value: 0 },
    // Section/structure
    uSectionType: { value: 1 },
    uEnergyForecast: { value: 0.5 },
    uPeakApproaching: { value: 0 },
    uBeatStability: { value: 0.5 },
    uBeatConfidence: { value: 0.5 },
    uDownbeat: { value: 0 },
    uImprovisationScore: { value: 0 },
    uJamPhase: { value: -1 },
    // Deep audio
    uTempoDerivative: { value: 0 },
    uDynamicRange: { value: 0.5 },
    uSpaceScore: { value: 0 },
    uTimbralBrightness: { value: 0.5 },
    uTimbralFlux: { value: 0 },
    uVocalPitch: { value: 0 },
    // Energy acceleration
    uEnergyAccel: { value: 0 },
    // Envelope
    uEnvelopeBrightness: { value: 1 },
    uEnvelopeSaturation: { value: 1 },
    uEnvelopeHue: { value: 0 },
    // Era/show
    uEraSaturation: { value: 1 },
    uEraBrightness: { value: 1 },
    uEraSepia: { value: 0 },
    uShowWarmth: { value: 0 },
    uShowContrast: { value: 1 },
    uShowSaturation: { value: 1 },
    uShowGrain: { value: 0 },
    uShowBloom: { value: 0 },
    uVenueVignette: { value: 0 },
    // Post-process
    uBloomThreshold: { value: 0.5 },
    uLensDistortion: { value: 0 },
    uGradingIntensity: { value: 1 },
    // FX uniforms
    uFxBloom: { value: 0 },
    uFxGrain: { value: 0 },
    uFxFlare: { value: 0 },
    uFxHalation: { value: 0 },
    uFxCA: { value: 0 },
    uFxStageFlood: { value: 0 },
    uFxBeatPulse: { value: 0 },
    uFxCRT: { value: 0 },
    uFxAnaglyph: { value: 0 },
    uFxPaletteCycle: { value: 0 },
    uFxThermalShimmer: { value: 0 },
    uFxBloomThreshold: { value: 0.5 },
    uFxFeedbackDecay: { value: 0.97 },
  };
}

/** Update all uniforms from SmoothedAudioState — called every frame */
export function mapToUniforms(state: SmoothedAudioState, u: VJUniforms): void {
  u.uTime.value = state.time;
  u.uDynamicTime.value = state.dynamicTime;
  u.uBass.value = state.bass;
  u.uRms.value = state.rms;
  u.uCentroid.value = state.centroid;
  u.uHighs.value = state.highs;
  u.uOnset.value = state.onset;
  u.uBeat.value = state.beatDecay;
  u.uMids.value = state.mids;
  u.uEnergy.value = state.energy;
  u.uSectionProgress.value = state.sectionProgress;
  u.uSectionIndex.value = state.sectionIndex;
  u.uChromaHue.value = state.chromaHue;
  u.uFlatness.value = state.flatness;
  u.uPalettePrimary.value = state.palettePrimary;
  u.uPaletteSecondary.value = state.paletteSecondary;
  u.uPaletteSaturation.value = state.paletteSaturation;
  u.uTempo.value = state.tempo;
  u.uOnsetSnap.value = state.onsetSnap;
  u.uBeatSnap.value = state.beatSnap;
  u.uChromaShift.value = state.chromaShift;
  u.uAfterglowHue.value = state.afterglowHue;
  u.uMusicalTime.value = state.musicalTime;
  u.uClimaxPhase.value = state.climaxPhase;
  u.uClimaxIntensity.value = state.climaxIntensity;
  u.uJamDensity.value = state.jamDensity;
  u.uCoherence.value = state.coherence;
  u.uSlowEnergy.value = state.slowEnergy;
  u.uStemBass.value = state.stemBass;
  u.uFastEnergy.value = state.fastEnergy;
  u.uFastBass.value = state.fastBass;
  u.uDrumOnset.value = state.drumOnset;
  u.uDrumBeat.value = state.drumBeat;
  u.uSpectralFlux.value = state.spectralFlux;
  u.uVocalEnergy.value = state.vocalEnergy;
  u.uVocalPresence.value = state.vocalPresence;
  u.uOtherEnergy.value = state.otherEnergy;
  u.uOtherCentroid.value = state.otherCentroid;
  u.uSnapToMusicalTime.value = state.isLocked ? 1.0 : 0.0;

  // Melodic/harmonic — derive from spectral data where possible
  // In VJ mode, approximate from centroid/chroma since no offline analysis
  u.uMelodicPitch.value = Math.min(1, state.centroid / 4000); // normalize centroid to 0-1
  u.uMelodicDirection.value = 0; // no offline melodic direction in real-time
  u.uMelodicConfidence.value = state.energy > 0.05 ? 0.5 : 0; // moderate confidence when music playing
  u.uChordIndex.value = Math.floor(state.chromaHue / 30) % 12; // approximate from chroma
  u.uChordConfidence.value = state.energy > 0.05 ? 0.4 : 0;
  u.uHarmonicTension.value = state.spectralFlux * 2; // flux as tension proxy

  // Section/structure — derive from energy patterns
  u.uSectionType.value = 1; // default to verse; real-time can't detect sections
  u.uEnergyForecast.value = state.slowEnergy;
  u.uPeakApproaching.value = state.energy > 0.7 ? (state.energy - 0.7) / 0.3 : 0;
  u.uBeatStability.value = state.isBeat ? Math.min(1, 0.5 + state.energy) : 0.3;
  u.uBeatConfidence.value = state.isBeat ? 0.7 : 0.3;
  u.uDownbeat.value = 0;
  u.uImprovisationScore.value = state.spectralFlux > 0.3 ? state.spectralFlux : 0;
  u.uJamPhase.value = -1; // no jam phase detection in real-time

  // Deep audio — derive from Web Audio features
  u.uTempoDerivative.value = 0; // stable tempo assumed
  u.uDynamicRange.value = Math.min(1, state.energy * 2);
  u.uSpaceScore.value = state.energy < 0.05 ? 0.8 : 0;
  u.uTimbralBrightness.value = Math.min(1, state.centroid / 3000);
  u.uTimbralFlux.value = state.spectralFlux;
  u.uVocalPitch.value = 0; // no vocal detection in real-time

  // Energy acceleration
  u.uEnergyAccel.value = state.fastEnergy - state.slowEnergy;

  // Envelope — pass-through (VJ mode doesn't have CSS envelope)
  u.uEnvelopeBrightness.value = 1;
  u.uEnvelopeSaturation.value = 1;
  u.uEnvelopeHue.value = 0;

  // Era/show — defaults (no show context in VJ mode)
  // These stay at their initial values unless overridden by song identity

  // Contrast packed into vec4s
  const c = state.contrast;
  u.uContrast0.value.set(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0);
  u.uContrast1.value.set(c[4] ?? 0, c[5] ?? 0, c[6] ?? 0, 0);

  // Chroma packed into vec4s
  const ch = state.chroma;
  u.uChroma0.value.set(ch[0] ?? 0, ch[1] ?? 0, ch[2] ?? 0, ch[3] ?? 0);
  u.uChroma1.value.set(ch[4] ?? 0, ch[5] ?? 0, ch[6] ?? 0, ch[7] ?? 0);
  u.uChroma2.value.set(ch[8] ?? 0, ch[9] ?? 0, ch[10] ?? 0, ch[11] ?? 0);

  // Camera offset: bass-driven sway + slow sinusoidal drift
  const bassAmp = state.bass * 12.0;
  const t = state.time;
  const dt = state.dynamicTime;
  const camOffX = Math.sin(t * 3.7) * bassAmp * 0.5 + Math.sin(dt * 0.03 * Math.PI * 2) * 4;
  const camOffY = Math.cos(t * 2.3) * bassAmp * 0.3 + Math.cos(dt * 0.03 * Math.PI * 2 * 0.7 + 1.3) * 2.4;
  u.uCamOffset.value.set(camOffX, camOffY);

  // FX uniforms from VJStore
  const fx = useVJStore.getState();
  u.uFxBloom.value = fx.fxBloom ? 1.0 : 0.0;
  u.uFxGrain.value = grainToFloat(fx.fxGrain);
  u.uFxFlare.value = fx.fxFlare ? 1.0 : 0.0;
  u.uFxHalation.value = fx.fxHalation ? 1.0 : 0.0;
  u.uFxCA.value = fx.fxCA ? 1.0 : 0.0;
  u.uFxStageFlood.value = fx.fxStageFlood ? 1.0 : 0.0;
  u.uFxBeatPulse.value = fx.fxBeatPulse ? 1.0 : 0.0;
  u.uFxCRT.value = fx.fxCRT ? 1.0 : 0.0;
  u.uFxAnaglyph.value = fx.fxAnaglyph ? 1.0 : 0.0;
  u.uFxPaletteCycle.value = fx.fxPaletteCycle ? 1.0 : 0.0;
  u.uFxThermalShimmer.value = fx.fxThermalShimmer ? 1.0 : 0.0;
  u.uFxBloomThreshold.value = fx.fxBloomThreshold;
  u.uFxFeedbackDecay.value = fx.fxFeedbackDecay;
}

/** Convert GrainStrength to float for shader uniform */
function grainToFloat(strength: GrainStrength): number {
  switch (strength) {
    case "none": return 0.0;
    case "low": return 0.33;
    case "mid": return 0.66;
    case "high": return 1.0;
  }
}
