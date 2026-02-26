/**
 * Whirlpool — Spiral vortex pattern in center of screen. Multiple arms of a
 * logarithmic spiral rotating. Energy drives rotation speed and number of
 * visible spiral arms (2-6). Deep blue/purple/teal colors with bright
 * highlights on leading edges.
 * Cycle: 70s (2100 frames), 20s (600 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface ArmData {
  /** Color hue (200-300 range: blue/purple/teal) */
  hue: number;
  /** Saturation (60-100) */
  saturation: number;
  /** Width scale */
  widthScale: number;
  /** Length scale (number of turns) */
  turns: number;
  /** Leading edge brightness boost */
  edgeBrightness: number;
}

const MAX_ARMS = 6;
const CYCLE = 2100;     // 70s
const DURATION = 600;   // 20s

function generateArms(seed: number): ArmData[] {
  const rng = seeded(seed);
  return Array.from({ length: MAX_ARMS }, () => ({
    hue: 190 + rng() * 110,
    saturation: 60 + rng() * 40,
    widthScale: 0.6 + rng() * 0.8,
    turns: 2.5 + rng() * 2,
    edgeBrightness: 0.6 + rng() * 0.4,
  }));
}

function buildLogSpiralPath(
  cx: number,
  cy: number,
  armAngleOffset: number,
  rotation: number,
  maxRadius: number,
  turns: number,
): string {
  const steps = 100;
  const points: string[] = [];
  const totalAngle = turns * Math.PI * 2;
  // Logarithmic spiral: r = a * e^(b*theta)
  const b = 0.15;
  const a = maxRadius / Math.exp(b * totalAngle);

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const theta = t * totalAngle;
    const r = a * Math.exp(b * theta);
    const angle = theta + armAngleOffset + rotation;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    points.push(s === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }

  return points.join(" ");
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Whirlpool: React.FC<Props> = ({ frames }) => {
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

  const arms = React.useMemo(() => generateArms(70770), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.55;

  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.38;

  // Energy drives rotation speed
  const rotationSpeed = 0.015 + energy * 0.05;
  const rotation = frame * rotationSpeed;

  // Energy drives number of visible arms (2-6)
  const visibleArms = Math.round(interpolate(energy, [0.05, 0.35], [2, MAX_ARMS], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  // Energy drives stroke width
  const baseStroke = interpolate(energy, [0.05, 0.35], [1.5, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: masterOpacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="whirlpool-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="whirlpool-outer">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {arms.slice(0, visibleArms).map((arm, ai) => {
          const armAngle = (ai / visibleArms) * Math.PI * 2;
          const path = buildLogSpiralPath(cx, cy, armAngle, rotation, maxRadius, arm.turns);
          const strokeW = baseStroke * arm.widthScale;

          const armColor = `hsla(${arm.hue}, ${arm.saturation}%, 55%, 0.6)`;
          const edgeColor = `hsla(${arm.hue + 15}, ${Math.min(100, arm.saturation + 20)}%, ${65 + arm.edgeBrightness * 20}%, 0.4)`;
          const glowColor = `hsla(${arm.hue}, ${arm.saturation}%, 45%, 0.15)`;

          return (
            <g key={ai}>
              {/* Outer glow */}
              <path
                d={path}
                fill="none"
                stroke={glowColor}
                strokeWidth={strokeW * 3}
                strokeLinecap="round"
                filter="url(#whirlpool-outer)"
              />
              {/* Main arm */}
              <path
                d={path}
                fill="none"
                stroke={armColor}
                strokeWidth={strokeW}
                strokeLinecap="round"
                filter="url(#whirlpool-glow)"
              />
              {/* Leading edge highlight */}
              <path
                d={path}
                fill="none"
                stroke={edgeColor}
                strokeWidth={strokeW * 0.4}
                strokeLinecap="round"
                strokeDasharray={`${3} ${8}`}
              />
            </g>
          );
        })}

        {/* Center vortex eye */}
        <circle
          cx={cx}
          cy={cy}
          r={6 + energy * 10}
          fill="none"
          stroke={`hsla(220, 80%, 80%, ${0.3 + energy * 0.3})`}
          strokeWidth={1.5}
          filter="url(#whirlpool-glow)"
        />
        <circle
          cx={cx}
          cy={cy}
          r={3 + energy * 5}
          fill={`hsla(240, 70%, 90%, ${0.2 + energy * 0.2})`}
        />
      </svg>
    </div>
  );
};
