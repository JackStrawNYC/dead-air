/**
 * WeldingSparks — Arc welding shower of sparks, intensity matches energy.
 * A welding torch tip emits a bright arc point with cascading spark particles
 * that shower downward in a cone. Sparks bounce and scatter. Blue-white arc
 * core with orange/yellow trailing sparks. Intensity (particle count and
 * brightness) scales directly with energy. UV-blue glow halo around arc point.
 * Positioned upper-left. Cycle: 38s on, 37s off (75s = 2250f, offset 300).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2250; // 75s at 30fps
const CYCLE_OFFSET = 300; // 10s stagger from Anvil which shares same CYCLE
const DURATION = 1140; // 38s visible
const MAX_SPARKS = 40;
const MIN_SPARKS = 12;
const SPARK_LIFESPAN = 30; // frames each spark lives

interface SparkTemplate {
  angle: number; // initial ejection angle
  speed: number;
  size: number;
  hue: number; // 20-60 (orange to gold)
  gravity: number;
  bounce: number; // bounciness 0-1
  windDrift: number;
  phaseOffset: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const WeldingSparks: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate spark templates
  const sparkTemplates = React.useMemo((): SparkTemplate[] => {
    const rng = seeded(44891);
    return Array.from({ length: MAX_SPARKS }, () => ({
      angle: Math.PI * 0.2 + rng() * Math.PI * 0.6, // downward cone
      speed: 3 + rng() * 8,
      size: 0.6 + rng() * 2,
      hue: 20 + rng() * 40,
      gravity: 0.4 + rng() * 0.6,
      bounce: rng() * 0.4,
      windDrift: (rng() - 0.5) * 2,
      phaseOffset: Math.floor(rng() * SPARK_LIFESPAN),
    }));
  }, []);

  // Timing gate (with offset)
  const adjustedFrame = frame + CYCLE_OFFSET;
  const cycleFrame = adjustedFrame % CYCLE;
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
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.15, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Arc point position (upper-left area)
  const arcX = width * 0.2;
  const arcY = height * 0.25;

  // Number of visible sparks scales with energy
  const visibleCount = Math.round(interpolate(energy, [0.03, 0.35], [MIN_SPARKS, MAX_SPARKS], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  // Arc brightness
  const arcBrightness = interpolate(energy, [0.03, 0.3], [0.3, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Arc flicker
  const flicker = 0.7 + Math.sin(frame * 1.3) * 0.15 + Math.sin(frame * 3.7) * 0.1;
  const arcOpacity = arcBrightness * flicker;

  // Arc glow radius
  const glowR = interpolate(energy, [0.03, 0.3], [15, 40], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Torch body angle (slight wobble)
  const torchAngle = -45 + Math.sin(frame * 0.1) * 3;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity, willChange: "opacity" }}>
        <defs>
          <filter id="weld-glow">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="weld-glow-sm">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="arc-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="30%" stopColor="#90CAF9" />
            <stop offset="60%" stopColor="#42A5F5" />
            <stop offset="100%" stopColor="#1565C0" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Torch body */}
        <g transform={`rotate(${torchAngle}, ${arcX}, ${arcY})`}>
          <rect
            x={arcX - 4}
            y={arcY - 60}
            width={8}
            height={55}
            rx={2}
            fill="#37474F"
            opacity={0.5}
          />
          {/* Torch tip */}
          <rect
            x={arcX - 3}
            y={arcY - 8}
            width={6}
            height={10}
            rx={1}
            fill="#B87333"
            opacity={0.6}
          />
        </g>

        {/* UV glow halo */}
        <circle
          cx={arcX}
          cy={arcY}
          r={glowR}
          fill="url(#arc-grad)"
          opacity={arcOpacity * 0.4}
          filter="url(#weld-glow)"
        />

        {/* Arc core (bright white point) */}
        <circle
          cx={arcX}
          cy={arcY}
          r={4}
          fill="#FFFFFF"
          opacity={arcOpacity}
          filter="url(#weld-glow-sm)"
        />
        <circle
          cx={arcX}
          cy={arcY}
          r={2}
          fill="#FFFFFF"
          opacity={arcOpacity * 0.9}
        />

        {/* Spark shower */}
        {sparkTemplates.slice(0, visibleCount).map((spark, si) => {
          // Each spark cycles independently through its lifespan
          const sparkFrame = (cycleFrame + spark.phaseOffset) % SPARK_LIFESPAN;
          const t = sparkFrame / SPARK_LIFESPAN;

          // Physics: initial velocity + gravity
          const vx = Math.cos(spark.angle) * spark.speed + spark.windDrift;
          const vy = Math.sin(spark.angle) * spark.speed;

          let sx = arcX + vx * t * 15;
          let sy = arcY + vy * t * 15 + spark.gravity * t * t * 80;

          // Simple bounce off an imaginary floor
          const floorY = arcY + 180;
          if (sy > floorY && spark.bounce > 0.1) {
            const overshoot = sy - floorY;
            sy = floorY - overshoot * spark.bounce;
          }

          // Spark opacity: bright at start, fades out
          const sparkOpacity = interpolate(t, [0, 0.1, 0.6, 1], [0, 0.9, 0.4, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * arcBrightness;

          if (sparkOpacity < 0.03) return null;

          // Spark color: starts bright white/yellow, cools to orange/red
          const coolHue = spark.hue + t * 15;
          const lightness = interpolate(t, [0, 0.3, 1], [90, 70, 50], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const r = spark.size * (1 - t * 0.5);

          return (
            <g key={`ws-${si}`}>
              {/* Glow */}
              <circle
                cx={sx}
                cy={sy}
                r={r * 3}
                fill={`hsl(${coolHue}, 100%, ${lightness}%)`}
                opacity={sparkOpacity * 0.2}
              />
              {/* Core */}
              <circle
                cx={sx}
                cy={sy}
                r={r}
                fill={t < 0.2 ? "#FFFFFF" : `hsl(${coolHue}, 100%, ${lightness}%)`}
                opacity={sparkOpacity}
              />
            </g>
          );
        })}

        {/* Weld bead (glowing line being welded) */}
        <line
          x1={arcX - 30}
          y1={arcY + 3}
          x2={arcX + 5}
          y2={arcY + 3}
          stroke="#FF6D00"
          strokeWidth={3}
          opacity={0.15 + energy * 0.2}
          filter="url(#weld-glow-sm)"
          strokeLinecap="round"
        />

        {/* Work piece (metal plate hint) */}
        <rect
          x={arcX - 50}
          y={arcY + 1}
          width={100}
          height={4}
          fill="#455A64"
          opacity={0.3}
        />
      </svg>
    </div>
  );
};
