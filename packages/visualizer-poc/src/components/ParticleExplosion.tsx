/**
 * ParticleExplosion — GPU-accelerated firework-style particle bursts on peak energy.
 *
 * When RMS spikes above 0.35 (checked every 15 frames), spawn a burst of
 * 150 particles at a random position. Particles fly outward in all
 * directions with gravity, drag, wind, and turbulence — all computed via
 * closed-form physics in the vertex shader (no per-frame CPU loop).
 *
 * Neon colors. Particles live 60-90 frames. Max 5 simultaneous bursts.
 * 5 × 150 = 750 points total — well within GPU budget.
 *
 * Remotion determinism: guaranteed — precomputeBursts is seeded,
 * vertex shader computes position purely from (age, initialConditions).
 */

import React, { useMemo } from "react";
import * as THREE from "three";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";
import { AudioReactiveCanvas, useAudioData } from "./AudioReactiveCanvas";
import { particleBurstVert, particleBurstFrag } from "../shaders/particle-burst";

const NEON_COLORS = [
  { h: 320, s: 100, l: 65 }, // hot pink
  { h: 160, s: 100, l: 55 }, // neon green
  { h: 45, s: 100, l: 60 },  // neon gold
  { h: 190, s: 100, l: 60 }, // cyan
  { h: 275, s: 100, l: 65 }, // violet
  { h: 0, s: 100, l: 60 },   // neon red
  { h: 210, s: 100, l: 65 }, // electric blue
];

interface ParticleData {
  vx: number;
  vy: number;
  size: number;
  colorIdx: number;
  lifetime: number;
  drag: number;
}

interface BurstData {
  cx: number;
  cy: number;
  particles: ParticleData[];
  paletteBase: number;
}

const CHECK_INTERVAL = 15;
const RMS_THRESHOLD = 0.35;
const MAX_BURSTS = 5;
const PARTICLES_PER_BURST = 150;
const GRAVITY = 0.003; // NDC units per frame^2

interface BurstEvent {
  frame: number;
  burst: BurstData;
}

function precomputeBursts(
  frames: EnhancedFrameData[],
  masterSeed: number,
): BurstEvent[] {
  const rng = seeded(masterSeed);
  const events: BurstEvent[] = [];

  for (let f = 0; f < frames.length; f += CHECK_INTERVAL) {
    if (frames[f].rms > RMS_THRESHOLD) {
      const activeBursts = events.filter(
        (e) => f - e.frame < 90,
      );
      if (activeBursts.length >= MAX_BURSTS) continue;

      const particles: ParticleData[] = Array.from({ length: PARTICLES_PER_BURST }, () => {
        const angle = rng() * Math.PI * 2;
        const speed = 0.01 + rng() * 0.04; // NDC velocity
        return {
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed + 0.005, // slight upward bias (positive Y is up in NDC)
          size: 3 + rng() * 6,
          colorIdx: Math.floor(rng() * NEON_COLORS.length),
          lifetime: 60 + Math.floor(rng() * 30),
          drag: 0.96 + rng() * 0.03,
        };
      });

      events.push({
        frame: f,
        burst: {
          cx: -0.7 + rng() * 1.4, // NDC X: -0.7 to 0.7
          cy: -0.3 + rng() * 0.6, // NDC Y: -0.3 to 0.3
          particles,
          paletteBase: Math.floor(rng() * NEON_COLORS.length),
        },
      });
    }
  }

  return events;
}

/** Inner Three.js component for a single burst — renders as <points> with BufferGeometry */
const BurstPoints: React.FC<{ burst: BurstData; age: number; bass: number; energy: number }> = ({
  burst,
  age,
  bass,
  energy,
}) => {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const count = burst.particles.length;
    const vxArr = new Float32Array(count);
    const vyArr = new Float32Array(count);
    const sizeArr = new Float32Array(count);
    const colorArr = new Float32Array(count);
    const lifetimeArr = new Float32Array(count);
    const dragArr = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const p = burst.particles[i];
      vxArr[i] = p.vx;
      vyArr[i] = p.vy;
      sizeArr[i] = p.size;
      colorArr[i] = p.colorIdx;
      lifetimeArr[i] = p.lifetime;
      dragArr[i] = p.drag;
    }

    // Dummy position attribute (required by Three.js but overridden in vertex shader)
    const posArr = new Float32Array(count * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("aVx", new THREE.BufferAttribute(vxArr, 1));
    geo.setAttribute("aVy", new THREE.BufferAttribute(vyArr, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizeArr, 1));
    geo.setAttribute("aColorIdx", new THREE.BufferAttribute(colorArr, 1));
    geo.setAttribute("aLifetime", new THREE.BufferAttribute(lifetimeArr, 1));
    geo.setAttribute("aDrag", new THREE.BufferAttribute(dragArr, 1));

    return geo;
  }, [burst.particles]);

  const uniforms = useMemo(() => ({
    uAge: { value: 0 },
    uOriginX: { value: burst.cx },
    uOriginY: { value: burst.cy },
    uGravity: { value: GRAVITY },
    uWindX: { value: 0 },
    uTurbulence: { value: 0 },
  }), [burst.cx, burst.cy]);

  // Update per-frame uniforms
  uniforms.uAge.value = age;
  uniforms.uWindX.value = bass * 0.5;
  uniforms.uTurbulence.value = energy;

  return (
    <points geometry={geometry}>
      <shaderMaterial
        vertexShader={particleBurstVert}
        fragmentShader={particleBurstFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

/** Inner wrapper that reads audio data for wind/turbulence uniforms */
const BurstRenderer: React.FC<{ burstEvents: BurstEvent[] }> = ({ burstEvents }) => {
  const frame = useCurrentFrame();
  const { smooth } = useAudioData();

  const activeBursts = burstEvents.filter(
    (e) => frame >= e.frame && frame < e.frame + 90,
  );

  if (activeBursts.length === 0) return null;

  return (
    <>
      {activeBursts.map((event) => (
        <BurstPoints
          key={event.frame}
          burst={event.burst}
          age={frame - event.frame}
          bass={smooth.bass}
          energy={smooth.energy}
        />
      ))}
    </>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const ParticleExplosion: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const ctx = useShowContext();

  const burstEvents = useMemo(
    () => precomputeBursts(frames, ctx?.showSeed ?? 19770508),
    [frames, ctx?.showSeed],
  );

  // Early return if no active bursts (avoid mounting Canvas unnecessarily)
  const hasActive = burstEvents.some(
    (e) => frame >= e.frame && frame < e.frame + 90,
  );
  if (!hasActive) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <AudioReactiveCanvas frames={frames}>
        <BurstRenderer burstEvents={burstEvents} />
      </AudioReactiveCanvas>
    </div>
  );
};
