/**
 * OceanScene — 3D ocean seascape with React Three Fiber geometry.
 *
 * Components:
 *   1. Water surface: PlaneGeometry (200x200, 128x128 segments) with vertex displacement
 *      - Layered sine waves + FBM noise for organic surface
 *      - Wave height from uBass + uEnergy (calm swells → massive waves)
 *      - Deep blue with Fresnel reflection, foam on crests
 *   2. Sky background: gradient quad (deep space → horizon glow)
 *   3. Celestial body: SphereGeometry on horizon (emissive, pulsing with slowEnergy)
 *   4. Foam/spray: Points on wave crests (white particles triggered by onset)
 *   5. Bioluminescence: Points in water (blue-green dots during high vocalPresence)
 *   6. Camera: [0, 1, 5] looking toward horizon [0, 0.5, -20], slight bob
 *
 * Audio: bass→swell height, energy→storm intensity, onset→spray, vocals→bioluminescence
 */

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { AudioReactiveCanvas, useAudioData } from "../components/AudioReactiveCanvas";
import { useVideoConfig } from "remotion";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";
import {
  oceanWaterVert,
  oceanWaterFrag,
  oceanSkyVert,
  oceanSkyFrag,
  oceanCelestialVert,
  oceanCelestialFrag,
  oceanFoamVert,
  oceanFoamFrag,
  oceanBioVert,
  oceanBioFrag,
} from "../shaders/ocean";

// ═══════════════════════════════════════════════════
// Helper: generate random particle attributes
// ═══════════════════════════════════════════════════

function makeParticleAttributes(count: number, spreadX: number, spreadY: number, spreadZ: number) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spreadX;
    positions[i * 3 + 1] = Math.random() * spreadY;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spreadZ;
    phases[i] = Math.random();
    speeds[i] = 0.5 + Math.random() * 1.0;
  }
  return { positions, phases, speeds };
}

function makeFoamAttributes(count: number) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // Spread across the water surface
    positions[i * 3] = (Math.random() - 0.5) * 180;
    positions[i * 3 + 1] = Math.random() * 0.5; // just above water
    positions[i * 3 + 2] = (Math.random() - 0.5) * 180;
    phases[i] = Math.random();
    speeds[i] = 0.3 + Math.random() * 0.7;
  }
  return { positions, phases, speeds };
}

// ═══════════════════════════════════════════════════
// Inner 3D Scene (runs inside AudioReactiveCanvas)
// ═══════════════════════════════════════════════════

