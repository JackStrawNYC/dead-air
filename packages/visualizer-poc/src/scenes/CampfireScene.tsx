/**
 * CampfireScene — 3D campfire using React Three Fiber geometry.
 * Ground-level bonfire under a starfield sky. Warm, intimate, inviting.
 *
 * Audio reactivity:
 *   smooth.energy  -> fire height, light intensity, ember count
 *   smooth.bass    -> fire base pulse, flame sway
 *   smooth.onset   -> ember burst
 *   smooth.vocalEnergy -> smoke density
 *   smooth.chromaHue   -> fire color accent
 *   smooth.flatness    -> smoke density
 *   beatDecay          -> fire size pulse, ember spawn
 */

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { AudioReactiveCanvas, useAudioData } from "../components/AudioReactiveCanvas";
import {
  fireParticleVert,
  fireParticleFrag,
  emberParticleVert,
  emberParticleFrag,
  smokeParticleVert,
  smokeParticleFrag,
} from "../shaders/campfire";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic pseudo-random from seed */
function seeded(seed: number): number {
  return ((Math.sin(seed * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
}

/** Create particle attribute buffers for Points geometry */
function makeParticleAttrs(count: number, spreadRadius: number, baseY: number) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const phases = new Float32Array(count);
  const lifetimes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const angle = seeded(i * 7.13) * Math.PI * 2;
    const r = seeded(i * 3.71) * spreadRadius;
    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = baseY;
    positions[i * 3 + 2] = Math.sin(angle) * r;
    seeds[i] = seeded(i * 13.37);
    phases[i] = seeded(i * 29.41);
    lifetimes[i] = 0.5 + seeded(i * 51.17) * 0.5;
  }

  return { positions, seeds, phases, lifetimes };
}

// ---------------------------------------------------------------------------
// Fire particles (500-1000 points rising from center)
// ---------------------------------------------------------------------------

const FIRE_COUNT = 700;

const FireParticles: React.FC = () => {
  const { time, smooth, beatDecay } = useAudioData();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uBeat: { value: 0 },
      uBass: { value: 0 },
      uChromaHue: { value: 0 },
      uOnset: { value: 0 },
    }),
    [],
  );

  uniforms.uTime.value = time;
  uniforms.uEnergy.value = smooth.energy;
  uniforms.uBeat.value = beatDecay;
  uniforms.uBass.value = smooth.bass;
  uniforms.uChromaHue.value = smooth.chromaHue;
  uniforms.uOnset.value = smooth.onset;

  const { positions, seeds, phases, lifetimes } = useMemo(() => makeParticleAttrs(FIRE_COUNT, 0.6, 0.1), []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={FIRE_COUNT} itemSize={3} />
        <bufferAttribute attach="attributes-aSeed" array={seeds} count={FIRE_COUNT} itemSize={1} />
        <bufferAttribute attach="attributes-aPhase" array={phases} count={FIRE_COUNT} itemSize={1} />
        <bufferAttribute attach="attributes-aLifetime" array={lifetimes} count={FIRE_COUNT} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={fireParticleVert}
        fragmentShader={fireParticleFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

// ---------------------------------------------------------------------------
// Ember particles (200 points, burst on beat)
// ---------------------------------------------------------------------------

const EMBER_COUNT = 200;

const EmberParticles: React.FC = () => {
  const { time, smooth, beatDecay } = useAudioData();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uBeat: { value: 0 },
      uOnset: { value: 0 },
    }),
    [],
  );

  uniforms.uTime.value = time;
  uniforms.uEnergy.value = smooth.energy;
  uniforms.uBeat.value = beatDecay;
  uniforms.uOnset.value = smooth.onsetSnap;

  const { positions, seeds, phases, lifetimes } = useMemo(() => makeParticleAttrs(EMBER_COUNT, 0.4, 0.3), []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={EMBER_COUNT} itemSize={3} />
        <bufferAttribute attach="attributes-aSeed" array={seeds} count={EMBER_COUNT} itemSize={1} />
        <bufferAttribute attach="attributes-aPhase" array={phases} count={EMBER_COUNT} itemSize={1} />
        <bufferAttribute attach="attributes-aLifetime" array={lifetimes} count={EMBER_COUNT} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={emberParticleVert}
        fragmentShader={emberParticleFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

// ---------------------------------------------------------------------------
// Smoke particles (150 points above fire)
// ---------------------------------------------------------------------------

const SMOKE_COUNT = 150;

const SmokeParticles: React.FC = () => {
  const { time, smooth } = useAudioData();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uFlatness: { value: 0 },
    }),
    [],
  );

  uniforms.uTime.value = time;
  uniforms.uEnergy.value = smooth.energy;
  uniforms.uFlatness.value = smooth.flatness + smooth.vocalEnergy * 0.3;

  const { positions, seeds, phases, lifetimes } = useMemo(() => makeParticleAttrs(SMOKE_COUNT, 0.5, 2.0), []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={SMOKE_COUNT} itemSize={3} />
        <bufferAttribute attach="attributes-aSeed" array={seeds} count={SMOKE_COUNT} itemSize={1} />
        <bufferAttribute attach="attributes-aPhase" array={phases} count={SMOKE_COUNT} itemSize={1} />
        <bufferAttribute attach="attributes-aLifetime" array={lifetimes} count={SMOKE_COUNT} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={smokeParticleVert}
        fragmentShader={smokeParticleFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
};

// ---------------------------------------------------------------------------
// Ground plane (CircleGeometry, dark earth with noise displacement)
// ---------------------------------------------------------------------------

const GroundPlane: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { smooth } = useAudioData();

  // Displace vertices once for terrain feel
  const geometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(15, 64, 0, Math.PI * 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // Simple noise displacement for natural terrain
      const noise = Math.sin(x * 0.8) * Math.cos(z * 0.6) * 0.15 +
        Math.sin(x * 2.1 + 1.3) * Math.cos(z * 1.7 + 0.7) * 0.08;
      pos.setY(i, noise);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} geometry={geometry}>
      <meshStandardMaterial
        color="#1a0f0a"
        roughness={0.95}
        metalness={0.0}
        emissive="#0a0503"
        emissiveIntensity={smooth.energy * 0.2}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Logs (3-4 cylinders arranged in campfire ring)
// ---------------------------------------------------------------------------

const LOG_CONFIGS = [
  { pos: [-0.8, 0.08, 0.3] as const, rot: [0, 0.4, Math.PI * 0.03] as const, len: 2.2, rad: 0.12 },
  { pos: [0.7, 0.08, -0.4] as const, rot: [0, -0.6, Math.PI * 0.04] as const, len: 2.0, rad: 0.1 },
  { pos: [0.2, 0.08, 0.9] as const, rot: [0, 1.2, Math.PI * 0.02] as const, len: 1.8, rad: 0.11 },
  { pos: [-0.3, 0.1, -0.7] as const, rot: [0, -1.0, Math.PI * 0.05] as const, len: 1.6, rad: 0.09 },
];

const Logs: React.FC = () => {
  const { smooth } = useAudioData();
  const emissiveIntensity = 0.3 + smooth.energy * 1.2;

  return (
    <>
      {LOG_CONFIGS.map((log, i) => (
        <mesh
          key={i}
          position={[log.pos[0], log.pos[1], log.pos[2]]}
          rotation={[log.rot[0], log.rot[1], log.rot[2]]}
        >
          <cylinderGeometry args={[log.rad, log.rad * 1.1, log.len, 8]} />
          <meshStandardMaterial
            color="#2a1a0e"
            roughness={0.9}
            metalness={0.0}
            emissive="#ff4400"
            emissiveIntensity={emissiveIntensity * (0.5 + seeded(i * 11.3) * 0.5)}
          />
        </mesh>
      ))}
    </>
  );
};

// ---------------------------------------------------------------------------
// Warm point light at fire center
// ---------------------------------------------------------------------------

const FireLight: React.FC = () => {
  const { time, smooth, beatDecay } = useAudioData();

  // Intensity: 0.2 at rest, up to 2.0 at peaks
  const baseIntensity = 0.2 + smooth.energy * 1.8;
  // Flicker with noise + beat
  const flicker = 0.85 + 0.15 * Math.sin(time * 8.3) * Math.cos(time * 5.7);
  const beatBoost = 1.0 + beatDecay * 0.3;
  const intensity = baseIntensity * flicker * beatBoost;

  return (
    <>
      <pointLight
        position={[0, 1.0, 0]}
        color="#FF8844"
        intensity={intensity}
        distance={25}
        decay={2}
      />
      {/* Secondary fill light lower for ground illumination */}
      <pointLight
        position={[0, 0.3, 0]}
        color="#FF6622"
        intensity={intensity * 0.4}
        distance={15}
        decay={2}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Trees (6-8 cylinder trunks with cone canopy)
// ---------------------------------------------------------------------------

const TREE_CONFIGS = [
  { angle: 0.3, dist: 8, height: 6, trunkR: 0.25 },
  { angle: 0.9, dist: 9, height: 7, trunkR: 0.3 },
  { angle: 1.6, dist: 7.5, height: 5.5, trunkR: 0.22 },
  { angle: 2.3, dist: 10, height: 8, trunkR: 0.28 },
  { angle: 3.1, dist: 8.5, height: 6.5, trunkR: 0.26 },
  { angle: 4.0, dist: 9.5, height: 7.5, trunkR: 0.24 },
  { angle: 4.8, dist: 7, height: 5, trunkR: 0.2 },
  { angle: 5.5, dist: 11, height: 9, trunkR: 0.32 },
];

const Trees: React.FC = () => {
  return (
    <>
      {TREE_CONFIGS.map((tree, i) => {
        const x = Math.cos(tree.angle) * tree.dist;
        const z = Math.sin(tree.angle) * tree.dist;
        const trunkH = tree.height * 0.5;
        const canopyH = tree.height * 0.6;
        const canopyR = tree.height * 0.25;
        return (
          <group key={i} position={[x, 0, z]}>
            {/* Trunk */}
            <mesh position={[0, trunkH / 2, 0]}>
              <cylinderGeometry args={[tree.trunkR * 0.8, tree.trunkR, trunkH, 6]} />
              <meshStandardMaterial color="#0a0805" roughness={1} metalness={0} />
            </mesh>
            {/* Canopy */}
            <mesh position={[0, trunkH + canopyH * 0.3, 0]}>
              <coneGeometry args={[canopyR, canopyH, 6]} />
              <meshStandardMaterial color="#050805" roughness={1} metalness={0} />
            </mesh>
          </group>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------------------
// Sky dome (inside-out sphere with stars)
// ---------------------------------------------------------------------------

const STAR_COUNT = 800;

const SkyDome: React.FC = () => {
  const { smooth } = useAudioData();

  // Stars fade when fire is bright
  const starBrightness = Math.max(0, 1.0 - smooth.energy * 1.5);

  const starPositions = useMemo(() => {
    const pos = new Float32Array(STAR_COUNT * 3);
    const radius = 50;
    for (let i = 0; i < STAR_COUNT; i++) {
      // Distribute on upper hemisphere
      const theta = seeded(i * 7.31) * Math.PI * 2;
      const phi = seeded(i * 13.17) * Math.PI * 0.45 + 0.1; // above horizon
      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.cos(phi);
      pos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return pos;
  }, []);

  const starColors = useMemo(() => {
    const col = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const warmth = seeded(i * 41.7);
      // Mix between white, blue-white, and warm yellow
      col[i * 3] = 0.8 + warmth * 0.2;
      col[i * 3 + 1] = 0.85 + (1 - warmth) * 0.15;
      col[i * 3 + 2] = 0.9 + (1 - warmth) * 0.1;
    }
    return col;
  }, []);

  return (
    <>
      {/* Dark sky dome */}
      <mesh>
        <sphereGeometry args={[55, 32, 16]} />
        <meshBasicMaterial color="#020208" side={THREE.BackSide} />
      </mesh>

      {/* Stars as points */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={starPositions} count={STAR_COUNT} itemSize={3} />
          <bufferAttribute attach="attributes-color" array={starColors} count={STAR_COUNT} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          size={0.3}
          vertexColors
          transparent
          opacity={starBrightness * 0.8}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </>
  );
};

// ---------------------------------------------------------------------------
// Camera controller (slow orbit via useFrame, like RiverScene)
// ---------------------------------------------------------------------------

const CampfireCameraController: React.FC = () => {
  const audio = useAudioData();

  useFrame(({ camera }) => {
    const t = audio.time;
    const energy = audio.smooth.energy;

    // Very slow orbit: ~120 seconds per full revolution
    const orbitAngle = t * 0.05;
    const radius = 5 + Math.sin(t * 0.02) * 0.3;
    const height = 2 + energy * 0.5;

    const camX = Math.sin(orbitAngle) * radius;
    const camZ = Math.cos(orbitAngle) * radius;

    camera.position.set(camX, height, camZ);
    camera.lookAt(0, 0.5, 0);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.updateProjectionMatrix();
    }
  });

  return null;
};

// ---------------------------------------------------------------------------
// Inner scene composed of all elements
// ---------------------------------------------------------------------------

const CampfireInner: React.FC = () => {
  const { smooth } = useAudioData();

  // Warm ambient light: very dim, just enough to hint at surroundings
  const ambientIntensity = 0.02 + smooth.energy * 0.03;

  return (
    <group>
      {/* Camera orbit controller */}
      <CampfireCameraController />

      {/* Ambient: very low so darkness is real */}
      <ambientLight color="#221108" intensity={ambientIntensity} />

      {/* Fire light source */}
      <FireLight />

      {/* Ground */}
      <GroundPlane />

      {/* Logs */}
      <Logs />

      {/* Fire particles */}
      <FireParticles />

      {/* Embers */}
      <EmberParticles />

      {/* Smoke */}
      <SmokeParticles />

      {/* Trees */}
      <Trees />

      {/* Sky dome + stars */}
      <SkyDome />
    </group>
  );
};

// ---------------------------------------------------------------------------
// Exported scene component (same Props interface as before)
// ---------------------------------------------------------------------------

interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const CampfireScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas
      frames={frames}
      sections={sections}
      palette={palette}
      tempo={tempo}
      style={style}
      jamDensity={jamDensity}
    >
      <CampfireInner />
    </AudioReactiveCanvas>
  );
};
