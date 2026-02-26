/**
 * FullscreenQuad — renders a PlaneGeometry(2,2) with a custom ShaderMaterial.
 * Designed for fullscreen fragment shaders (Liquid Light, Concert Beams).
 * Sets uniforms from audio data each frame via useAudioData().
 */

import React, { useMemo } from "react";
import * as THREE from "three";
import { useAudioData } from "./AudioReactiveCanvas";
import { useVideoConfig } from "remotion";

interface Props {
  vertexShader: string;
  fragmentShader: string;
  extraUniforms?: Record<string, THREE.IUniform>;
}

export const FullscreenQuad: React.FC<Props> = ({
  vertexShader,
  fragmentShader,
  extraUniforms,
}) => {
  const { time, beatDecay, smooth, palettePrimary, paletteSecondary, paletteSaturation, tempo } = useAudioData();
  const { width, height } = useVideoConfig();

  const uniforms = useMemo(() => {
    return {
      uTime: { value: 0 },
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
      uContrast0: { value: new THREE.Vector4(0, 0, 0, 0) },
      uContrast1: { value: new THREE.Vector4(0, 0, 0, 0) },
      ...extraUniforms,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  uniforms.uTime.value = time;
  uniforms.uBass.value = smooth.bass;
  uniforms.uRms.value = smooth.rms;
  uniforms.uCentroid.value = smooth.centroid;
  uniforms.uHighs.value = smooth.highs;
  uniforms.uOnset.value = smooth.onset;
  uniforms.uBeat.value = beatDecay;
  uniforms.uMids.value = smooth.mids;
  uniforms.uResolution.value.set(width, height);
  uniforms.uEnergy.value = smooth.energy;
  uniforms.uSectionProgress.value = smooth.sectionProgress;
  uniforms.uSectionIndex.value = smooth.sectionIndex;
  uniforms.uChromaHue.value = smooth.chromaHue;
  uniforms.uFlatness.value = smooth.flatness;
  uniforms.uPalettePrimary.value = palettePrimary;
  uniforms.uPaletteSecondary.value = paletteSecondary;
  uniforms.uPaletteSaturation.value = paletteSaturation;
  uniforms.uTempo.value = tempo;
  uniforms.uOnsetSnap.value = smooth.onsetSnap;
  uniforms.uBeatSnap.value = smooth.beatSnap;
  uniforms.uChromaShift.value = smooth.chromaShift;
  uniforms.uAfterglowHue.value = smooth.afterglowHue;

  const c = smooth.contrast;
  uniforms.uContrast0.value.set(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0);
  uniforms.uContrast1.value.set(c[4] ?? 0, c[5] ?? 0, c[6] ?? 0, 0);

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
};
