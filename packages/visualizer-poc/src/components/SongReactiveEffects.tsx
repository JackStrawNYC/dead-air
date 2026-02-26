/**
 * SongReactiveEffects — VW Bus, blooming roses, lightning storm.
 * Three effects that trigger based on energy levels:
 * - VW Bus: cruises across during sustained mid-energy jams
 * - Roses: bloom from edges during crescendos (rising energy)
 * - Lightning: cracks across frame during peak energy moments
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── VW BUS ──────────────────────────────────────────────────────

const VWBus: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size * 0.6} viewBox="0 0 160 96" fill="none">
    {/* Body */}
    <rect x="10" y="20" width="140" height="55" rx="12" fill={color} opacity="0.85" />
    {/* Roof */}
    <path d="M 30 20 Q 30 5 80 5 Q 130 5 130 20" fill={color} opacity="0.7" />
    {/* Windshield */}
    <path d="M 95 12 L 135 12 L 140 28 L 90 28 Z" fill="white" opacity="0.25" />
    {/* Side windows */}
    <rect x="20" y="25" width="25" height="18" rx="3" fill="white" opacity="0.2" />
    <rect x="50" y="25" width="25" height="18" rx="3" fill="white" opacity="0.2" />
    {/* VW logo circle */}
    <circle cx="80" cy="45" r="14" stroke="white" strokeWidth="2" opacity="0.5" />
    <text x="80" y="50" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white" opacity="0.5">V</text>
    {/* Bumper */}
    <rect x="5" y="72" width="150" height="5" rx="2" fill={color} opacity="0.6" />
    {/* Wheels */}
    <circle cx="40" cy="78" r="14" fill="#222" />
    <circle cx="40" cy="78" r="8" fill="#444" />
    <circle cx="40" cy="78" r="3" fill="#666" />
    <circle cx="120" cy="78" r="14" fill="#222" />
    <circle cx="120" cy="78" r="8" fill="#444" />
    <circle cx="120" cy="78" r="3" fill="#666" />
    {/* Peace sign on side */}
    <circle cx="40" cy="50" r="8" stroke="white" strokeWidth="1.5" opacity="0.4" />
    <line x1="40" y1="42" x2="40" y2="58" stroke="white" strokeWidth="1.5" opacity="0.4" />
    <line x1="40" y1="50" x2="34" y2="56" stroke="white" strokeWidth="1.5" opacity="0.4" />
    <line x1="40" y1="50" x2="46" y2="56" stroke="white" strokeWidth="1.5" opacity="0.4" />
    {/* Flowers on side */}
    <circle cx="60" cy="55" r="4" fill="#FF69B4" opacity="0.5" />
    <circle cx="68" cy="50" r="3" fill="#FFD700" opacity="0.5" />
    <circle cx="55" cy="48" r="3.5" fill="#00FF7F" opacity="0.5" />
  </svg>
);

// ── BLOOMING ROSE ───────────────────────────────────────────────

const BloomingRose: React.FC<{ size: number; color: string; bloom: number }> = ({ size, color, bloom }) => {
  // bloom: 0-1, controls petal spread
  const petalSpread = bloom * 16;
  const petalScale = 0.3 + bloom * 0.7;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <g transform={`scale(${petalScale})`} style={{ transformOrigin: "50px 50px" }}>
        {/* Petals radiating outward */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const cx = 50 + Math.cos(rad) * petalSpread;
          const cy = 50 + Math.sin(rad) * petalSpread;
          return (
            <ellipse
              key={deg}
              cx={cx} cy={cy}
              rx={12} ry={8}
              fill={color}
              opacity={0.4 + bloom * 0.3}
              transform={`rotate(${deg} ${cx} ${cy})`}
            />
          );
        })}
        {/* Center */}
        <circle cx="50" cy="50" r={6 + bloom * 4} fill={color} opacity={0.8} />
      </g>
      {/* Stem */}
      <line x1="50" y1={55 + bloom * 10} x2="50" y2="98" stroke="#00CC44" strokeWidth="2.5" opacity={0.5 + bloom * 0.3} />
    </svg>
  );
};

// ── LIGHTNING BOLT (procedural) ─────────────────────────────────

interface LightningSegment {
  x1: number; y1: number; x2: number; y2: number;
}

function generateLightning(rng: () => number, w: number, h: number): LightningSegment[] {
  const segments: LightningSegment[] = [];
  let x = w * (0.2 + rng() * 0.6);
  let y = 0;
  const targetX = w * (0.2 + rng() * 0.6);
  const steps = 8 + Math.floor(rng() * 6);

  for (let i = 0; i < steps; i++) {
    const nextY = y + h / steps;
    const nextX = x + (targetX - x) / (steps - i) + (rng() - 0.5) * w * 0.15;
    segments.push({ x1: x, y1: y, x2: nextX, y2: nextY });

    // Branch chance
    if (rng() > 0.6) {
      const branchLen = h / steps * 0.7;
      const branchAngle = (rng() - 0.5) * 1.2;
      segments.push({
        x1: nextX, y1: nextY,
        x2: nextX + Math.sin(branchAngle) * branchLen * 0.8,
        y2: nextY + Math.cos(branchAngle) * branchLen,
      });
    }
    x = nextX;
    y = nextY;
  }
  return segments;
}

// ── MAIN COMPONENT ──────────────────────────────────────────────

