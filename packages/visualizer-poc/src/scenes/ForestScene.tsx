/**
 * ForestScene — 3D woodland with volumetric fog, tree trunks, light shafts, and fireflies.
 * Built with React Three Fiber geometry: CylinderGeometry trunks, PlaneGeometry ground,
 * PlaneGeometry light shafts, Points fireflies, FogExp2 atmosphere.
 *
 * Audio: energy->fog clears, highs->fireflies, bass->trunk sway, vocals->warm color shift
 */

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { AudioReactiveCanvas, useAudioData } from "../components/AudioReactiveCanvas";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

// ─── Seeded random for deterministic placement ───
function seededRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Tree Trunk ───
interface TreeProps {
  x: number;
  z: number;
  radius: number;
  height: number;
  layer: "near" | "mid" | "far";
  seed: number;
}

const TreeTrunk: React.FC<TreeProps> = ({ x, z, radius, height, layer, seed }) => {
  const { smooth, dynamicTime } = useAudioData();
  const bass = smooth.bass;
  const beatStability = smooth.beatStability;

  const meshRef = useRef<THREE.Mesh>(null);

  // Bass-driven sway, damped by beat stability
  const swayAmt = bass * 0.04 * (layer === "near" ? 1 : layer === "mid" ? 0.5 : 0.2);
  const damping = 1 - beatStability * 0.6; // tight groove = steady trees
  const swayX = Math.sin(dynamicTime * 0.5 + seed * 2) * swayAmt * damping;

  // Layer opacity
  const opacity = layer === "near" ? 1.0 : layer === "mid" ? 0.7 : 0.4;
  const darkFactor = layer === "near" ? 1.0 : layer === "mid" ? 0.8 : 0.5;

  const color = new THREE.Color(
    0.06 * darkFactor,
    0.04 * darkFactor,
    0.03 * darkFactor,
  );

  return (
    <mesh
      ref={meshRef}
      position={[x + swayX, height / 2, z]}
      rotation={[0, 0, swayX * 0.3]}
    >
      <cylinderGeometry args={[radius * 0.7, radius, height, 8]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
};

// ─── Trees Group ───
const Trees: React.FC = () => {
  const treeData = useMemo(() => {
    const items: TreeProps[] = [];

    // Near trees (6): large, dark, detailed
    for (let i = 0; i < 6; i++) {
      const seed = i * 7.31 + 1;
      const x = (seededRand(seed) - 0.5) * 16;
      const z = -(seededRand(seed + 1) * 8 + 2);
      const radius = 0.15 + seededRand(seed + 2) * 0.1;
      const height = 6 + seededRand(seed + 3) * 4;
      items.push({ x, z, radius, height, layer: "near", seed });
    }

    // Mid trees (10): thinner, more fog-faded
    for (let i = 0; i < 10; i++) {
      const seed = (i + 20) * 5.17 + 10;
      const x = (seededRand(seed) - 0.5) * 22;
      const z = -(seededRand(seed + 1) * 12 + 10);
      const radius = 0.08 + seededRand(seed + 2) * 0.06;
      const height = 5 + seededRand(seed + 3) * 5;
      items.push({ x, z, radius, height, layer: "mid", seed });
    }

    // Far trees (14): silhouettes, heavily fogged
    for (let i = 0; i < 14; i++) {
      const seed = (i + 50) * 3.71 + 25;
      const x = (seededRand(seed) - 0.5) * 30;
      const z = -(seededRand(seed + 1) * 15 + 22);
      const radius = 0.05 + seededRand(seed + 2) * 0.05;
      const height = 4 + seededRand(seed + 3) * 6;
      items.push({ x, z, radius, height, layer: "far", seed });
    }

    return items;
  }, []);

  return (
    <group>
      {treeData.map((tree, i) => (
        <TreeTrunk key={i} {...tree} />
      ))}
    </group>
  );
};

// ─── Forest Ground ───
const ForestGround: React.FC = () => {
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), []);

  const { dynamicTime } = useAudioData();
  uniforms.uTime.value = dynamicTime;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -15]}>
      <planeGeometry args={[60, 60]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          varying vec3 vWorldPos;
          void main() {
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          precision highp float;
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vWorldPos;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          // Simple noise for leaf litter texture
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          void main() {
            // Leaf litter via layered noise
            float n1 = noise(vWorldPos.xz * 1.5 + uTime * 0.01);
            float n2 = noise(vWorldPos.xz * 4.0 + 20.0) * 0.5;
            float leaves = n1 + n2;

            vec3 soil = vec3(0.03, 0.04, 0.02);
            vec3 litter = vec3(0.08, 0.06, 0.03);
            vec3 col = mix(soil, litter, leaves * 0.5 + 0.25);

            // Slight green tint from moss
            col += vec3(0.0, 0.01, 0.0) * noise(vWorldPos.xz * 3.0);

            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  );
};

// ─── Dark Canopy (overhead plane with noise holes) ───
const Canopy: React.FC = () => {
  const { smooth, dynamicTime } = useAudioData();

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uEnergy: { value: 0 },
    uHarmonicTension: { value: 0 },
  }), []);

  uniforms.uTime.value = dynamicTime;
  uniforms.uEnergy.value = smooth.energy;
  uniforms.uHarmonicTension.value = smooth.harmonicTension;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 8, -15]}>
      <planeGeometry args={[60, 60]} />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          precision highp float;
          uniform float uTime;
          uniform float uEnergy;
          uniform float uHarmonicTension;
          varying vec2 vUv;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          void main() {
            vec2 uv = vUv * 4.0;
            float t = uTime * 0.02;

            // Multi-octave noise for canopy holes
            float n = noise(uv * 2.0 + t);
            n += noise(uv * 5.0 + t * 1.3 + uHarmonicTension * 0.2) * 0.5;
            n += noise(uv * 11.0 - t * 0.5) * 0.25;
            n /= 1.75;

            // More holes as energy increases (canopy opens up)
            float holeCutoff = mix(0.55, 0.3, uEnergy);
            float alpha = smoothstep(holeCutoff, holeCutoff + 0.15, n);

            // Dark green canopy
            vec3 canopyColor = vec3(0.02, 0.04, 0.02);

            gl_FragColor = vec4(canopyColor, alpha * 0.85);
          }
        `}
      />
    </mesh>
  );
};

// ─── Light Shafts (diagonal planes with additive blending) ───
const LightShafts: React.FC = () => {
  const { smooth, dynamicTime } = useAudioData();
  const otherEnergy = smooth.otherEnergy;
  const energy = smooth.energy;
  const melodicPitch = smooth.melodicPitch;
  const vocalPresence = smooth.vocalPresence;

  const shaftData = useMemo(() => {
    return [
      { x: -3, angle: 0.35, seed: 1 },
      { x: 1, angle: 0.25, seed: 2 },
      { x: 4, angle: 0.4, seed: 3 },
      { x: -6, angle: 0.3, seed: 4 },
    ];
  }, []);

  // Shaft opacity from guitar/other stem + energy
  const intensity = otherEnergy * 0.6 + energy * 0.3;

  return (
    <group>
      {shaftData.map(({ x, angle, seed }) => {
        const shaftAngle = angle + melodicPitch * 0.2;
        const opacity = intensity * (0.15 + seededRand(seed * 43.7) * 0.1);

        // Warm/cool color shift based on vocals
        const r = 0.9 + vocalPresence * 0.1;
        const g = 0.8 - vocalPresence * 0.1;
        const b = 0.3 + (1 - vocalPresence) * 0.2;

        return (
          <mesh
            key={seed}
            position={[x, 5, -(5 + seed * 3)]}
            rotation={[0, 0, shaftAngle]}
          >
            <planeGeometry args={[0.8, 12]} />
            <meshBasicMaterial
              color={new THREE.Color(r, g, b)}
              transparent
              opacity={Math.min(0.4, opacity)}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
};

// ─── Fireflies (Points geometry) ───
const Fireflies: React.FC = () => {
  const { smooth, dynamicTime } = useAudioData();
  const highs = smooth.highs;
  const onset = smooth.onsetSnap;
  const vocalPresence = smooth.vocalPresence;

  const maxCount = 80;
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(maxCount * 3);
    for (let i = 0; i < maxCount; i++) {
      arr[i * 3] = (seededRand(i * 73.1 + 19.3) - 0.5) * 20;
      arr[i * 3 + 1] = seededRand(i * 41.7 + 83.1) * 5 + 0.5;
      arr[i * 3 + 2] = -(seededRand(i * 97.3 + 47.9) * 25);
    }
    return arr;
  }, []);

  const colors = useMemo(() => new Float32Array(maxCount * 3), []);

  // Active count based on highs
  const activeCount = Math.floor(Math.min(maxCount, highs * 50 + onset * 20 + 5));

  // Animate positions and colors
  if (ref.current) {
    const posAttr = ref.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = ref.current.geometry.getAttribute("color") as THREE.BufferAttribute;

    for (let i = 0; i < maxCount; i++) {
      const seed1 = seededRand(i * 73.1 + 19.3);
      const seed2 = seededRand(i * 41.7 + 83.1);
      const seed3 = seededRand(i * 97.3 + 47.9);

      const baseX = (seed1 - 0.5) * 20;
      const baseY = seed2 * 5 + 0.5;
      const baseZ = -(seed3 * 25);

      // Drifting paths
      const t = dynamicTime * 0.06;
      const dx = Math.sin(t * 0.7 + i * 2) * 0.8;
      const dy = Math.cos(t * 0.5 + i * 1.5) * 0.4;
      const dz = Math.sin(t * 0.3 + i * 1.1) * 0.6;

      posAttr.setXYZ(i, baseX + dx, baseY + dy, baseZ + dz);

      // Pulsing brightness
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(t * (1.5 + seed3 * 2) + i * 3), 2);

      if (i < activeCount) {
        // Yellow-green color, warm with vocals
        const r = (0.6 + vocalPresence * 0.3) * pulse;
        const g = (0.8 - vocalPresence * 0.1) * pulse;
        const b = (0.2 + (1 - vocalPresence) * 0.1) * pulse;
        colAttr.setXYZ(i, r, g, b);
      } else {
        colAttr.setXYZ(i, 0, 0, 0);
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={maxCount}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          array={colors}
          count={maxCount}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        vertexColors
        transparent
        opacity={0.9}
        depthWrite={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

// ─── Fog Controller ───
const FogController: React.FC = () => {
  const { scene } = useThree();
  const { smooth } = useAudioData();
  const energy = smooth.energy;

  // Dense fog at rest, clears at peaks (INVERSE energy)
  const fogDensity = 0.08 - energy * energy * 0.06; // quadratic clear at peaks
  const fogColor = new THREE.Color(0.08, 0.12, 0.16);

  // Apply FogExp2
  if (!scene.fog || !(scene.fog instanceof THREE.FogExp2)) {
    scene.fog = new THREE.FogExp2(fogColor.getHex(), fogDensity);
  } else {
    scene.fog.density = Math.max(0.005, fogDensity);
    scene.fog.color.copy(fogColor);
  }

  // Background color matches fog
  scene.background = fogColor;

  return null;
};

// ─── Camera Controller ───
const CameraController: React.FC = () => {
  const { camera } = useThree();
  const { smooth, dynamicTime } = useAudioData();
  const slowEnergy = smooth.slowEnergy;

  // Position: walking through forest
  const driftSpeed = 0.02 + slowEnergy * 0.015;
  const driftZ = -(3 + dynamicTime * driftSpeed * 0.5);
  const driftX = Math.sin(dynamicTime * 0.03) * 0.3;

  camera.position.set(driftX, 1.5, Math.max(-30, driftZ));
  camera.lookAt(driftX * 0.5, 1.0, camera.position.z - 8);

  return null;
};

// ─── Main Inner Scene ───
const ForestInner: React.FC = () => {
  const { smooth } = useAudioData();
  const vocalPresence = smooth.vocalPresence;

  // Ambient light: cool blue-green, warm amber with vocals
  const ambientR = 0.05 + vocalPresence * 0.1;
  const ambientG = 0.08 - vocalPresence * 0.02;
  const ambientB = 0.1 - vocalPresence * 0.05;

  return (
    <>
      <CameraController />
      <FogController />

      {/* Ambient: cool at rest, warm with vocals */}
      <ambientLight intensity={0.2} color={new THREE.Color(ambientR, ambientG, ambientB)} />
      {/* Overhead dim green-filtered light */}
      <directionalLight position={[2, 10, -5]} intensity={0.15} color="#304020" />

      <ForestGround />
      <Trees />
      <Canopy />
      <LightShafts />
      <Fireflies />
    </>
  );
};

// ─── Exported Scene Wrapper ───
interface Props {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  jamDensity?: number;
}

export const ForestScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <ForestInner />
    </AudioReactiveCanvas>
  );
};
