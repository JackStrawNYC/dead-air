/**
 * VJUniformBridge — maps SmoothedAudioState to Three.js shader uniforms.
 * Exactly replicates the uniform update pattern from FullscreenQuad.tsx.
 */

import * as THREE from "three";
import type { SmoothedAudioState } from "../audio/types";

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
}