const OceanInner: React.FC = () => {
  const audio = useAudioData();
  const { width, height } = useVideoConfig();
  const { time, dynamicTime, smooth, palettePrimary, paletteSecondary, paletteSaturation } = audio;

  const energy = smooth.energy;
  const bass = smooth.bass;
  const slowE = smooth.slowEnergy;
  const storminess = Math.min(energy + bass * 0.3, 1.5);

  // ── Water uniforms ──
  const waterUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDynamicTime: { value: 0 },
      uBass: { value: 0 },
      uEnergy: { value: 0 },
      uMelodicPitch: { value: 0 },
      uFlatness: { value: 0 },
      uSlowEnergy: { value: 0 },
      uBeatSnap: { value: 0 },
      uOnsetSnap: { value: 0 },
      uVocalPresence: { value: 0 },
      uChromaHue: { value: 0 },
      uPalettePrimary: { value: 0 },
      uPaletteSecondary: { value: 0 },
      uPaletteSaturation: { value: 1 },
      uResolution: { value: new THREE.Vector2(width, height) },
      uCelestialPos: { value: new THREE.Vector3(0, 0, 0) },
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Sky uniforms ──
  const skyUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDynamicTime: { value: 0 },
      uEnergy: { value: 0 },
      uSlowEnergy: { value: 0 },
      uChromaHue: { value: 0 },
      uPalettePrimary: { value: 0 },
      uPaletteSecondary: { value: 0 },
      uPaletteSaturation: { value: 1 },
      uResolution: { value: new THREE.Vector2(width, height) },
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Celestial uniforms ──
  const celestialUniforms = useMemo(
    () => ({
      uSlowEnergy: { value: 0 },
      uEnergy: { value: 0 },
    }),
    [],
  );

  // ── Foam particle uniforms ──
  const foamUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uOnsetSnap: { value: 0 },
    }),
    [],
  );

  // ── Bioluminescence uniforms ──
  const bioUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uVocalPresence: { value: 0 },
      uDynamicTime: { value: 0 },
    }),
    [],
  );

  // ── Update all uniforms per frame ──
  waterUniforms.uTime.value = time;
  waterUniforms.uDynamicTime.value = dynamicTime;
  waterUniforms.uBass.value = smooth.bass;
  waterUniforms.uEnergy.value = smooth.energy;
  waterUniforms.uMelodicPitch.value = smooth.melodicPitch;
  waterUniforms.uFlatness.value = smooth.flatness;
  waterUniforms.uSlowEnergy.value = smooth.slowEnergy;
  waterUniforms.uBeatSnap.value = smooth.beatSnap;
  waterUniforms.uOnsetSnap.value = smooth.onsetSnap;
  waterUniforms.uVocalPresence.value = smooth.vocalPresence;
  waterUniforms.uChromaHue.value = smooth.chromaHue;
  waterUniforms.uPalettePrimary.value = palettePrimary;
  waterUniforms.uPaletteSecondary.value = paletteSecondary;
  waterUniforms.uPaletteSaturation.value = paletteSaturation;
  waterUniforms.uResolution.value.set(width, height);

  skyUniforms.uTime.value = time;
  skyUniforms.uDynamicTime.value = dynamicTime;
  skyUniforms.uEnergy.value = smooth.energy;
  skyUniforms.uSlowEnergy.value = smooth.slowEnergy;
  skyUniforms.uChromaHue.value = smooth.chromaHue;
  skyUniforms.uPalettePrimary.value = palettePrimary;
  skyUniforms.uPaletteSecondary.value = paletteSecondary;
  skyUniforms.uPaletteSaturation.value = paletteSaturation;

  celestialUniforms.uSlowEnergy.value = smooth.slowEnergy;
  celestialUniforms.uEnergy.value = smooth.energy;

  foamUniforms.uTime.value = time;
  foamUniforms.uEnergy.value = smooth.energy;
  foamUniforms.uOnsetSnap.value = smooth.onsetSnap;

  bioUniforms.uTime.value = time;
  bioUniforms.uVocalPresence.value = smooth.vocalPresence;
  bioUniforms.uDynamicTime.value = dynamicTime;

  // ── Celestial body position: on horizon, pulsing size ──
  const celestialRadius = (0.8 + slowE * 0.8) * (1 + smooth.beatSnap * 0.15);
  const celestialX = 15;
  const celestialY = 2 + celestialRadius;
  const celestialZ = -80;
  waterUniforms.uCelestialPos.value.set(celestialX / 20, celestialY / 20, celestialZ / 20);

  // ── Camera bob with wave motion ──
  const camBobY = Math.sin(time * 0.5) * 0.15 * (1 + bass * 0.5);
  const camBobX = Math.sin(time * 0.3) * 0.1;

  // ── Foam particle geometry ──
  const foamGeo = useMemo(() => {
    const { positions, phases, speeds } = makeFoamAttributes(500);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    return geo;
  }, []);

  // ── Bioluminescence particle geometry ──
  const bioGeo = useMemo(() => {
    const { positions, phases } = makeParticleAttributes(300, 160, 0.5, 160);
    // Place below water surface
    for (let i = 0; i < 300; i++) {
      positions[i * 3 + 1] = -Math.random() * 2 - 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    return geo;
  }, []);

  return (
    <>
      {/* ── Camera ── */}
      <perspectiveCamera
        position={[camBobX, 1 + camBobY, 5]}
        rotation={[
          -Math.atan2(0.5, 25), // looking slightly down toward horizon
          0,
          0,
        ]}
      />

      {/* ── Sky Background ── */}
      <mesh renderOrder={-1}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          vertexShader={oceanSkyVert}
          fragmentShader={oceanSkyFrag}
          uniforms={skyUniforms}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      {/* ── Celestial Body (Moon/Sun) ── */}
      <mesh position={[celestialX, celestialY, celestialZ]}>
        <sphereGeometry args={[celestialRadius, 32, 32]} />
        <shaderMaterial
          vertexShader={oceanCelestialVert}
          fragmentShader={oceanCelestialFrag}
          uniforms={celestialUniforms}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* ── Celestial Glow (additive halo) ── */}
      <pointLight
        position={[celestialX, celestialY, celestialZ]}
        color={storminess > 0.7 ? "#666677" : "#ffebaa"}
        intensity={Math.max(0.1, 1 - storminess) * 2}
        distance={200}
        decay={2}
      />

      {/* ── Water Surface ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -90]}>
        <planeGeometry args={[200, 200, 128, 128]} />
        <shaderMaterial
          vertexShader={oceanWaterVert}
          fragmentShader={oceanWaterFrag}
          uniforms={waterUniforms}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── Foam/Spray Particles ── */}
      <points position={[0, 0.2, -90]}>
        <primitive object={foamGeo} attach="geometry" />
        <shaderMaterial
          vertexShader={oceanFoamVert}
          fragmentShader={oceanFoamFrag}
          uniforms={foamUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* ── Bioluminescence Particles ── */}
      <points position={[0, -0.5, -90]}>
        <primitive object={bioGeo} attach="geometry" />
        <shaderMaterial
          vertexShader={oceanBioVert}
          fragmentShader={oceanBioFrag}
          uniforms={bioUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* ── Ambient light for subtle fill ── */}
      <ambientLight intensity={0.05} color="#1a1a3a" />
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

export const OceanScene: React.FC<Props> = ({
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
      <OceanInner />
    </AudioReactiveCanvas>
  );
};
