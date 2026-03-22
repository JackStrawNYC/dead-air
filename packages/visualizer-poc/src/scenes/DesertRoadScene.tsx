/**
 * DesertRoadScene — 3D endless highway through desert landscape.
 * Built with React Three Fiber geometry: PlaneGeometry road, Box dash lines,
 * BoxGeometry mesas, CylinderGeometry telephone poles, Line catenary wires.
 *
 * Audio: energy->speed, onset->dust puffs, bass->heat shimmer, chromaHue->sky color
 */

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { AudioReactiveCanvas, useAudioData } from "../components/AudioReactiveCanvas";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";

// ─── Helper: HSV to RGB ───
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

// ─── Seeded random for deterministic placement ───
function seededRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Sky Background ───
const SkyPlane: React.FC = () => {
  const { smooth, dynamicTime } = useAudioData();
  const energy = smooth.energy;
  const chromaHue = smooth.chromaHue;
  const slowEnergy = smooth.slowEnergy;

  const shaderRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uEnergy: { value: 0 },
    uChromaHue: { value: 0 },
    uSlowEnergy: { value: 0 },
    uTime: { value: 0 },
    uHighs: { value: 0 },
  }), []);

  uniforms.uEnergy.value = energy;
  uniforms.uChromaHue.value = chromaHue;
  uniforms.uSlowEnergy.value = slowEnergy;
  uniforms.uTime.value = dynamicTime;
  uniforms.uHighs.value = smooth.highs;

  return (
    <mesh position={[0, 15, -100]} rotation={[0, 0, 0]}>
      <planeGeometry args={[300, 80]} />
      <shaderMaterial
        ref={shaderRef}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          precision highp float;
          uniform float uEnergy;
          uniform float uChromaHue;
          uniform float uSlowEnergy;
          uniform float uTime;
          uniform float uHighs;
          varying vec2 vUv;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          void main() {
            float skyBrightness = mix(0.15, 1.0, uSlowEnergy * 0.6 + uEnergy * 0.4);
            float hueShift = uChromaHue * 0.15;

            // Sunset gradient
            vec3 skyTop = mix(
              vec3(0.02, 0.01, 0.06),
              vec3(0.15 + hueShift, 0.08, 0.35 - hueShift),
              skyBrightness
            );
            vec3 skyMid = mix(
              vec3(0.03, 0.02, 0.08),
              vec3(0.85 + hueShift * 0.5, 0.35 + hueShift, 0.15),
              skyBrightness
            );
            vec3 skyHorizon = mix(
              vec3(0.04, 0.03, 0.05),
              vec3(1.0, 0.65 + hueShift, 0.2 + hueShift * 0.3),
              skyBrightness
            );

            float t = vUv.y;
            vec3 col = mix(skyHorizon, skyMid, smoothstep(0.0, 0.3, t));
            col = mix(col, skyTop, smoothstep(0.3, 0.8, t));

            // Sun glow at horizon center
            float sunDist = length(vec2((vUv.x - 0.5) * 2.0, vUv.y * 0.5));
            float sunGlow = exp(-sunDist * 4.0) * skyBrightness * 0.6;
            col += vec3(1.0, 0.75, 0.3) * sunGlow;

            // Stars at low energy
            float nightFactor = smoothstep(0.4, 0.1, uSlowEnergy) * smoothstep(0.3, 0.05, uEnergy);
            if (nightFactor > 0.01 && t > 0.2) {
              vec2 cell = floor(vUv * 120.0);
              float h1 = hash(cell);
              float h2 = hash(cell + 100.0);
              float hasStar = step(0.82, h1);
              float twinkle = 0.6 + 0.4 * sin(uTime * 2.5 + h2 * 60.0);
              vec2 starPos = vec2(h1, h2);
              float dist = length(fract(vUv * 120.0) - starPos);
              float star = hasStar * h2 * smoothstep(0.03, 0.005, dist) * twinkle;
              col += vec3(0.9, 0.85, 1.0) * star * nightFactor * 0.5;
            }

            gl_FragColor = vec4(col, 1.0);
          }
        `}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// ─── Road Surface ───
const Road: React.FC = () => {
  const { smooth, dynamicTime } = useAudioData();
  const bass = smooth.bass;

  const shaderRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uBass: { value: 0 },
    uTime: { value: 0 },
  }), []);

  uniforms.uBass.value = bass;
  uniforms.uTime.value = dynamicTime;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -50]}>
      <planeGeometry args={[8, 200]} />
      <shaderMaterial
        ref={shaderRef}
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
          uniform float uBass;
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vWorldPos;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          void main() {
            // Asphalt texture
            float noise = hash(floor(vWorldPos.xz * 8.0)) * 0.04;
            vec3 asphalt = vec3(0.08, 0.07, 0.06) + noise;

            // Heat shimmer distortion at distance
            float dist = 1.0 - vUv.y; // 0=near, 1=far
            float shimmer = sin(vWorldPos.z * 2.0 + uTime * 4.0) * uBass * 0.02 * dist;
            asphalt += shimmer;

            // Edge lines (white)
            float edgeL = smoothstep(0.02, 0.025, abs(vUv.x - 0.05));
            float edgeR = smoothstep(0.02, 0.025, abs(vUv.x - 0.95));
            float edgeMask = (1.0 - edgeL) + (1.0 - edgeR);
            asphalt = mix(asphalt, vec3(0.6), edgeMask * 0.5);

            gl_FragColor = vec4(asphalt, 1.0);
          }
        `}
      />
    </mesh>
  );
};

