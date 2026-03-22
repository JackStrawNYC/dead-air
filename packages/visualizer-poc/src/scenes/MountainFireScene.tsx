/**
 * MountainFireScene — 3D blazing wildfire behind mountain silhouettes.
 *
 * Components:
 *   1. Mountain silhouettes: 3 layered displaced planes at different depths
 *      - Dark silhouette against sky, height shifts with melodicPitch
 *   2. Fire: Points system (1000+ particles) rising from behind ridge
 *      - Orange/red/yellow, height from uEnergy, color from chromaHue + palette
 *   3. Fire glow: PointLight behind mountains (rim-lighting edges)
 *   4. Embers: Points (200 particles), rise on beat, drift with wind
 *   5. Sky: Background gradient (blue/purple → red/orange at peaks)
 *   6. Smoke: Points above fire (gray translucent, density from flatness)
 *   7. Camera: [0, 0, 8] looking at mountains [0, 1, -5]
 *
 * Audio: energy→fire height, bass→fire pulse, onset→ember burst, flatness→smoke
 */

import React, { useMemo } from "react";
import * as THREE from "three";
import { AudioReactiveCanvas, useAudioData } from "../components/AudioReactiveCanvas";
import { useVideoConfig } from "remotion";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";
import {
  mountainSilhouetteVert,
  mountainSilhouetteFrag,
  fireParticleVert,
  fireParticleFrag,
  emberVert,
  emberFrag,
  smokeVert,
  smokeFrag,
  mountainSkyVert,
  mountainSkyFrag,
  computeFireColor,
} from "../shaders/mountain-fire";

// ═══════════════════════════════════════════════════
// Helper: particle geometry builders
// ═══════════════════════════════════════════════════

function makeFireParticles(count: number) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // Fire column: centered behind mountain ridge, narrow spread
    positions[i * 3] = (Math.random() - 0.5) * 4;
    positions[i * 3 + 1] = 0; // base of fire (vertex shader handles rise)
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2;
    phases[i] = Math.random();
    speeds[i] = 0.3 + Math.random() * 1.2;
    sizes[i] = 0.5 + Math.random() * 1.0;
  }
  return { positions, phases, speeds, sizes };
}

function makeEmberParticles(count: number) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 6;
    positions[i * 3 + 1] = Math.random() * 2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2;
    phases[i] = Math.random();
    speeds[i] = 0.2 + Math.random() * 0.8;
  }
  return { positions, phases, speeds };
}

function makeSmokeParticles(count: number) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 5;
    positions[i * 3 + 1] = Math.random() * 2 + 1;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2;
    phases[i] = Math.random();
    speeds[i] = 0.1 + Math.random() * 0.5;
  }
  return { positions, phases, speeds };
}

// ═══════════════════════════════════════════════════
// Mountain Layer Component
// ═══════════════════════════════════════════════════

interface MountainLayerProps {
  seed: number;
  scale: number;
  layerHeight: number;
  depth: number; // 0=near, 1=far
  zPos: number;
  uniforms: {
    melodicPitch: number;
    energy: number;
    fireColor: THREE.Color;
  };
}

const MountainLayer: React.FC<MountainLayerProps> = ({
  seed,
  scale,
  layerHeight,
  depth,
  zPos,
  uniforms: audioUniforms,
}) => {
  const mtUniforms = useMemo(
    () => ({
      uMelodicPitch: { value: 0 },
      uLayerSeed: { value: seed },
      uLayerScale: { value: scale },
      uLayerHeight: { value: layerHeight },
      uEnergy: { value: 0 },
      uFireColor: { value: new THREE.Color(1, 0.5, 0.1) },
      uLayerDepth: { value: depth },
    }),
    [seed, scale, layerHeight, depth],
  );

  mtUniforms.uMelodicPitch.value = audioUniforms.melodicPitch;
  mtUniforms.uEnergy.value = audioUniforms.energy;
  mtUniforms.uFireColor.value.copy(audioUniforms.fireColor);

  return (
    <mesh position={[0, -2, zPos]}>
      <planeGeometry args={[20, 6, 128, 1]} />
      <shaderMaterial
        vertexShader={mountainSilhouetteVert}
        fragmentShader={mountainSilhouetteFrag}
        uniforms={mtUniforms}
        side={THREE.FrontSide}
      />
    </mesh>
  );
};

// ═══════════════════════════════════════════════════
// Inner 3D Scene
// ═══════════════════════════════════════════════════

