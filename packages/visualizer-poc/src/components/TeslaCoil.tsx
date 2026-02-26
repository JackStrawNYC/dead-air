/**
 * TeslaCoil — Tesla coil lightning arcs emanating from a central toroid.
 * Multiple branching lightning bolts shoot upward/outward. Bolt frequency
 * and brightness increase with energy peaks. Bolts are generated
 * deterministically per-frame with jagged recursive paths.
 * Electric blue/white/purple color scheme.
 * Appears every 70s for 15s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2100; // 70s at 30fps
const DURATION = 450; // 15s
const MAX_BOLTS = 6;
const BOLT_SEGMENTS = 12;

interface BoltSegment {
  x: number;
  y: number;
}

function generateBolt(
  rng: () => number,
  startX: number,
  startY: number,
  angle: number,
  length: number,
  segments: number,
): BoltSegment[] {
  const points: BoltSegment[] = [{ x: startX, y: startY }];
  let cx = startX;
  let cy = startY;

  for (let s = 1; s <= segments; s++) {
    const t = s / segments;
    const segLen = length / segments;
    const jitter = segLen * 0.6 * (rng() - 0.5);

    // Main direction
    cx += Math.cos(angle) * segLen + jitter;
    cy += Math.sin(angle) * segLen + Math.cos(angle) * jitter * 0.5;

    // Slight angle drift
    const angleDrift = (rng() - 0.5) * 0.4;
    cx += Math.cos(angle + Math.PI / 2 + angleDrift) * jitter * 0.3;
    cy += Math.sin(angle + Math.PI / 2 + angleDrift) * jitter * 0.3;

    // Taper: reduce jitter toward end
    const taper = 1 - t * 0.3;
    points.push({ x: cx * taper + startX * (1 - taper) + (cx - startX) * taper, y: cy });
  }

  return points;
}

function boltToPath(segments: BoltSegment[]): string {
  if (segments.length === 0) return "";
  let d = `M ${segments[0].x.toFixed(1)} ${segments[0].y.toFixed(1)}`;
  for (let i = 1; i < segments.length; i++) {
    d += ` L ${segments[i].x.toFixed(1)} ${segments[i].y.toFixed(1)}`;
  }
  return d;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const TeslaCoil: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const currentFrame = frames[idx];
  const highEnergy = currentFrame?.high ?? 0;
  const onset = currentFrame?.onset ?? 0;

  // Generate bolts deterministically per frame (they flicker)
  const bolts = React.useMemo(() => {
    // Pre-generate bolt schedules for the entire duration
    const scheduleRng = seeded(55555);
    const schedule: { startFrame: number; angle: number; length: number; seed: number }[] = [];
    for (let f = 0; f < DURATION; f += 2) {
      const numBolts = Math.floor(scheduleRng() * (MAX_BOLTS + 1));
      for (let b = 0; b < numBolts; b++) {
        schedule.push({
          startFrame: f,
          angle: -Math.PI / 2 + (scheduleRng() - 0.5) * Math.PI * 0.8,
          length: 80 + scheduleRng() * 200,
          seed: Math.floor(scheduleRng() * 100000),
        });
      }
    }
    return schedule;
  }, []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const envelope = Math.min(fadeIn, fadeOut) * (0.4 + energy * 0.5);

  // Coil base position
  const coilX = width * 0.5;
  const coilBaseY = height * 0.7;
  const toroidY = coilBaseY - 80;

  // Toroid glow pulses with onset/energy
  const toroidGlow = 0.4 + energy * 0.4 + onset * 0.3;

  // Active bolts: bolts that started on exactly this cycleFrame (2-frame lifetime)
  const activeBolts = bolts.filter(
    (b) => cycleFrame >= b.startFrame && cycleFrame < b.startFrame + 3,
  );

  // Only show bolts proportional to energy
  const energyThreshold = 0.1;
  const visibleBolts = energy > energyThreshold
    ? activeBolts.slice(0, Math.ceil(activeBolts.length * energy * 3))
    : [];

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: envelope }}>
        <defs>
          <filter id="tesla-bolt-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="tesla-toroid-glow">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="tesla-corona">
            <stop offset="0%" stopColor="#aaddff" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#4488ff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#2244aa" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Coil body */}
        <rect
          x={coilX - 8}
          y={toroidY}
          width={16}
          height={coilBaseY - toroidY}
          rx={4}
          fill="rgba(80, 70, 60, 0.5)"
          stroke="rgba(140, 120, 100, 0.3)"
          strokeWidth={1}
        />
        {/* Winding lines */}
        {Array.from({ length: 12 }, (_, wi) => {
          const wy = toroidY + 10 + (wi / 11) * (coilBaseY - toroidY - 20);
          return (
            <line
              key={`wind${wi}`}
              x1={coilX - 10}
              y1={wy}
              x2={coilX + 10}
              y2={wy}
              stroke="rgba(180, 120, 60, 0.25)"
              strokeWidth={1}
            />
          );
        })}

        {/* Toroid */}
        <ellipse
          cx={coilX}
          cy={toroidY}
          rx={30}
          ry={10}
          fill="rgba(120, 130, 140, 0.4)"
          stroke="rgba(160, 170, 180, 0.3)"
          strokeWidth={1.5}
        />

        {/* Corona discharge glow */}
        <ellipse
          cx={coilX}
          cy={toroidY}
          rx={50 + highEnergy * 30}
          ry={35 + highEnergy * 20}
          fill="url(#tesla-corona)"
          opacity={toroidGlow}
          filter="url(#tesla-toroid-glow)"
        />

        {/* Lightning bolts */}
        {visibleBolts.map((bolt, bi) => {
          const boltRng = seeded(bolt.seed + cycleFrame);
          const segments = generateBolt(
            boltRng,
            coilX,
            toroidY,
            bolt.angle,
            bolt.length * (0.5 + energy * 1.5),
            BOLT_SEGMENTS,
          );
          const pathD = boltToPath(segments);
          const boltOpacity = 0.5 + highEnergy * 0.5;

          return (
            <g key={`bolt${bi}`}>
              {/* Outer glow */}
              <path
                d={pathD}
                stroke="#4488ff"
                strokeWidth={4}
                fill="none"
                opacity={boltOpacity * 0.4}
                filter="url(#tesla-bolt-glow)"
                strokeLinejoin="round"
              />
              {/* Core bolt */}
              <path
                d={pathD}
                stroke="#88bbff"
                strokeWidth={1.8}
                fill="none"
                opacity={boltOpacity * 0.8}
                strokeLinejoin="round"
              />
              {/* White hot center */}
              <path
                d={pathD}
                stroke="#ffffff"
                strokeWidth={0.6}
                fill="none"
                opacity={boltOpacity * 0.6}
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {/* Base */}
        <rect
          x={coilX - 35}
          y={coilBaseY}
          width={70}
          height={8}
          rx={2}
          fill="rgba(60, 55, 50, 0.6)"
          stroke="rgba(100, 90, 80, 0.3)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
};