// ─── Center Line Dashes ───
const CenterLineDashes: React.FC = () => {
  const { smooth, dynamicTime, tempo } = useAudioData();
  const speed = (tempo / 120) * (0.5 + smooth.energy * 1.5);

  const dashes = useMemo(() => {
    const items: { z: number; key: number }[] = [];
    for (let i = 0; i < 30; i++) {
      items.push({ z: -i * 5, key: i });
    }
    return items;
  }, []);

  const offset = (dynamicTime * speed * 8) % 5;

  return (
    <group>
      {dashes.map(({ z, key }) => {
        const dashZ = z + offset;
        if (dashZ > 5 || dashZ < -150) return null;
        return (
          <mesh key={key} position={[0, 0.02, dashZ]} rotation={[-Math.PI / 2, 0, 0]}>
            <boxGeometry args={[0.15, 2.5, 0.01]} />
            <meshBasicMaterial color="#e6d94a" />
          </mesh>
        );
      })}
    </group>
  );
};

// ─── Desert Ground (both sides of road) ───
const DesertGround: React.FC = () => {
  const { smooth } = useAudioData();

  const uniforms = useMemo(() => ({
    uEnergy: { value: 0 },
  }), []);

  uniforms.uEnergy.value = smooth.energy;

  return (
    <>
      {/* Left ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-30, -0.05, -50]}>
        <planeGeometry args={[60, 200]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={`
            varying vec2 vUv;
            varying vec3 vWorldPos;
            uniform float uEnergy;
            void main() {
              vUv = uv;
              vec4 wp = modelMatrix * vec4(position, 1.0);
              // Slight noise displacement
              float h = sin(wp.x * 0.5) * cos(wp.z * 0.3) * 0.2;
              vec3 pos = position;
              pos.z += h;
              vWorldPos = wp.xyz;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
          `}
          fragmentShader={`
            precision highp float;
            uniform float uEnergy;
            varying vec2 vUv;
            varying vec3 vWorldPos;

            float hash(vec2 p) {
              return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }

            void main() {
              float n = hash(floor(vWorldPos.xz * 2.0)) * 0.15;
              vec3 sand = vec3(0.55, 0.42, 0.28) * (0.6 + n);
              // Dust at distance
              float dist = 1.0 - vUv.y;
              sand = mix(sand, vec3(0.7, 0.55, 0.35), dist * 0.3);
              gl_FragColor = vec4(sand, 1.0);
            }
          `}
        />
      </mesh>
      {/* Right ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[30, -0.05, -50]}>
        <planeGeometry args={[60, 200]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={`
            varying vec2 vUv;
            varying vec3 vWorldPos;
            uniform float uEnergy;
            void main() {
              vUv = uv;
              vec4 wp = modelMatrix * vec4(position, 1.0);
              float h = sin(wp.x * 0.4) * cos(wp.z * 0.25) * 0.15;
              vec3 pos = position;
              pos.z += h;
              vWorldPos = wp.xyz;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
          `}
          fragmentShader={`
            precision highp float;
            uniform float uEnergy;
            varying vec2 vUv;
            varying vec3 vWorldPos;

            float hash(vec2 p) {
              return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }

            void main() {
              float n = hash(floor(vWorldPos.xz * 2.0 + 50.0)) * 0.15;
              vec3 sand = vec3(0.55, 0.42, 0.28) * (0.6 + n);
              float dist = 1.0 - vUv.y;
              sand = mix(sand, vec3(0.7, 0.55, 0.35), dist * 0.3);
              gl_FragColor = vec4(sand, 1.0);
            }
          `}
        />
      </mesh>
    </>
  );
};

// ─── Mesa / Butte ───
interface MesaProps {
  position: [number, number, number];
  baseWidth: number;
  topWidth: number;
  height: number;
  color: THREE.Color;
}

const Mesa: React.FC<MesaProps> = ({ position, baseWidth, topWidth, height, color }) => {
  const geometry = useMemo(() => {
    // Trapezoid cross-section extruded
    const hw = baseWidth / 2;
    const tw = topWidth / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-hw, 0);
    shape.lineTo(hw, 0);
    shape.lineTo(tw, height);
    shape.lineTo(-tw, height);
    shape.closePath();
    const extrudeSettings = { depth: baseWidth * 0.8, bevelEnabled: false };
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, [baseWidth, topWidth, height]);

  return (
    <mesh position={position} geometry={geometry}>
      <meshBasicMaterial color={color} />
    </mesh>
  );
};

// ─── Mesas Group ───
const Mesas: React.FC = () => {
  const { smooth } = useAudioData();

  const mesaData = useMemo(() => {
    const items: {
      pos: [number, number, number];
      bw: number;
      tw: number;
      h: number;
      color: THREE.Color;
      key: number;
    }[] = [];

    // Left side mesas (2-3)
    for (let i = 0; i < 3; i++) {
      const seed = i * 3.17 + 1.0;
      const x = -(15 + seededRand(seed) * 25);
      const z = -(20 + i * 30 + seededRand(seed + 1) * 15);
      const h = 5 + seededRand(seed + 2) * 12;
      const bw = 4 + seededRand(seed + 3) * 6;
      const tw = bw * (0.4 + seededRand(seed + 4) * 0.3);
      // Layered sandstone colors
      const rFactor = 0.45 + seededRand(seed + 5) * 0.25;
      const gFactor = 0.2 + seededRand(seed + 6) * 0.1;
      const color = new THREE.Color(rFactor, gFactor, 0.08);
      items.push({ pos: [x, 0, z], bw, tw, h, color, key: i });
    }

    // Right side mesas (2-3)
    for (let i = 0; i < 3; i++) {
      const seed = (i + 10) * 5.71 + 10.0;
      const x = 15 + seededRand(seed) * 25;
      const z = -(15 + i * 35 + seededRand(seed + 1) * 20);
      const h = 4 + seededRand(seed + 2) * 10;
      const bw = 3 + seededRand(seed + 3) * 5;
      const tw = bw * (0.5 + seededRand(seed + 4) * 0.3);
      const rFactor = 0.5 + seededRand(seed + 5) * 0.2;
      const gFactor = 0.22 + seededRand(seed + 6) * 0.08;
      const color = new THREE.Color(rFactor, gFactor, 0.06);
      items.push({ pos: [x, 0, z], bw, tw, h, color, key: i + 10 });
    }

    return items;
  }, []);

  return (
    <group>
      {mesaData.map(({ pos, bw, tw, h, color, key }) => (
        <Mesa key={key} position={pos} baseWidth={bw} topWidth={tw} height={h} color={color} />
      ))}
    </group>
  );
};

// ─── Single Telephone Pole ───
interface PoleProps {
  x: number;
  z: number;
}

const TelephonePole: React.FC<PoleProps> = ({ x, z }) => {
  const poleHeight = 6;
  const crossbarWidth = 2;

  // Wire catenary points between this pole and next
  const wirePoints = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const segments = 12;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const wx = x + (t - 0.5) * crossbarWidth * 3; // wire extends beyond crossbar
      const sag = 0.5 * (t - 0.5) * (t - 0.5) * 4; // catenary sag
      const wy = poleHeight * 0.85 - sag;
      pts.push(new THREE.Vector3(wx, wy, z));
    }
    return pts;
  }, [x, z]);

  const wireLine = useMemo(() => {
    const geom = new THREE.BufferGeometry().setFromPoints(wirePoints);
    const mat = new THREE.LineBasicMaterial({ color: "#0d0a08" });
    return new THREE.Line(geom, mat);
  }, [wirePoints]);

  return (
    <group>
      {/* Main pole */}
      <mesh position={[x, poleHeight / 2, z]}>
        <cylinderGeometry args={[0.08, 0.1, poleHeight, 6]} />
        <meshBasicMaterial color="#1a1210" />
      </mesh>
      {/* Crossbar */}
      <mesh position={[x, poleHeight * 0.85, z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, crossbarWidth, 4]} />
        <meshBasicMaterial color="#1a1210" />
      </mesh>
      {/* Wire (catenary) */}
      <primitive object={wireLine} />
    </group>
  );
};

