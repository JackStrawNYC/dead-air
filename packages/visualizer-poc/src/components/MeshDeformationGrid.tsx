/**
 * MeshDeformationGrid — audio-reactive vertex-displaced plane overlay.
 *
 * A 48×48 grid plane where vertices are displaced by audio features (bass, treble,
 * energy, beats). Rendered as a subtle additive texture layer on top of the shader scene.
 *
 * Uses AudioReactiveCanvas → inner DeformGrid component (same pattern as FullscreenQuad).
 */

import React, { useMemo } from "react";
import * as THREE from "three";
import { AudioReactiveCanvas, useAudioData } from "./AudioReactiveCanvas";
import { useVideoConfig } from "remotion";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";
import { meshDeformationVert, meshDeformationFrag } from "../shaders/mesh-deformation";

interface DeformGridProps {
  opacity: number;
}

const DeformGrid: React.FC<DeformGridProps> = ({ opacity }) => {
  const { time, dynamicTime, smooth, palettePrimary, paletteSecondary, paletteSaturation, beatDecay, tempo } = useAudioData();
  const { width, height } = useVideoConfig();

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uDynamicTime: { value: 0 },
    uBass: { value: 0 },
    uRms: { value: 0 },
    uHighs: { value: 0 },
    uEnergy: { value: 0 },
    uBeatSnap: { value: 0 },
    uSectionType: { value: 5 },
    uPalettePrimary: { value: 0 },
    uPaletteSecondary: { value: 0 },
    uPaletteSaturation: { value: 1 },
    uResolution: { value: new THREE.Vector2(width, height) },
    // Declare all shared uniforms so GLSL doesn't error — unused ones stay 0
    uCentroid: { value: 0 }, uOnset: { value: 0 }, uBeat: { value: 0 },
    uMids: { value: 0 }, uFlatness: { value: 0 }, uSlowEnergy: { value: 0 },
    uFastEnergy: { value: 0 }, uFastBass: { value: 0 }, uSpectralFlux: { value: 0 },
    uEnergyAccel: { value: 0 }, uEnergyTrend: { value: 0 }, uLocalTempo: { value: 120 },
    uTempo: { value: 120 }, uOnsetSnap: { value: 0 }, uMusicalTime: { value: 0 },
    uSnapToMusicalTime: { value: 0 }, uDrumOnset: { value: 0 }, uDrumBeat: { value: 0 },
    uStemBass: { value: 0 }, uVocalEnergy: { value: 0 }, uVocalPresence: { value: 0 },
    uOtherEnergy: { value: 0 }, uOtherCentroid: { value: 0 },
    uChromaHue: { value: 0 }, uChromaShift: { value: 0 }, uAfterglowHue: { value: 0 },
    uContrast0: { value: new THREE.Vector4(0, 0, 0, 0) },
    uContrast1: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma0: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma1: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma2: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFFTTexture: { value: null },
    uSectionProgress: { value: 0 }, uSectionIndex: { value: 0 },
    uClimaxPhase: { value: 0 }, uClimaxIntensity: { value: 0 },
    uCoherence: { value: 0 }, uJamDensity: { value: 0.5 },
    uJamPhase: { value: -1 }, uJamProgress: { value: 0 },
    uEraSaturation: { value: 1 }, uEraBrightness: { value: 1 }, uEraSepia: { value: 0 },
    uBloomThreshold: { value: 0 }, uLensDistortion: { value: 0 }, uGradingIntensity: { value: 1 },
    uMelodicPitch: { value: 0 }, uMelodicDirection: { value: 0 },
    uChordIndex: { value: 0 }, uHarmonicTension: { value: 0 },
    uEnergyForecast: { value: 0 }, uPeakApproaching: { value: 0 },
    uBeatStability: { value: 0.5 }, uImprovisationScore: { value: 0 },
    uDownbeat: { value: 0 }, uBeatConfidence: { value: 0.5 }, uMelodicConfidence: { value: 0.5 },
    uPeakOfShow: { value: 0 }, uHeroIconTrigger: { value: 0 }, uHeroIconProgress: { value: 0 },
    uShowWarmth: { value: 0 }, uShowContrast: { value: 1 }, uShowSaturation: { value: 0 },
    uShowGrain: { value: 1 }, uShowBloom: { value: 1 }, uVenueVignette: { value: 0.5 },
    uCamPos: { value: new THREE.Vector3(0, 0, -3.5) },
    uCamTarget: { value: new THREE.Vector3(0, 0, 0) },
    uCamFov: { value: 50 }, uCamDof: { value: 0 }, uCamFocusDist: { value: 3 },
    uCamOffset: { value: new THREE.Vector2(0, 0) },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update per-frame audio uniforms
  uniforms.uTime.value = time;
  uniforms.uDynamicTime.value = dynamicTime;
  uniforms.uBass.value = smooth.bass;
  uniforms.uRms.value = smooth.rms;
  uniforms.uHighs.value = smooth.highs;
  uniforms.uEnergy.value = smooth.energy;
  uniforms.uBeatSnap.value = smooth.beatSnap;
  uniforms.uSectionType.value = smooth.sectionTypeFloat;
  uniforms.uPalettePrimary.value = palettePrimary;
  uniforms.uPaletteSecondary.value = paletteSecondary;
  uniforms.uPaletteSaturation.value = paletteSaturation;

  return (
    <mesh>
      <planeGeometry args={[2, 2, 48, 48]} />
      <shaderMaterial
        vertexShader={meshDeformationVert}
        fragmentShader={meshDeformationFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
};

interface Props {
  frames: EnhancedFrameData[];
  sections: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  opacity?: number;
}

export const MeshDeformationGrid: React.FC<Props> = ({
  frames,
  sections,
  palette,
  tempo,
  opacity = 0.5,
}) => {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity }}>
      <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo}>
        <DeformGrid opacity={opacity} />
      </AudioReactiveCanvas>
    </div>
  );
};
