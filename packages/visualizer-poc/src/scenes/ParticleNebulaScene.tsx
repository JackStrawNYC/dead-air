/**
 * ParticleNebulaScene — cosmic particle cloud (20% of show).
 * 4K icosphere particles in toroidal flow field with Phong shading.
 * Camera orbits with bass-driven shake.
 * Uses AudioReactiveCanvas for shared smoothing + all uniforms.
 *
 * v7: Upgraded from Points to InstancedMesh for proper lighting.
 */

import React, { useMemo } from "react";
import * as THREE from "three";
import { AudioReactiveCanvas, useAudioData } from "../components/AudioReactiveCanvas";
import { particleNebulaVert, particleNebulaFrag } from "../shaders/particle-nebula";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

const PARTICLE_COUNT = 4000;
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

const ParticleSystem: React.FC = () => {
  const { time, beatDecay, smooth, palettePrimary, paletteSecondary, paletteSaturation, tempo, musicalTime, climaxPhase, climaxIntensity, dynamicTime } = useAudioData();

  const { material, instancedMesh } = useMemo(() => {
    // Small icosphere geometry for each particle
    const geo = new THREE.IcosahedronGeometry(0.08, 1);

    // Instance attributes
    const radiuses = new Float32Array(PARTICLE_COUNT);
    const thetas = new Float32Array(PARTICLE_COUNT);
    const phis = new Float32Array(PARTICLE_COUNT);
    const randoms = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = i / PARTICLE_COUNT;
      const theta = 2 * Math.PI * i / GOLDEN_RATIO;
      const phi = Math.acos(1 - 2 * t);
      const baseR = 0.5 + (i % 5) * 0.3;

      radiuses[i] = baseR + (Math.sin(i * 0.1) * 0.2);
      thetas[i] = theta;
      phis[i] = phi;
      randoms[i] = (i * 0.618033988) % 1.0;
    }

    // Add instanced attributes
    geo.setAttribute("aRadius", new THREE.InstancedBufferAttribute(radiuses, 1));
    geo.setAttribute("aTheta", new THREE.InstancedBufferAttribute(thetas, 1));
    geo.setAttribute("aPhi", new THREE.InstancedBufferAttribute(phis, 1));
    geo.setAttribute("aRandom", new THREE.InstancedBufferAttribute(randoms, 1));

    const u = {
      uTime: { value: 0 },
      uDynamicTime: { value: 0 },
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
      uMusicalTime: { value: 0 },
      uChromaShift: { value: 0 },
      uAfterglowHue: { value: 0 },
      uClimaxPhase: { value: 0 },
      uClimaxIntensity: { value: 0 },
      uFastEnergy: { value: 0 },
      uFastBass: { value: 0 },
      uDrumOnset: { value: 0 },
      uDrumBeat: { value: 0 },
      uSpectralFlux: { value: 0 },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: particleNebulaVert,
      fragmentShader: particleNebulaFrag,
      uniforms: u,
      side: THREE.FrontSide,
    });

    // Create instanced mesh — identity transforms (shader computes positions)
    const mesh = new THREE.InstancedMesh(geo, mat, PARTICLE_COUNT);
    const dummy = new THREE.Object3D();
    dummy.position.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    return { material: mat, instancedMesh: mesh };
  }, []);

  material.uniforms.uTime.value = time;
  material.uniforms.uDynamicTime.value = dynamicTime;
  material.uniforms.uBass.value = smooth.bass;
  material.uniforms.uMids.value = smooth.mids;
  material.uniforms.uHighs.value = smooth.highs;
  material.uniforms.uOnset.value = smooth.onset;
  material.uniforms.uBeat.value = beatDecay;
  material.uniforms.uRms.value = smooth.rms;
  material.uniforms.uCentroid.value = smooth.centroid;
  material.uniforms.uEnergy.value = smooth.energy;
  material.uniforms.uFlatness.value = smooth.flatness;
  material.uniforms.uSectionProgress.value = smooth.sectionProgress;
  material.uniforms.uSectionIndex.value = smooth.sectionIndex;
  material.uniforms.uChromaHue.value = smooth.chromaHue;
  material.uniforms.uPalettePrimary.value = palettePrimary;
  material.uniforms.uPaletteSecondary.value = paletteSecondary;
  material.uniforms.uPaletteSaturation.value = paletteSaturation;
  material.uniforms.uTempo.value = tempo;
  material.uniforms.uOnsetSnap.value = smooth.onsetSnap;
  material.uniforms.uBeatSnap.value = smooth.beatSnap;
  material.uniforms.uMusicalTime.value = musicalTime;
  material.uniforms.uChromaShift.value = smooth.chromaShift;
  material.uniforms.uAfterglowHue.value = smooth.afterglowHue;
  material.uniforms.uClimaxPhase.value = climaxPhase;
  material.uniforms.uClimaxIntensity.value = climaxIntensity;
  material.uniforms.uFastEnergy.value = smooth.fastEnergy;
  material.uniforms.uFastBass.value = smooth.fastBass;
  material.uniforms.uDrumOnset.value = smooth.drumOnset;
  material.uniforms.uDrumBeat.value = smooth.drumBeat;
  material.uniforms.uSpectralFlux.value = smooth.spectralFlux;

  // Camera orbit with bass shake
  const sectionProgress = smooth.sectionProgress;
  const energy = smooth.energy;
  const camAngle = dynamicTime * 0.05;
  const baseDist = 6 + Math.sin(dynamicTime * 0.02) * 0.5;
  const camDist = baseDist + (sectionProgress - 0.3) * 1.5 * energy;

  const shakeAmt = smooth.bass * 0.08;
  const shakeX = Math.sin(time * 8.3) * shakeAmt;
  const shakeY = Math.cos(time * 7.1) * shakeAmt;

  const camX = Math.cos(camAngle) * camDist + shakeX;
  const camZ = Math.sin(camAngle) * camDist;
  const camY = Math.sin(dynamicTime * 0.03) * 0.5 + shakeY;

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
      <primitive object={instancedMesh} />
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

/** Energy-reactive background — never pitch black. */
const NebulaBackground: React.FC = () => {
  const { smooth, palettePrimary } = useAudioData();
  const energy = smooth.energy;
  // HSV-to-RGB for palette hue at low brightness
  const hue = palettePrimary;
  const brightness = 0.04 + energy * 0.08; // 4%-12% brightness
  const r = brightness * (0.6 + 0.4 * Math.cos(2 * Math.PI * (hue)));
  const g = brightness * (0.6 + 0.4 * Math.cos(2 * Math.PI * (hue - 0.333)));
  const b = brightness * (0.6 + 0.4 * Math.cos(2 * Math.PI * (hue - 0.667)));
  return <color attach="background" args={[r, g, b]} />;
};

export const ParticleNebulaScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <NebulaBackground />
      <ParticleSystem />
    </AudioReactiveCanvas>
  );
};
