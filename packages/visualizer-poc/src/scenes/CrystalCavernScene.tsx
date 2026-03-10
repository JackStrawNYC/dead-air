/**
 * CrystalCavernScene — true 3D using Three.js InstancedMesh.
 * 400 icosahedrons in a cylindrical cave distribution.
 * Follows the ParticleNebulaScene pattern for audio integration.
 *
 * Camera: helical forward drift, bass-driven shake.
 * Crystals: bass-pulsing geometry, chroma-colored facets.
 */

import React, { useMemo } from "react";
import * as THREE from "three";
import { AudioReactiveCanvas, useAudioData } from "../components/AudioReactiveCanvas";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";
import { crystalCavernVert, crystalCavernFrag } from "../shaders/crystal-cavern";

const CRYSTAL_COUNT = 400;
const CAVE_RADIUS = 8;
const CAVE_LENGTH = 40;

const CrystalSystem: React.FC = () => {
  const { time, smooth, palettePrimary, paletteSecondary, paletteSaturation, musicalTime, climaxPhase, climaxIntensity } = useAudioData();

  const { geometry, material, instancedMesh } = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.3, 1);

    // Add instance index attribute
    const instanceIndices = new Float32Array(CRYSTAL_COUNT);
    for (let i = 0; i < CRYSTAL_COUNT; i++) {
      instanceIndices[i] = i;
    }

    const uniforms = {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uHighs: { value: 0 },
      uEnergy: { value: 0 },
      uOnsetSnap: { value: 0 },
      uMusicalTime: { value: 0 },
      uPalettePrimary: { value: 0 },
      uPaletteSecondary: { value: 0 },
      uPaletteSaturation: { value: 1 },
      uBeatSnap: { value: 0 },
      uClimaxPhase: { value: 0 },
      uClimaxIntensity: { value: 0 },
      uChroma0: { value: new THREE.Vector4(0, 0, 0, 0) },
      uChroma1: { value: new THREE.Vector4(0, 0, 0, 0) },
      uChroma2: { value: new THREE.Vector4(0, 0, 0, 0) },
      uFastEnergy: { value: 0 },
      uDrumBeat: { value: 0 },
      uDrumOnset: { value: 0 },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: crystalCavernVert,
      fragmentShader: crystalCavernFrag,
      uniforms,
      side: THREE.DoubleSide,
    });

    // Create instanced mesh
    const mesh = new THREE.InstancedMesh(geo, mat, CRYSTAL_COUNT);

    // Distribute crystals in cylindrical cave
    const dummy = new THREE.Object3D();
    for (let i = 0; i < CRYSTAL_COUNT; i++) {
      const t = i / CRYSTAL_COUNT;
      const angle = t * Math.PI * 2 * 13.7; // golden angle spiral
      const z = (t - 0.5) * CAVE_LENGTH;
      const r = CAVE_RADIUS * (0.6 + Math.sin(i * 0.1) * 0.4);

      dummy.position.set(
        Math.cos(angle) * r,
        Math.sin(angle) * r,
        z,
      );

      // Random scale variation
      const scale = 0.5 + ((i * 0.618033988) % 1) * 1.0;
      dummy.scale.setScalar(scale);

      // Random rotation
      dummy.rotation.set(i * 0.7, i * 1.3, i * 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    // Add instance index as geometry attribute
    geo.setAttribute("aInstanceIndex", new THREE.InstancedBufferAttribute(instanceIndices, 1));

    mesh.instanceMatrix.needsUpdate = true;

    return { geometry: geo, material: mat, instancedMesh: mesh };
  }, []);

  // Update uniforms per frame
  material.uniforms.uTime.value = time;
  material.uniforms.uBass.value = smooth.bass;
  material.uniforms.uHighs.value = smooth.highs;
  material.uniforms.uEnergy.value = smooth.energy;
  material.uniforms.uOnsetSnap.value = smooth.onsetSnap;
  material.uniforms.uMusicalTime.value = musicalTime;
  material.uniforms.uPalettePrimary.value = palettePrimary;
  material.uniforms.uPaletteSecondary.value = paletteSecondary;
  material.uniforms.uPaletteSaturation.value = paletteSaturation;
  material.uniforms.uBeatSnap.value = smooth.beatSnap;
  material.uniforms.uClimaxPhase.value = climaxPhase;
  material.uniforms.uClimaxIntensity.value = climaxIntensity;
  material.uniforms.uFastEnergy.value = smooth.fastEnergy;
  material.uniforms.uDrumBeat.value = smooth.drumBeat;
  material.uniforms.uDrumOnset.value = smooth.drumOnset;

  const ch = smooth.chroma;
  material.uniforms.uChroma0.value.set(ch[0] ?? 0, ch[1] ?? 0, ch[2] ?? 0, ch[3] ?? 0);
  material.uniforms.uChroma1.value.set(ch[4] ?? 0, ch[5] ?? 0, ch[6] ?? 0, ch[7] ?? 0);
  material.uniforms.uChroma2.value.set(ch[8] ?? 0, ch[9] ?? 0, ch[10] ?? 0, ch[11] ?? 0);

  // Helical camera path: spirals forward through the cave
  const camT = time * 0.3;
  const camZ = camT * 4 - CAVE_LENGTH * 0.5;
  const camAngle = camT * 0.5;
  const camR = 2.0;

  // Bass-driven shake
  const shakeAmt = smooth.bass * 0.15;
  const shakeX = Math.sin(time * 7.3) * shakeAmt;
  const shakeY = Math.cos(time * 5.1) * shakeAmt;

  const camX = Math.cos(camAngle) * camR + shakeX;
  const camY = Math.sin(camAngle) * camR + shakeY;

  // Look ahead along the cave
  const lookZ = camZ + 5;

  return (
    <>
      <perspectiveCamera
        position={[camX, camY, camZ]}
        fov={60}
        near={0.1}
        far={100}
        // @ts-expect-error — R3F sets this on the default camera
        makeDefault
      />
      <primitive object={instancedMesh} />
      <ambientLight intensity={0.1} />
      <pointLight position={[0, 0, camZ + 3]} intensity={0.8} color="#4488ff" />
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

export const CrystalCavernScene: React.FC<Props> = ({ frames, sections, palette, tempo, style }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style}>
      <color attach="background" args={["#020208"]} />
      <CrystalSystem />
    </AudioReactiveCanvas>
  );
};