// ─── Telephone Poles Group (scrolling with tempo) ───
const TelephonePoles: React.FC = () => {
  const { smooth, dynamicTime, tempo } = useAudioData();
  const speed = (tempo / 120) * (0.5 + smooth.energy * 1.5);

  const poleData = useMemo(() => {
    const items: { side: number; baseZ: number; key: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      items.push({ side, baseZ: -i * 18, key: i });
    }
    return items;
  }, []);

  const scrollOffset = (dynamicTime * speed * 5) % 18;

  return (
    <group>
      {poleData.map(({ side, baseZ, key }) => {
        const z = baseZ + scrollOffset;
        if (z > 10 || z < -200) return null;
        const x = side * 6;
        return <TelephonePole key={key} x={x} z={z} />;
      })}
    </group>
  );
};

// ─── Dust Puffs (onset-triggered particles) ───
const DustPuffs: React.FC = () => {
  const { smooth, dynamicTime } = useAudioData();
  const onset = smooth.onsetSnap;
  const energy = smooth.energy;

  const count = 40;
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (seededRand(i * 7.31) - 0.5) * 20;
      arr[i * 3 + 1] = seededRand(i * 3.17 + 10) * 2;
      arr[i * 3 + 2] = -(seededRand(i * 5.71 + 20) * 40);
    }
    return arr;
  }, []);

  const ref = useRef<THREE.Points>(null);

  // Animate dust positions based on time
  if (ref.current) {
    const posAttr = ref.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const baseX = (seededRand(i * 7.31) - 0.5) * 20;
      const baseY = seededRand(i * 3.17 + 10) * 2;
      const baseZ = -(seededRand(i * 5.71 + 20) * 40);
      const t = dynamicTime * 0.5 + i * 0.3;
      posAttr.setXYZ(
        i,
        baseX + Math.sin(t) * onset * 2,
        baseY + Math.abs(Math.sin(t * 0.7)) * energy * 1.5,
        baseZ + Math.cos(t * 0.4) * onset,
      );
    }
    posAttr.needsUpdate = true;
  }

  const opacity = Math.min(1, onset * 0.8 + energy * 0.3);

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.4}
        color="#c8a060"
        transparent
        opacity={opacity}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
};

