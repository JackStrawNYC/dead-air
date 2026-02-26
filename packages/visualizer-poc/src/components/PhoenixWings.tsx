/**
 * PhoenixWings — Two massive fiery wing shapes that spread outward from center
 * during peak energy moments (>0.25). Wings built from layered flame-colored
 * feather shapes (gradients of red->orange->gold->white at tips). Wings
 * flap/pulse with beat detection. Glow intensely.
 * Cycle: 50s (1500 frames), 15s (450 frames) visible duration.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface FeatherData {
  /** Angle offset from wing base axis (radians) */
  angle: number;
  /** Length multiplier */
  length: number;
  /** Width multiplier */
  width: number;
  /** Layer depth (0 = back, 1 = front) */
  layer: number;
  /** Flap phase offset */
  flapPhase: number;
  /** Hue shift from base */
  hueShift: number;
}

const NUM_FEATHERS_PER_WING = 14;
const CYCLE = 1500;    // 50s at 30fps
const DURATION = 450;  // 15s

function generateFeathers(seed: number): FeatherData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_FEATHERS_PER_WING }, (_, i) => {
    const t = i / (NUM_FEATHERS_PER_WING - 1); // 0..1 from inner to outer
    return {
      angle: t * 1.2 - 0.1 + (rng() - 0.5) * 0.08,
      length: 0.4 + t * 0.6 + rng() * 0.15,
      width: 0.2 + (1 - t) * 0.4 + rng() * 0.1,
      layer: rng(),
      flapPhase: rng() * Math.PI * 0.3,
      hueShift: rng() * 20 - 10,
    };
  });
}

function buildFeatherPath(
  cx: number,
  cy: number,
  baseAngle: number,
  feather: FeatherData,
  wingSpan: number,
  flapAmount: number,
  side: number, // -1 = left, 1 = right
): string {
  const angle = baseAngle + feather.angle * side;
  const flapAngle = angle + flapAmount * feather.flapPhase * 0.2 * side;
  const len = wingSpan * feather.length;
  const w = wingSpan * feather.width * 0.12;

  // Tip of the feather
  const tipX = cx + Math.cos(flapAngle) * len * side;
  const tipY = cy - Math.sin(flapAngle) * len;

  // Control points for curve
  const midLen = len * 0.55;
  const cp1X = cx + Math.cos(flapAngle + 0.15 * side) * midLen * side;
  const cp1Y = cy - Math.sin(flapAngle + 0.15 * side) * midLen - w;
  const cp2X = cx + Math.cos(flapAngle - 0.15 * side) * midLen * side;
  const cp2Y = cy - Math.sin(flapAngle - 0.15 * side) * midLen + w;

  return `M ${cx} ${cy} Q ${cp1X} ${cp1Y} ${tipX} ${tipY} Q ${cp2X} ${cp2Y} ${cx} ${cy} Z`;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PhoenixWings: React.FC<Props> = ({ frames }) => {
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

  const feathers = React.useMemo(() => generateFeathers(50877), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;
  if (energy < 0.25) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.82, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.75;

  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height * 0.55;
  const wingSpan = Math.min(width, height) * 0.42;

  // Beat-driven flap
  const isBeat = frames[idx].beat;
  const beatPulse = isBeat ? 1.0 : 0.0;
  const flapBase = Math.sin(frame * 0.06) * 0.5 + 0.5;
  const flapAmount = flapBase + beatPulse * 0.35;

  // Energy drives wing spread
  const spread = interpolate(energy, [0.25, 0.5], [0.6, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Wing base angle (how far up the wings point)
  const baseAngle = 0.3 + spread * 0.5 + flapAmount * 0.12;

  // Gradient ID must be unique
  const gradId = "phoenix-wing-grad";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: masterOpacity, pointerEvents: "none" }}
      >
        <defs>
          <radialGradient id={gradId} cx="0%" cy="50%" r="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="25%" stopColor="#FFD700" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#FF8C00" stopOpacity="0.6" />
            <stop offset="80%" stopColor="#FF4500" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#8B0000" stopOpacity="0.15" />
          </radialGradient>
          <filter id="phoenix-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="phoenix-outer-glow">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Render both wings */}
        {([-1, 1] as const).map((side) => (
          <g key={side}>
            {/* Back glow layer */}
            {feathers.map((feather, fi) => {
              const t = fi / (NUM_FEATHERS_PER_WING - 1);
              const hue = 10 + t * 40 + feather.hueShift;
              const path = buildFeatherPath(cx, cy, baseAngle, feather, wingSpan * spread, flapAmount, side);
              return (
                <path
                  key={`glow-${fi}`}
                  d={path}
                  fill={`hsla(${hue}, 100%, 55%, 0.15)`}
                  filter="url(#phoenix-outer-glow)"
                />
              );
            })}
            {/* Feather layer */}
            {feathers.map((feather, fi) => {
              const t = fi / (NUM_FEATHERS_PER_WING - 1);
              const hue = 10 + t * 40 + feather.hueShift;
              const lightness = 50 + t * 30;
              const path = buildFeatherPath(cx, cy, baseAngle, feather, wingSpan * spread, flapAmount, side);
              return (
                <path
                  key={`feather-${fi}`}
                  d={path}
                  fill={`hsla(${hue}, 100%, ${lightness}%, ${0.25 + feather.layer * 0.2})`}
                  stroke={`hsla(${hue + 5}, 100%, ${Math.min(95, lightness + 20)}%, 0.5)`}
                  strokeWidth={0.8}
                  filter="url(#phoenix-glow)"
                />
              );
            })}
          </g>
        ))}

        {/* Central body glow */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={15 + energy * 20}
          ry={25 + energy * 30}
          fill={`url(#${gradId})`}
          opacity={0.6 + beatPulse * 0.2}
          filter="url(#phoenix-outer-glow)"
        />
      </svg>
    </div>
  );
};