const MountainFireInner: React.FC = () => {
  const audio = useAudioData();
  const { width, height } = useVideoConfig();
  const { time, dynamicTime, smooth, palettePrimary, paletteSecondary, paletteSaturation } = audio;

  const energy = smooth.energy;
  const chromaHue = smooth.chromaHue;

  // Compute fire color for sharing across components
  const fireColorRGB = computeFireColor(chromaHue);
  const fireColor = useMemo(() => new THREE.Color(), []);
  fireColor.setRGB(fireColorRGB[0], fireColorRGB[1], fireColorRGB[2]);

  // ── Fire particle uniforms ──
  const fireUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDynamicTime: { value: 0 },
      uEnergy: { value: 0 },
      uBass: { value: 0 },
      uBeatSnap: { value: 0 },
      uClimaxIntensity: { value: 0 },
      uChromaHue: { value: 0 },
      uPalettePrimary: { value: 0 },
      uPaletteSaturation: { value: 1 },
    }),
    [],
  );

  // ── Ember uniforms ──
  const emberUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDynamicTime: { value: 0 },
      uEnergy: { value: 0 },
      uOnsetSnap: { value: 0 },
      uBeatSnap: { value: 0 },
      uChromaHue: { value: 0 },
    }),
    [],
  );

  // ── Smoke uniforms ──
  const smokeUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDynamicTime: { value: 0 },
      uFlatness: { value: 0 },
      uEnergy: { value: 0 },
      uFireColor: { value: new THREE.Color(1, 0.5, 0.1) },
    }),
    [],
  );

  // ── Sky uniforms ──
  const skyUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDynamicTime: { value: 0 },
      uSlowEnergy: { value: 0 },
      uEnergy: { value: 0 },
    }),
    [],
  );

  // ── Update uniforms ──
  fireUniforms.uTime.value = time;
  fireUniforms.uDynamicTime.value = dynamicTime;
  fireUniforms.uEnergy.value = smooth.energy;
  fireUniforms.uBass.value = smooth.bass;
  fireUniforms.uBeatSnap.value = smooth.beatSnap;
  fireUniforms.uClimaxIntensity.value = audio.climaxIntensity;
  fireUniforms.uChromaHue.value = smooth.chromaHue;
  fireUniforms.uPalettePrimary.value = palettePrimary;
  fireUniforms.uPaletteSaturation.value = paletteSaturation;

  emberUniforms.uTime.value = time;
  emberUniforms.uDynamicTime.value = dynamicTime;
  emberUniforms.uEnergy.value = smooth.energy;
  emberUniforms.uOnsetSnap.value = smooth.onsetSnap;
  emberUniforms.uBeatSnap.value = smooth.beatSnap;
  emberUniforms.uChromaHue.value = smooth.chromaHue;

  smokeUniforms.uTime.value = time;
  smokeUniforms.uDynamicTime.value = dynamicTime;
  smokeUniforms.uFlatness.value = smooth.flatness;
  smokeUniforms.uEnergy.value = smooth.energy;
  smokeUniforms.uFireColor.value.copy(fireColor);

  skyUniforms.uTime.value = time;
  skyUniforms.uDynamicTime.value = dynamicTime;
  skyUniforms.uSlowEnergy.value = smooth.slowEnergy;
  skyUniforms.uEnergy.value = smooth.energy;

  // Mountain layer shared audio data
  const mountainAudio = {
    melodicPitch: smooth.melodicPitch,
    energy: smooth.energy,
    fireColor,
  };

  // ── Fire glow intensity from energy ──
  const fireGlowIntensity = energy * 3 + audio.climaxIntensity * 2;
  const fireGlowColor = new THREE.Color(
    fireColorRGB[0] * 0.8 + 0.2,
    fireColorRGB[1] * 0.5,
    fireColorRGB[2] * 0.2,
  );

  // ── Particle geometries (memoized) ──
  const fireGeo = useMemo(() => {
    const { positions, phases, speeds, sizes } = makeFireParticles(1200);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, []);

  const emberGeo = useMemo(() => {
    const { positions, phases, speeds } = makeEmberParticles(200);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    return geo;
  }, []);

  const smokeGeo = useMemo(() => {
    const { positions, phases, speeds } = makeSmokeParticles(150);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    return geo;
  }, []);

  return (
    <>
      {/* ── Sky Background ── */}
      <mesh renderOrder={-1}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          vertexShader={mountainSkyVert}
          fragmentShader={mountainSkyFrag}
          uniforms={skyUniforms}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      {/* ── Fire Glow Light (behind mountains, creates rim lighting) ── */}
      <pointLight
        position={[0, 3, -8]}
        color={fireGlowColor}
        intensity={fireGlowIntensity}
        distance={30}
        decay={2}
      />

      {/* ── Fire Particles (behind mountain ridge) ── */}
      <points position={[0, 0.5, -6]}>
        <primitive object={fireGeo} attach="geometry" />
        <shaderMaterial
          vertexShader={fireParticleVert}
          fragmentShader={fireParticleFrag}
          uniforms={fireUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* ── Smoke Particles (above fire) ── */}
      <points position={[0, 3, -6]}>
        <primitive object={smokeGeo} attach="geometry" />
        <shaderMaterial
          vertexShader={smokeVert}
          fragmentShader={smokeFrag}
          uniforms={smokeUniforms}
          transparent
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </points>

      {/* ── Mountain Silhouettes (3 layers, front to back) ── */}
      <MountainLayer
        seed={0}
        scale={1.0}
        layerHeight={0.18}
        depth={0}
        zPos={-3}
        uniforms={mountainAudio}
      />
      <MountainLayer
        seed={5}
        scale={0.8}
        layerHeight={0.22}
        depth={0.5}
        zPos={-5}
        uniforms={mountainAudio}
      />
      <MountainLayer
        seed={12}
        scale={1.2}
        layerHeight={0.15}
        depth={1}
        zPos={-7}
        uniforms={mountainAudio}
      />

      {/* ── Ember Particles (above fire, in front of mountains) ── */}
      <points position={[0, 2, -4]}>
        <primitive object={emberGeo} attach="geometry" />
        <shaderMaterial
          vertexShader={emberVert}
          fragmentShader={emberFrag}
          uniforms={emberUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* ── Ambient light ── */}
      <ambientLight intensity={0.02} color="#1a0a0a" />
    </>
  );
};

// ═══════════════════════════════════════════════════
// Public Scene Component
// ═══════════════════════════════════════════════════

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const MountainFireScene: React.FC<Props> = ({
  frames,
  sections,
  palette,
  tempo,
  style,
  jamDensity,
}) => {
  return (
    <AudioReactiveCanvas
      frames={frames}
      sections={sections}
      palette={palette}
      tempo={tempo}
      style={style}
      jamDensity={jamDensity}
    >
      <MountainFireInner />
    </AudioReactiveCanvas>
  );
};