// ─── Camera Controller ───
const CameraController: React.FC = () => {
  const { camera } = useThree();
  const { smooth, dynamicTime, tempo } = useAudioData();

  const speed = (tempo / 120) * (0.3 + smooth.energy * 0.7);

  // Position: driver seat looking down the road
  camera.position.set(0, 1.5, 0);
  camera.lookAt(0, 1.2, -100);

  // Slight forward motion illusion via FOV breathing
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.fov = 55 + smooth.energy * 8 + smooth.bass * 3;
    camera.updateProjectionMatrix();
  }

  return null;
};

// ─── Main Inner Scene ───
const DesertRoadInner: React.FC = () => {
  return (
    <>
      <CameraController />
      {/* Ambient light for basic visibility */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[0, 10, -50]} intensity={0.6} color="#ffa040" />

      <SkyPlane />
      <Road />
      <CenterLineDashes />
      <DesertGround />
      <Mesas />
      <TelephonePoles />
      <DustPuffs />

      {/* Atmospheric fog */}
      <fog attach="fog" args={["#c8906020", 30, 180]} />
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

export const DesertRoadScene: React.FC<Props> = ({ frames, sections, palette, tempo, style, jamDensity }) => {
  return (
    <AudioReactiveCanvas frames={frames} sections={sections} palette={palette} tempo={tempo} style={style} jamDensity={jamDensity}>
      <DesertRoadInner />
    </AudioReactiveCanvas>
  );
};
