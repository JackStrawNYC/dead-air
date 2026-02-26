/**
 * Anvil — Blacksmith anvil with sparks flying on beat impacts.
 * Classic anvil silhouette with a hammer that strikes on beats.
 * Sparks shower outward from impact point on each hit. Ember glow
 * at strike zone. Warm orange/red spark palette against dark steel anvil.
 * Positioned lower-right. Cycle: 42s on, 33s off (75s = 2250f).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2250; // 75s at 30fps
const DURATION = 1260; // 42s visible
const NUM_SPARKS = 30;
const SPARK_LIFESPAN = 18; // frames per spark burst

interface SparkDef {
  angle: number;
  speed: number;
  size: number;
  hue: number;
  gravity: number;
  decay: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Anvil: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate spark templates for multiple bursts
  const sparkSets = React.useMemo(() => {
    const rng = seeded(19560);
    const sets: SparkDef[][] = [];
    for (let s = 0; s < 8; s++) {
      const sparks: SparkDef[] = [];
      for (let i = 0; i < NUM_SPARKS; i++) {
        sparks.push({
          angle: -Math.PI * 0.1 + rng() * -Math.PI * 0.8, // mostly upward arc
          speed: 4 + rng() * 10,
          size: 0.8 + rng() * 2.2,
          hue: 15 + rng() * 35, // orange to gold
          gravity: 0.3 + rng() * 0.4,
          decay: 0.5 + rng() * 0.5,
        });
      }
      sets.push(sparks);
    }
    return sets;
  }, []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.07], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Anvil geometry
  const anvilCx = width * 0.78;
  const anvilTopY = height * 0.72;
  const anvilW = 100;
  const anvilH = 50;

  // Strike point on anvil face
  const strikeX = anvilCx + 10;
  const strikeY = anvilTopY;

  // Beat detection for hammer strike
  const currentBeat = frames[idx]?.beat ?? false;
  const currentOnset = frames[idx]?.onset ?? 0;
  const isStriking = currentBeat || currentOnset > 0.4;

  // Hammer animation: swings from raised position to strike
  const hammerCycleLen = 15;
  const hammerPhase = (frame % hammerCycleLen) / hammerCycleLen;

  // Hammer angle: 0 = striking (down), raised = -60 degrees
  const hammerSwing = isStriking
    ? interpolate(hammerPhase, [0, 0.3, 0.5, 1], [0, -0.8, 0, -0.3], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : interpolate(energy, [0.05, 0.3], [-0.2, -0.6], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  // Hammer pivot point (above and left of strike point)
  const pivotX = strikeX - 20;
  const pivotY = strikeY - 80;
  const hammerLen = 85;
  const hammerHeadW = 30;
  const hammerHeadH = 18;

  const hammerEndX = pivotX + Math.sin(hammerSwing) * hammerLen;
  const hammerEndY = pivotY + Math.cos(hammerSwing) * hammerLen;

  // Spark burst: triggered near strike (hammerSwing near 0)
  const sparkIntensity = Math.max(0, 1 - Math.abs(hammerSwing) * 3) * energy;

  // Which spark set to use (rotates through pre-generated sets)
  const sparkSetIdx = Math.floor(frame / hammerCycleLen) % sparkSets.length;
  const activeSparks = sparkSets[sparkSetIdx];

  // Spark age within this strike cycle
  const sparkAge = frame % hammerCycleLen;

  // Ember glow at strike point
  const emberGlow = interpolate(sparkIntensity, [0, 0.5], [0, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity, willChange: "opacity" }}>
        <defs>
          <filter id="anvil-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="anvil-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#546E7A" />
            <stop offset="50%" stopColor="#37474F" />
            <stop offset="100%" stopColor="#263238" />
          </linearGradient>
        </defs>

        {/* Anvil body */}
        {/* Top face (horn shape - wider on left) */}
        <path
          d={`M ${anvilCx - anvilW * 0.6} ${anvilTopY}
              L ${anvilCx - anvilW * 0.7} ${anvilTopY - 5}
              L ${anvilCx + anvilW * 0.4} ${anvilTopY - 5}
              L ${anvilCx + anvilW * 0.5} ${anvilTopY}
              Z`}
          fill="url(#anvil-grad)"
          opacity={0.8}
        />

        {/* Horn (tapered left extension) */}
        <path
          d={`M ${anvilCx - anvilW * 0.7} ${anvilTopY - 5}
              L ${anvilCx - anvilW} ${anvilTopY - 2}
              L ${anvilCx - anvilW} ${anvilTopY + 3}
              L ${anvilCx - anvilW * 0.6} ${anvilTopY + 5}
              Z`}
          fill="#455A64"
          opacity={0.7}
        />

        {/* Anvil middle section (waist) */}
        <path
          d={`M ${anvilCx - anvilW * 0.45} ${anvilTopY}
              L ${anvilCx - anvilW * 0.45} ${anvilTopY + anvilH * 0.4}
              L ${anvilCx + anvilW * 0.35} ${anvilTopY + anvilH * 0.4}
              L ${anvilCx + anvilW * 0.35} ${anvilTopY}
              Z`}
          fill="#37474F"
          opacity={0.75}
        />

        {/* Anvil base (wider) */}
        <path
          d={`M ${anvilCx - anvilW * 0.55} ${anvilTopY + anvilH * 0.4}
              L ${anvilCx - anvilW * 0.6} ${anvilTopY + anvilH}
              L ${anvilCx + anvilW * 0.5} ${anvilTopY + anvilH}
              L ${anvilCx + anvilW * 0.45} ${anvilTopY + anvilH * 0.4}
              Z`}
          fill="#263238"
          opacity={0.8}
        />

        {/* Top face highlight */}
        <line
          x1={anvilCx - anvilW * 0.65}
          y1={anvilTopY - 3}
          x2={anvilCx + anvilW * 0.45}
          y2={anvilTopY - 3}
          stroke="#78909C"
          strokeWidth={1}
          opacity={0.3}
        />

        {/* Hardy hole (square hole in face) */}
        <rect
          x={anvilCx + anvilW * 0.2}
          y={anvilTopY - 4}
          width={8}
          height={8}
          fill="#1A1A1A"
          opacity={0.5}
        />

        {/* Hammer handle */}
        <line
          x1={pivotX}
          y1={pivotY}
          x2={hammerEndX}
          y2={hammerEndY}
          stroke="#6D4C41"
          strokeWidth={5}
          opacity={0.7}
          strokeLinecap="round"
        />

        {/* Hammer head */}
        <rect
          x={hammerEndX - hammerHeadW / 2}
          y={hammerEndY - hammerHeadH / 2}
          width={hammerHeadW}
          height={hammerHeadH}
          rx={3}
          fill="#546E7A"
          stroke="#78909C"
          strokeWidth={1}
          opacity={0.8}
          transform={`rotate(${(hammerSwing * 180) / Math.PI}, ${hammerEndX}, ${hammerEndY})`}
        />

        {/* Ember glow at strike point */}
        {emberGlow > 0.02 && (
          <circle
            cx={strikeX}
            cy={strikeY}
            r={20}
            fill="#FF6D00"
            opacity={emberGlow}
            filter="url(#anvil-glow)"
          />
        )}

        {/* Sparks */}
        {sparkIntensity > 0.05 && sparkAge < SPARK_LIFESPAN && activeSparks.map((spark, si) => {
          const t = sparkAge / SPARK_LIFESPAN;
          const vx = Math.cos(spark.angle) * spark.speed;
          const vy = Math.sin(spark.angle) * spark.speed;
          const sx = strikeX + vx * t * 12;
          const sy = strikeY + vy * t * 12 + spark.gravity * t * t * 40;
          const sparkOpacity = sparkIntensity * (1 - t) * spark.decay;
          if (sparkOpacity < 0.03) return null;
          const r = spark.size * (1 - t * 0.6);
          const hue = spark.hue;
          return (
            <circle
              key={`spark-${si}`}
              cx={sx}
              cy={sy}
              r={r}
              fill={`hsl(${hue}, 100%, ${60 + t * 20}%)`}
              opacity={sparkOpacity}
            />
          );
        })}

        {/* Hot work piece on anvil (glowing bar) */}
        <rect
          x={anvilCx - 25}
          y={anvilTopY - 8}
          width={50}
          height={6}
          rx={1}
          fill="#FF6D00"
          opacity={0.2 + energy * 0.3}
          filter="url(#anvil-glow)"
        />

        {/* Stump base */}
        <rect
          x={anvilCx - anvilW * 0.4}
          y={anvilTopY + anvilH}
          width={anvilW * 0.8}
          height={30}
          rx={4}
          fill="#4E342E"
          opacity={0.4}
        />
      </svg>
    </div>
  );
};