const VW_CYCLE = 1800;       // 60 seconds between buses
const VW_DURATION = 480;     // 16 seconds to cross
const ROSE_CYCLE = 900;      // 30 seconds between blooms
const ROSE_DURATION = 300;   // 10 seconds to bloom and fade
const LIGHTNING_DURATION = 12; // 0.4 seconds flash

const VW_COLORS = ["#FF6347", "#00CED1", "#FFD700", "#FF69B4", "#76FF03"];

interface Props {
  frames: EnhancedFrameData[];
}

export const SongReactiveEffects: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Energy calculations
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Instantaneous RMS for lightning
  const instantRms = frames[idx].rms;

  // ── VW Bus: cruises during mid-energy ──
  const vwCycleFrame = frame % VW_CYCLE;
  const vwCycleIdx = Math.floor(frame / VW_CYCLE);
  const vwActive = vwCycleFrame < VW_DURATION && energy > 0.08;
  let vwElement: React.ReactNode = null;

  if (vwActive) {
    const vwProgress = vwCycleFrame / VW_DURATION;
    const goingRight = vwCycleIdx % 2 === 0;
    const vwX = goingRight
      ? interpolate(vwProgress, [0, 1], [-200, width + 50], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : interpolate(vwProgress, [0, 1], [width + 50, -200], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const vwY = height * 0.65 + Math.sin(vwProgress * Math.PI * 4) * 8;
    const vwFadeIn = interpolate(vwProgress, [0, 0.05], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const vwFadeOut = interpolate(vwProgress, [0.95, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const vwColor = VW_COLORS[vwCycleIdx % VW_COLORS.length];
    const tilt = Math.sin(vwProgress * Math.PI * 6) * 2;

    vwElement = (
      <div
        style={{
          position: "absolute",
          left: vwX,
          top: vwY,
          opacity: Math.min(vwFadeIn, vwFadeOut) * 0.75,
          transform: `scaleX(${goingRight ? 1 : -1}) rotate(${tilt}deg)`,
          filter: `drop-shadow(0 0 12px ${vwColor}) drop-shadow(0 0 25px ${vwColor})`,
          willChange: "transform, opacity",
        }}
      >
        <VWBus size={160} color={vwColor} />
      </div>
    );
  }

  // ── Roses: bloom during crescendos ──
  const roseCycleFrame = frame % ROSE_CYCLE;
  const roseActive = roseCycleFrame < ROSE_DURATION && energy > 0.1;
  let roseElements: React.ReactNode = null;

  if (roseActive) {
    const roseProgress = roseCycleFrame / ROSE_DURATION;
    const bloom = interpolate(roseProgress, [0, 0.5, 0.8, 1], [0, 1, 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    const roseOpacity = interpolate(roseProgress, [0, 0.1, 0.85, 1], [0, 0.7, 0.7, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    const roseColors = ["#FF1493", "#FF4500", "#FFD700", "#FF69B4", "#DA70D6"];
    const roseCycleIdx = Math.floor(frame / ROSE_CYCLE);
    const rng = seeded(roseCycleIdx * 7 + 42);

    const roses = Array.from({ length: 4 }, (_, i) => {
      // Roses grow from edges
      const side = i % 4; // 0=left, 1=right, 2=top-left, 3=top-right
      const rx = side === 0 ? 30 + rng() * 60 : side === 1 ? width - 30 - rng() * 60 : side === 2 ? 80 + rng() * 150 : width - 80 - rng() * 150;
      const ry = side < 2 ? height * (0.3 + rng() * 0.4) : 40 + rng() * 80;
      const roseColor = roseColors[(i + roseCycleIdx) % roseColors.length];
      const size = 60 + rng() * 40;
      const rotation = (rng() - 0.5) * 30;

      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: rx,
            top: ry,
            opacity: roseOpacity,
            transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${0.5 + bloom * 0.5})`,
            filter: `drop-shadow(0 0 10px ${roseColor}) drop-shadow(0 0 20px ${roseColor})`,
          }}
        >
          <BloomingRose size={size} color={roseColor} bloom={bloom} />
        </div>
      );
    });
    roseElements = <>{roses}</>;
  }

  // ── Lightning: cracks during peak energy ──
  // Check if we're in a lightning window (high instantaneous RMS)
  let lightningElement: React.ReactNode = null;
  const LIGHTNING_CYCLE = 300; // check every 10 seconds
  const lightCycleFrame = frame % LIGHTNING_CYCLE;

  if (lightCycleFrame < LIGHTNING_DURATION && energy > 0.22 && instantRms > 0.3) {
    const lightProgress = lightCycleFrame / LIGHTNING_DURATION;
    const lightOpacity = interpolate(lightProgress, [0, 0.1, 0.3, 1], [0, 1, 0.8, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    const lightCycleIdx = Math.floor(frame / LIGHTNING_CYCLE);
    const rng = seeded(lightCycleIdx * 13 + 77);
    const bolts = generateLightning(rng, width, height);
    const boltColor = `hsl(${200 + rng() * 60}, 100%, 80%)`;

    lightningElement = (
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          opacity: lightOpacity,
          filter: `drop-shadow(0 0 8px ${boltColor}) drop-shadow(0 0 20px ${boltColor}) drop-shadow(0 0 40px ${boltColor})`,
          pointerEvents: "none",
        }}
      >
        {bolts.map((seg, i) => (
          <line
            key={i}
            x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
            stroke={boltColor}
            strokeWidth={i < bolts.length * 0.6 ? 3 : 1.5}
            strokeLinecap="round"
          />
        ))}
      </svg>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {vwElement}
      {roseElements}
      {lightningElement}
    </div>
  );
};
