/**
 * SpaceDrums — Abstract cosmic dissolution for Space/Drums jams.
 * Central void with orbiting debris, feedback spirals, spectral smears.
 * Low-energy, contemplative, weird. Deep purple/indigo/black palette.
 * 85s cycle, 20s visible. Inverted energy gate: fades OUT above 0.25.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Particle {
  radius: number;
  angle: number;
  speed: number;
  size: number;
  hue: number;
  phase: number;
}

interface Spiral {
  baseAngle: number;
  rotSpeed: number;
  arms: number;
  hue: number;
}

const NUM_PARTICLES = 30;
const NUM_SPIRALS = 3;
const NUM_SMEAR_BANDS = 7;
const CYCLE = 2550;    // 85 seconds at 30fps
const DURATION = 600;  // 20 seconds at 30fps

function generateParticles(seed: number): Particle[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_PARTICLES }, () => ({
    radius: 80 + rng() * 280,
    angle: rng() * Math.PI * 2,
    speed: 0.2 + rng() * 0.8,
    size: 1 + rng() * 4,
    hue: 250 + rng() * 50,   // deep purple to indigo
    phase: rng() * Math.PI * 2,
  }));
}

function generateSpirals(seed: number): Spiral[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_SPIRALS }, () => ({
    baseAngle: rng() * Math.PI * 2,
    rotSpeed: 0.1 + rng() * 0.3,
    arms: 2 + Math.floor(rng() * 2),
    hue: 240 + rng() * 40,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SpaceDrums: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Smooth energy (151-frame window)
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Sub-bass energy (31-frame window) — drives void size
  let subSum = 0;
  let subCount = 0;
  for (let i = Math.max(0, idx - 15); i <= Math.min(frames.length - 1, idx + 15); i++) {
    subSum += frames[i].sub;
    subCount++;
  }
  const subEnergy = subCount > 0 ? subSum / subCount : 0;

  // Current onset strength for debris speed
  const onset = frames[idx].onset;

  // Flatness for spiral opacity
  const flatness = frames[idx].flatness;

  // Contrast array for spectral smear bands
  const contrast = frames[idx].contrast;

  // Memoize procedural generation
  const particles = React.useMemo(() => generateParticles(77_001), []);
  const spirals = React.useMemo(() => generateSpirals(77_002), []);

  // Cycle timing
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade envelope: 10% in, hold, 10% out
  const envelope = interpolate(progress, [0, 0.1, 0.85, 1], [0, 0.85, 0.85, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Inverted energy gate: fades OUT above 0.25
  const energyGate = interpolate(energy, [0.15, 0.25], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Low opacity ceiling: 0.4 max
  const opacity = Math.min(envelope * energyGate, 0.4);
  if (opacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;

  // Central void radius: sub-bass driven (60-180px)
  const voidRadius = interpolate(subEnergy, [0.02, 0.3], [60, 180], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Form scale (entrance animation)
  const formScale = interpolate(progress, [0, 0.15], [0.2, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Debris orbit speed multiplier from onset
  const orbitMult = 1 + onset * 3;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          {/* Central void gradient */}
          <radialGradient id="sd-void" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000" stopOpacity="1" />
            <stop offset="60%" stopColor="#0a0015" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#1a0030" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Spectral smear bands — 7 bands colored by contrast array */}
        {Array.from({ length: NUM_SMEAR_BANDS }, (_, bi) => {
          const bandHeight = height / NUM_SMEAR_BANDS;
          const y = bi * bandHeight;
          const bandEnergy = contrast[bi];
          const hue = 240 + bi * 15; // indigo through violet
          const bandOpacity = bandEnergy * 0.25;
          const heightMod = bandHeight * (0.5 + bandEnergy * 0.5);

          return (
            <rect
              key={`smear-${bi}`}
              x={0}
              y={y + (bandHeight - heightMod) / 2}
              width={width}
              height={heightMod}
              fill={`hsla(${hue}, 60%, 20%, ${bandOpacity})`}
              style={{ filter: `blur(${20 + bandEnergy * 30}px)` }}
            />
          );
        })}

        {/* Logarithmic spirals */}
        {spirals.map((spiral, si) => {
          const rotation = cycleFrame * spiral.rotSpeed * 0.02;
          const spiralOpacity = 0.1 + flatness * 0.2;
          const points: string[] = [];

          for (let arm = 0; arm < spiral.arms; arm++) {
            const armOffset = (arm / spiral.arms) * Math.PI * 2;
            for (let t = 0; t < 200; t += 2) {
              const theta = t * 0.05 + spiral.baseAngle + armOffset + rotation;
              const r = 30 + t * 1.8; // logarithmic-ish expansion
              const sx = cx + Math.cos(theta) * r * formScale;
              const sy = cy + Math.sin(theta) * r * formScale;
              points.push(`${sx},${sy}`);
            }
          }

          return (
            <polyline
              key={`spiral-${si}`}
              points={points.join(" ")}
              fill="none"
              stroke={`hsla(${spiral.hue}, 50%, 40%, ${spiralOpacity})`}
              strokeWidth={1.5}
              style={{ filter: `blur(2px) drop-shadow(0 0 6px hsla(${spiral.hue}, 80%, 50%, 0.3))` }}
            />
          );
        })}

        {/* Orbiting debris particles */}
        {particles.map((p, pi) => {
          const angle = p.angle + cycleFrame * p.speed * 0.005 * orbitMult + p.phase;
          const wobble = Math.sin(cycleFrame * 0.02 + p.phase) * 15;
          const r = (p.radius + wobble) * formScale;

          // Skip particles too close to void
          if (r < voidRadius * 0.7 * formScale) return null;

          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r;

          // Distance-based fading (closer to edge = fainter)
          const maxR = Math.min(width, height) * 0.45;
          const distFade = r > maxR ? 0 : 1 - (r / maxR) * 0.5;

          return (
            <circle
              key={`particle-${pi}`}
              cx={px}
              cy={py}
              r={p.size * formScale}
              fill={`hsla(${p.hue}, 60%, 50%, ${0.4 * distFade})`}
              style={{ filter: `drop-shadow(0 0 ${p.size + 2}px hsla(${p.hue}, 80%, 60%, 0.3))` }}
            />
          );
        })}

        {/* Central void */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * 1.8 * formScale}
          fill="url(#sd-void)"
        />
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * formScale}
          fill="#000"
        />

        {/* Void edge ring */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * formScale}
          fill="none"
          stroke={`hsla(270, 60%, 35%, ${0.15 + subEnergy * 0.2})`}
          strokeWidth={1.5}
          style={{ filter: `drop-shadow(0 0 8px hsla(270, 80%, 40%, 0.2))` }}
        />
      </svg>
    </div>
  );
};
