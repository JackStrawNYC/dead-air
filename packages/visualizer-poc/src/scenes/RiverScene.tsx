/**
 * RiverScene — 3D river environment with real geometry via React Three Fiber.
 *
 * Water surface: PlaneGeometry (100x100, 128x128 segments) with vertex shader displacement.
 * Shoreline banks: elongated boxes on each side with trees (cylinders).
 * Sky: large background plane with gradient + stars + moon.
 * Camera: PerspectiveCamera at [0, 3, 8] looking downstream.
 * Fog: FogExp2 driven by inverse energy.
 *
 * All audio reactivity via useAudioData() hook.
 */

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { AudioReactiveCanvas, useAudioData } from "../components/AudioReactiveCanvas";
import { useVideoConfig } from "remotion";
import { riverWaterVert, riverWaterFrag } from "../shaders/river";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

// ---------------------------------------------------------------------------
// Water Surface
// ---------------------------------------------------------------------------
const WaterSurface: React.FC = () => {
  const audio = useAudioData();
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDynamicTime: { value: 0 },
      uEnergy: { value: 0 },
      uBass: { value: 0 },
      uHighs: { value: 0 },
      uOnsetSnap: { value: 0 },
      uSlowEnergy: { value: 0 },
      uChromaHue: { value: 0 },
      uVocalEnergy: { value: 0 },
      uVocalPresence: { value: 0 },
      uPalettePrimary: { value: 0 },
      uPaletteSecondary: { value: 0 },
      uPaletteSaturation: { value: 1 },
      uMelodicPitch: { value: 0 },
      uMelodicDirection: { value: 0 },
      uClimaxPhase: { value: 0 },
      uClimaxIntensity: { value: 0 },
      uBeatStability: { value: 0.5 },
      uSectionType: { value: 5 },
      uHarmonicTension: { value: 0 },
      uCameraPosition: { value: new THREE.Vector3(0, 3, 8) },
    }),
    [],
  );

  // Update uniforms every frame
  uniforms.uTime.value = audio.time;
  uniforms.uDynamicTime.value = audio.dynamicTime;
  uniforms.uEnergy.value = audio.smooth.energy;
  uniforms.uBass.value = audio.smooth.bass;
  uniforms.uHighs.value = audio.smooth.highs;
  uniforms.uOnsetSnap.value = audio.smooth.onsetSnap;
  uniforms.uSlowEnergy.value = audio.smooth.slowEnergy;
  uniforms.uChromaHue.value = audio.smooth.chromaHue;
  uniforms.uVocalEnergy.value = audio.smooth.vocalEnergy;
  uniforms.uVocalPresence.value = audio.smooth.vocalPresence;
  uniforms.uPalettePrimary.value = audio.palettePrimary;
  uniforms.uPaletteSecondary.value = audio.paletteSecondary;
  uniforms.uPaletteSaturation.value = audio.paletteSaturation;
  uniforms.uMelodicPitch.value = audio.smooth.melodicPitch;
  uniforms.uMelodicDirection.value = audio.smooth.melodicDirection;
  uniforms.uClimaxPhase.value = audio.climaxPhase;
  uniforms.uClimaxIntensity.value = audio.climaxIntensity;
  uniforms.uBeatStability.value = audio.smooth.beatStability;
  uniforms.uSectionType.value = audio.smooth.sectionTypeFloat;
  uniforms.uHarmonicTension.value = audio.smooth.harmonicTension;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[100, 100, 128, 128]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={riverWaterVert}
        fragmentShader={riverWaterFrag}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Shoreline Banks
