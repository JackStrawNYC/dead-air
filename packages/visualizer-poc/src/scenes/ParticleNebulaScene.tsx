/**
 * ParticleNebulaScene — cosmic particle cloud (20% of show).
 * 15K particles in golden-ratio sphere distribution.
 * Camera orbits with bass-driven shake.
 * Uses AudioReactiveCanvas for shared smoothing + all uniforms.
 */

import React, { useMemo } from "react";
import * as THREE from "three";
import { AudioReactiveCanvas, useAudioData } from "../components/AudioReactiveCanvas";
import { useVideoConfig } from "remotion";
import { particleNebulaVert, particleNebulaFrag } from "../shaders/particle-nebula";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

const PARTICLE_COUNT = 15000;
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

const ParticleSystem: React.FC = () => {
  const { time, beatDecay, smooth, palettePrimary, paletteSecondary, paletteSaturation, tempo } = useAudioData();

  const { geometry, uniforms } = useMemo(() => {
    const radiuses = new Float32Array(PARTICLE_COUNT);
    const thetas = new Float32Array(PARTICLE_COUNT);
    const phis = new Float32Array(PARTICLE_COUNT);
    const randoms = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = i / PARTICLE_COUNT;
      const theta = 2 * Math.PI * i / GOLDEN_RATIO;
      const phi = Math.acos(1 - 2 * t);
      const baseR = 1.0 + (i % 5) * 0.4;

      radiuses[i] = baseR + (Math.sin(i * 0.1) * 0.3);
      thetas[i] = theta;
      phis[i] = phi;
      randoms[i] = (i * 0.618033988) % 1.0;
    }

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aRadius", new THREE.BufferAttribute(radiuses, 1));
    geo.setAttribute("aTheta", new THREE.BufferAttribute(thetas, 1));
    geo.setAttribute("aPhi", new THREE.BufferAttribute(phis, 1));
    geo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

    const u = {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMids: { value: 0 },
      uHighs: { value: 0 },
      uOnset: { value: 0 },
      uBeat: { value: 0 },
      uRms: { value: 0 },
      uCentroid: { value: 0 },
      uEnergy: { value: 0 },
      uFlatness: { value: 0 },
      uSectionProgress: { value: 0 },
      uSectionIndex: { value: 0 },
      uChromaHue: { value: 0 },
      uPalettePrimary: { value: 0 },
      uPaletteSecondary: { value: 0 },
      uPaletteSaturation: { value: 1 },
      uTempo: { value: 120 },
      uOnsetSnap: { value: 0 },
      uBeatSnap: { value: 0 },
      uChromaShift: { value: 0 },
      uAfterglowHue: { value: 0 },
    };

    return { geometry: geo, uniforms: u };
  }, []);

  uniforms.uTime.value = time;
  uniforms.uBass.value = smooth.bass;
  uniforms.uMids.value = smooth.mids;
  uniforms.uHighs.value = smooth.highs;
  uniforms.uOnset.value = smooth.onset;
  uniforms.uBeat.value = beatDecay;
  uniforms.uRms.value = smooth.rms;
  uniforms.uCentroid.value = smooth.centroid;
  uniforms.uEnergy.value = smooth.energy;
  uniforms.uFlatness.value = smooth.flatness;
  uniforms.uSectionProgress.value = smooth.sectionProgress;
  uniforms.uSectionIndex.value = smooth.sectionIndex;
  uniforms.uChromaHue.value = smooth.chromaHue;
  uniforms.uPalettePrimary.value = palettePrimary;
  uniforms.uPaletteSecondary.value = paletteSecondary;
  uniforms.uPaletteSaturation.value = paletteSaturation;
  uniforms.uTempo.value = tempo;
  uniforms.uOnsetSnap.value = smooth.onsetSnap;
  uniforms.uBeatSnap.value = smooth.beatSnap;
  uniforms.uChromaShift.value = smooth.chromaShift;
  uniforms.uAfterglowHue.value = smooth.afterglowHue;

  // Camera orbit with bass shake
  const sectionProgress = smooth.sectionProgress;
  const energy = smooth.energy;
  const camAngle = time * 0.05;
  const baseDist = 5 + Math.sin(time * 0.02) * 0.5;
  const camDist = baseDist + (sectionProgress - 0.3) * 1.5 * energy;

  const shakeAmt = smooth.bass * 0.08;
  const shakeX = Math.sin(time * 8.3) * shakeAmt;
  const shakeY = Math.cos(time * 7.1) * shakeAmt;

  const camX = Math.cos(camAngle) * camDist + shakeX;
  const camZ = Math.sin(camAngle) * camDist;
  const camY = Math.sin(time * 0.03) * 0.5 + shakeY;

  return (
    <>
      <perspectiveCamera
        position={[camX, camY, camZ]}
        fov={50}
        near={0.1}
        far={100}
        // @ts-expect-error — R3F sets this on the default camera
        makeDefault
      />
      <points geometry={geometry}>
        <shaderMaterial
          vertexShader={particleNebulaVert}
          fragmentShader={particleNebulaFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
};

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
}

export const ParticleNebulaScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <color attach="background" args={["#020208"]} />
      <ParticleSystem />
    </AudioReactiveCanvas>
  );
};
