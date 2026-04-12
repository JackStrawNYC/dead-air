/**
 * RainbowArc — A+++ overlay.
 * A massive rainbow arc spanning the frame. 7-color spectrum with smooth
 * gradient. Misty atmosphere. Mountains/landscape at the bottom. Birds flying.
 * Sun rays through clouds. The rainbow IS the centerpiece.
 *
 * Audio reactivity:
 *   slowEnergy → sky warmth + cloud bloom
 *   energy     → arc brightness
 *   bass       → arc thickness pulse
 *   beatDecay  → bird flap
 *   onsetEnvelope → arc shimmer
 *   chromaHue  → tint shift across arc
 *   tempoFactor → cloud + bird drift
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const CLOUD_COUNT = 12;
const BIRD_COUNT = 7;
const SPARKLE_COUNT = 50;
const RAY_COUNT = 8;

interface Cloud {
  x: number;
  y: number;
  rx: number;
  ry: number;
  drift: number;
  shade: number;
}
interface Bird {
  x: number;
  y: number;
  speed: number;
  size: number;
  phase: number;
}
interface Sparkle {
  angleT: number;
  radiusOffset: number;
  speed: number;
  size: number;
  phase: number;
}

function buildClouds(): Cloud[] {
  const rng = seeded(72_881_991);
  return Array.from({ length: CLOUD_COUNT }, () => ({
    x: rng(),
    y: 0.05 + rng() * 0.25,
    rx: 0.10 + rng() * 0.18,
    ry: 0.03 + rng() * 0.06,
    drift: 0.0001 + rng() * 0.0003,
    shade: 0.18 + rng() * 0.34,
  }));
}

function buildBirds(): Bird[] {
  const rng = seeded(33_881_447);
  return Array.from({ length: BIRD_COUNT }, () => ({
    x: rng(),
    y: 0.20 + rng() * 0.30,
    speed: 0.0006 + rng() * 0.0014,
    size: 8 + rng() * 6,
    phase: rng() * Math.PI * 2,
  }));
}

function buildSparkles(): Sparkle[] {
  const rng = seeded(98_119_553);
  return Array.from({ length: SPARKLE_COUNT }, () => ({
    angleT: rng(),
    radiusOffset: -8 + rng() * 16,
    speed: 0.018 + rng() * 0.04,
    size: 1.0 + rng() * 2.4,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const RainbowArc: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const clouds = React.useMemo(buildClouds, []);
  const birds = React.useMemo(buildBirds, []);
  const sparkles = React.useMemo(buildSparkles, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const skyWarmth = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const arcBright = interpolate(snap.energy, [0.02, 0.32], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const arcThick = 1 + snap.bass * 0.30;
  const flap = Math.sin(frame * 0.18 * tempoFactor) * (4 + snap.beatDecay * 6);
  const shimmerBurst = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Palette modulation
  const tintHue = ((snap.chromaHue) % 360 + 360) % 360;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 60%, 38%)`;
  const skyMid = `hsl(${(tintHue + 30) % 360}, 50%, 60%)`;
  const skyBot = `hsl(${(tintHue + 60) % 360}, 50%, 70%)`;
  const cloudColor = `hsl(${(tintHue + 30) % 360}, 30%, 88%)`;

  // Hero geometry — large arc
  const cx = width / 2;
  const cy = height * 0.85;
  const arcRadius = Math.min(width, height) * 0.55;
  const arcThickness = 16 * arcThick;

  // Rainbow colors (ROYGBIV) — outer to inner
  const rainbowColors = [
    `hsl(${(tintHue + 0) % 360}, 90%, 55%)`,    // red
    `hsl(${(tintHue + 25) % 360}, 95%, 60%)`,   // orange
    `hsl(${(tintHue + 50) % 360}, 95%, 60%)`,   // yellow
    `hsl(${(tintHue + 100) % 360}, 80%, 50%)`,  // green
    `hsl(${(tintHue + 200) % 360}, 90%, 55%)`,  // blue
    `hsl(${(tintHue + 240) % 360}, 70%, 55%)`,  // indigo
    `hsl(${(tintHue + 280) % 360}, 80%, 60%)`,  // violet
  ];

  // Clouds
  const cloudNodes = clouds.map((c, i) => {
    const drift = (c.x + frame * c.drift * tempoFactor) % 1.2 - 0.1;
    return (
      <g key={`cl-${i}`}>
        <ellipse cx={drift * width} cy={c.y * height}
          rx={c.rx * width * 1.2} ry={c.ry * height * 1.2}
          fill={cloudColor} opacity={0.25 * skyWarmth} />
        <ellipse cx={drift * width} cy={c.y * height}
          rx={c.rx * width * 0.9} ry={c.ry * height * 0.9}
          fill="rgba(255, 255, 255, 0.85)" opacity={0.55 * skyWarmth} />
      </g>
    );
  });

  // Sun rays through clouds
  const sunCx = width * 0.78;
  const sunCy = height * 0.18;
  const sunRays: React.ReactNode[] = [];
  for (let r = 0; r < RAY_COUNT; r++) {
    const a = (r / RAY_COUNT) * Math.PI * 2;
    const x2 = Math.cos(a) * width * 0.5;
    const y2 = Math.sin(a) * height * 0.5;
    sunRays.push(
      <g key={`sr-${r}`}>
        <path d={`M 0 0 L ${x2 - 16} ${y2} L ${x2 + 16} ${y2} Z`}
          fill="rgba(255, 245, 200, 0.10)" opacity={0.5 * skyWarmth} />
      </g>
    );
  }

  // Sparkles along arc
  const sparkleNodes = sparkles.map((s, i) => {
    const t = frame * s.speed + s.phase;
    const flicker = 0.55 + Math.sin(t * 2.1) * 0.4;
    const angT = (s.angleT + frame * 0.0005) % 1;
    const ang = Math.PI * (1 + angT); // top half
    const r = arcRadius + s.radiusOffset;
    const sx = cx + Math.cos(ang) * r;
    const sy = cy + Math.sin(ang) * r;
    return (
      <circle key={`sp-${i}`} cx={sx} cy={sy} r={s.size * (0.7 + arcBright * 0.5)}
        fill="rgba(255, 255, 255, 0.95)" opacity={0.65 * flicker * arcBright} />
    );
  });

  // Birds
  const birdNodes = birds.map((b, i) => {
    const drift = (b.x + frame * b.speed * tempoFactor) % 1.2 - 0.1;
    const bx = drift * width;
    const by = b.y * height + Math.sin(frame * 0.04 + b.phase) * 4;
    const wingFlap = flap + Math.sin(frame * 0.18 + b.phase) * 6;
    return (
      <g key={`bird-${i}`} transform={`translate(${bx}, ${by})`}>
        <path d={`M ${-b.size} 0 Q ${-b.size * 0.5} ${-b.size * 0.4 - wingFlap * 0.3} 0 0
          Q ${b.size * 0.5} ${-b.size * 0.4 - wingFlap * 0.3} ${b.size} 0`}
          stroke="rgba(20, 20, 30, 0.85)" strokeWidth={2.2} fill="none" strokeLinecap="round" />
        <path d={`M ${-b.size} 0 Q ${-b.size * 0.5} ${-b.size * 0.4 - wingFlap * 0.3} 0 0
          Q ${b.size * 0.5} ${-b.size * 0.4 - wingFlap * 0.3} ${b.size} 0`}
          stroke="rgba(40, 30, 50, 0.6)" strokeWidth={1} fill="none" strokeLinecap="round" />
      </g>
    );
  });

  // Mountain ridge
  const mountainPath = `M 0 ${height}
    L 0 ${height * 0.78}
    L ${width * 0.10} ${height * 0.74}
    L ${width * 0.20} ${height * 0.78}
    L ${width * 0.32} ${height * 0.66}
    L ${width * 0.42} ${height * 0.74}
    L ${width * 0.55} ${height * 0.62}
    L ${width * 0.66} ${height * 0.72}
    L ${width * 0.76} ${height * 0.66}
    L ${width * 0.86} ${height * 0.74}
    L ${width} ${height * 0.70}
    L ${width} ${height} Z`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="ra-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <radialGradient id="ra-sun-glow">
            <stop offset="0%" stopColor="rgba(255, 250, 200, 0.6)" />
            <stop offset="50%" stopColor="rgba(255, 220, 140, 0.25)" />
            <stop offset="100%" stopColor="rgba(255, 220, 140, 0)" />
          </radialGradient>
          <linearGradient id="ra-mountain" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(60, 50, 80, 0.85)" />
            <stop offset="100%" stopColor="rgba(20, 18, 30, 0.95)" />
          </linearGradient>
          <linearGradient id="ra-mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(230, 230, 240, 0)" />
            <stop offset="100%" stopColor="rgba(230, 230, 240, 0.6)" />
          </linearGradient>
        </defs>

        <rect width={width} height={height} fill="url(#ra-sky)" />

        {/* Sun glow */}
        <circle cx={sunCx} cy={sunCy} r={140 * skyWarmth} fill="url(#ra-sun-glow)" />
        <g transform={`translate(${sunCx}, ${sunCy})`} style={{ mixBlendMode: "screen" }}>
          {sunRays}
        </g>
        <circle cx={sunCx} cy={sunCy} r={26} fill="rgba(255, 250, 220, 0.92)" />
        <circle cx={sunCx} cy={sunCy} r={18} fill="rgba(255, 255, 240, 1)" />

        {/* Clouds */}
        {cloudNodes}

        {/* Rainbow arc — 7 colors, 3 layers each */}
        {rainbowColors.map((color, i) => {
          const r = arcRadius - i * arcThickness;
          return (
            <g key={`band-${i}`}>
              {/* Outer glow */}
              <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none" stroke={color} strokeWidth={arcThickness * 1.6} strokeLinecap="round"
                opacity={0.10 * arcBright} />
              {/* Main */}
              <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none" stroke={color} strokeWidth={arcThickness * 0.95} strokeLinecap="round"
                opacity={0.65 * arcBright} />
              {/* Bright edge */}
              <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none" stroke={color} strokeWidth={arcThickness * 0.4} strokeLinecap="round"
                opacity={0.95 * arcBright} />
            </g>
          );
        })}

        {/* Secondary rainbow - faint reverse */}
        {rainbowColors.slice().reverse().map((color, i) => {
          const r = arcRadius + 30 + i * arcThickness * 0.7;
          return (
            <path key={`band2-${i}`}
              d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
              fill="none" stroke={color} strokeWidth={arcThickness * 0.5} strokeLinecap="round"
              opacity={0.18 * arcBright} />
          );
        })}

        {/* Sparkles */}
        <g style={{ mixBlendMode: "screen" }}>{sparkleNodes}</g>

        {/* Mountains */}
        <path d={mountainPath} fill="url(#ra-mountain)" />

        {/* Mist */}
        <rect x={0} y={height * 0.72} width={width} height={height * 0.18} fill="url(#ra-mist)" />

        {/* Birds */}
        {birdNodes}

        {/* Shimmer flare on arc */}
        {shimmerBurst > 0.1 && (
          <ellipse cx={cx} cy={cy} rx={arcRadius * 1.05} ry={arcRadius * 1.05}
            fill="none" stroke="rgba(255, 255, 255, 0.5)" strokeWidth={3}
            opacity={shimmerBurst * 0.6} strokeDasharray="4 8" />
        )}
      </svg>
    </div>
  );
};