// ---------------------------------------------------------------------------
const ShorelineBanks: React.FC = () => {
  const bankMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.04, 0.05, 0.02),
        roughness: 0.95,
        metalness: 0.0,
      }),
    [],
  );

  // Generate tree positions deterministically
  const trees = useMemo(() => {
    const result: Array<{ x: number; z: number; height: number; radius: number; side: number }> = [];
    for (let i = 0; i < 14; i++) {
      const seed = i * 73.156;
      const z = -40 + (i / 13) * 70;
      const offset = Math.sin(seed) * 2;
      // Left bank trees
      result.push({
        x: -20 - 2 - Math.abs(Math.sin(seed * 1.3)) * 4,
        z: z + offset,
        height: 3 + Math.abs(Math.sin(seed * 2.7)) * 4,
        radius: 0.3 + Math.abs(Math.sin(seed * 3.1)) * 0.3,
        side: -1,
      });
      // Right bank trees
      result.push({
        x: 20 + 2 + Math.abs(Math.cos(seed * 1.7)) * 4,
        z: z + offset * 0.7,
        height: 3 + Math.abs(Math.cos(seed * 2.3)) * 4,
        radius: 0.3 + Math.abs(Math.cos(seed * 3.5)) * 0.3,
        side: 1,
      });
    }
    return result;
  }, []);

  const treeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.02, 0.06, 0.01),
        roughness: 0.9,
        metalness: 0.0,
      }),
    [],
  );

  const trunkMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.08, 0.05, 0.02),
        roughness: 0.95,
        metalness: 0.0,
      }),
    [],
  );

  return (
    <group>
      {/* Left bank */}
      <mesh position={[-25, 0.15, -5]} material={bankMaterial}>
        <boxGeometry args={[12, 0.5, 90]} />
      </mesh>
      {/* Right bank */}
      <mesh position={[25, 0.15, -5]} material={bankMaterial}>
        <boxGeometry args={[12, 0.5, 90]} />
      </mesh>

      {/* Trees: trunk (cylinder) + foliage (cone) */}
      {trees.map((tree, i) => (
        <group key={i} position={[tree.x, 0.4, tree.z]}>
          {/* Trunk */}
          <mesh position={[0, tree.height * 0.35, 0]} material={trunkMaterial}>
            <cylinderGeometry args={[tree.radius * 0.3, tree.radius * 0.5, tree.height * 0.7, 6]} />
          </mesh>
          {/* Foliage */}
          <mesh position={[0, tree.height * 0.7, 0]} material={treeMaterial}>
            <coneGeometry args={[tree.radius * 2.5, tree.height * 0.6, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Sky Dome (background plane with gradient, stars, moon)
// ---------------------------------------------------------------------------
const skyVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const skyFrag = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uEnergy;
varying vec2 vUv;

void main() {
  // Gradient: deep blue at top, horizon glow at bottom
  vec3 topColor = vec3(0.01, 0.01, 0.06);
  vec3 midColor = vec3(0.02, 0.03, 0.1);
  vec3 horizonColor = vec3(0.06, 0.08, 0.18);

  float t = vUv.y;
  vec3 sky = mix(horizonColor, midColor, smoothstep(0.0, 0.4, t));
  sky = mix(sky, topColor, smoothstep(0.4, 1.0, t));

  // Stars
  vec2 starUV = vUv * vec2(120.0, 60.0);
  vec2 cell = floor(starUV);
  vec2 f = fract(starUV);
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5);
  vec2 starPos = vec2(h, h2);
  float dist = length(f - starPos);
  float hasStar = step(0.75, h);
  float brightness = h2 * 0.5 + 0.5;
  float twinkle = 0.7 + 0.3 * sin(uTime * 1.5 + h * 50.0);
  // Stars fade at peaks
  float starFade = mix(1.0, 0.15, clamp(uEnergy, 0.0, 1.0));
  float star = hasStar * brightness * smoothstep(0.02, 0.004, dist) * twinkle * starFade;
  sky += vec3(0.8, 0.85, 1.0) * star * 0.6;

  gl_FragColor = vec4(sky, 1.0);
}
`;

const SkyDome: React.FC = () => {
  const audio = useAudioData();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0 },
    }),
    [],
  );

  uniforms.uTime.value = audio.time;
  uniforms.uEnergy.value = audio.smooth.energy;

  return (
    <mesh position={[0, 20, -60]} rotation={[0, 0, 0]}>
      <planeGeometry args={[200, 80]} />
      <shaderMaterial
        vertexShader={skyVert}
        fragmentShader={skyFrag}
        uniforms={uniforms}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Moon
// ---------------------------------------------------------------------------
const Moon: React.FC = () => {
  const audio = useAudioData();
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.95, 0.92, 0.85),
        emissive: new THREE.Color(0.4, 0.38, 0.3),
        emissiveIntensity: 1.5,
        roughness: 0.8,
        metalness: 0.0,
      }),
    [],
  );

  // Subtle glow scales with melodic pitch
  if (meshRef.current) {
    const glow = 0.3 + audio.smooth.melodicPitch * 0.4;
    material.emissiveIntensity = 1.0 + glow;
  }

  return (
    <mesh ref={meshRef} position={[15, 35, -55]} material={material}>
      <sphereGeometry args={[3, 24, 24]} />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Mist particles above the water (vocal-driven)
// ---------------------------------------------------------------------------
const MistParticles: React.FC = () => {
  const audio = useAudioData();
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, count } = useMemo(() => {
    const n = 400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = 0.3 + Math.random() * 3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    return { positions: pos, count: n };
  }, []);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: new THREE.Color(0.4, 0.45, 0.6),
        size: 0.3,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  // Vocal energy drives mist opacity and height
  const vocalEnergy = audio.smooth.vocalEnergy;
  const vocalPresence = audio.smooth.vocalPresence;
  const mistOpacity = vocalEnergy * 0.5 + vocalPresence * 0.3;
  material.opacity = Math.min(0.6, mistOpacity);
  material.size = 0.2 + vocalPresence * 0.4;

  // Animate mist positions: slow drift
  if (pointsRef.current) {
    const geo = pointsRef.current.geometry;
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const t = audio.time;
    for (let i = 0; i < count; i++) {
      const baseY = 0.3 + (Math.sin(i * 1.7) * 0.5 + 0.5) * 3;
      arr[i * 3 + 1] = baseY + Math.sin(t * 0.3 + i * 0.5) * (0.5 + vocalPresence);
      // Slow horizontal drift
      arr[i * 3] += Math.sin(t * 0.1 + i) * 0.002;
      arr[i * 3 + 2] -= 0.01 * (0.5 + audio.smooth.energy * 0.5); // drift downstream
    }
    posAttr.needsUpdate = true;
  }

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <primitive object={material} attach="material" />
    </points>
  );
};

// ---------------------------------------------------------------------------
// Scene Fog + Camera + Lighting orchestrator
// ---------------------------------------------------------------------------
const RiverEnvironment: React.FC = () => {
  const audio = useAudioData();
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const fogRef = useRef<THREE.FogExp2>(null);

  // Create fog object once
  const fog = useMemo(() => new THREE.FogExp2(0x020408, 0.02), []);

  useFrame(({ scene, camera }) => {
    // === FOG: thick at rest, clears at peaks ===
    const energy = audio.smooth.energy;
    const fogDensity = 0.025 * (1.0 - energy * 0.7);
    fog.density = Math.max(0.005, fogDensity);
    scene.fog = fog;

    // Update fog color slightly with energy
    const fogR = 0.01 + energy * 0.02;
    const fogG = 0.02 + energy * 0.03;
    const fogB = 0.04 + energy * 0.06;
    fog.color.setRGB(fogR, fogG, fogB);

    // === CAMERA: subtle sway with audio ===
    if (camera instanceof THREE.PerspectiveCamera) {
      const t = audio.time;
      const bass = audio.smooth.bass;

      // Base position [0, 3, 8]
      const swayX = Math.sin(t * 0.4) * 0.15 * (0.3 + bass * 0.7);
      const swayY = Math.cos(t * 0.3) * 0.08 * (0.3 + bass * 0.5);
      // Height drops slightly at peaks (more immersive)
      const heightDrop = energy * 0.6;

      camera.position.set(swayX, 3.0 - heightDrop + swayY, 8.0);
      camera.lookAt(swayX * 0.3, 0.0 - heightDrop * 0.3, -5.0);
      camera.updateProjectionMatrix();
    }
  });

  return null;
};

// ---------------------------------------------------------------------------
// River Content — assembles all sub-components
// ---------------------------------------------------------------------------
const RiverContent: React.FC = () => {
  return (
    <>
      <RiverEnvironment />

      {/* Ambient light: dim baseline */}
      <ambientLight intensity={0.15} color={new THREE.Color(0.3, 0.35, 0.5)} />

      {/* Moonlight: directional from upper right */}
      <directionalLight
        position={[15, 35, -55]}
        intensity={0.4}
        color={new THREE.Color(0.7, 0.7, 0.85)}
      />

      {/* Subtle hemisphere light for sky/ground ambient */}
      <hemisphereLight
        color={new THREE.Color(0.15, 0.2, 0.35)}
        groundColor={new THREE.Color(0.02, 0.03, 0.01)}
        intensity={0.3}
      />

      <SkyDome />
      <Moon />
      <WaterSurface />
      <ShorelineBanks />
      <MistParticles />
    </>
  );
};

// ---------------------------------------------------------------------------
// Scene Wrapper — same interface as all other scenes
// ---------------------------------------------------------------------------
interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const RiverScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <RiverContent />
    </AudioReactiveCanvas>
  );
};
