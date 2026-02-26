/**
 * TelescopeView — Circular telescope eyepiece view with crosshairs.
 * A large circle mask in center of screen showing a magnified star field.
 * Crosshair lines divide the circle. Stars drift slowly.
 * Occasional "discovery" — a bright object (planet, nebula) drifts through.
 * Dark vignette around circle edge. Cycle: 75s, 22s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2250;    // 75 seconds at 30fps
const DURATION = 660;  // 22 seconds
const NUM_STARS = 60;

interface StarData {
  x: number;
  y: number;
  size: number;
  brightness: number;
  driftAngle: number;
  driftSpeed: number;
  twinkleSpeed: number;
  twinklePhase: number;
  hue: number;
}

interface DiscoveryData {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  size: number;
  hue: number;
  type: "planet" | "nebula";
  appearProgress: number;
  disappearProgress: number;
}

function generateStars(seed: number): StarData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_STARS }, () => ({
    x: rng() * 2 - 0.5,
    y: rng() * 2 - 0.5,
    size: 0.8 + rng() * 2.5,
    brightness: 0.3 + rng() * 0.7,
    driftAngle: rng() * Math.PI * 2,
    driftSpeed: 0.1 + rng() * 0.3,
    twinkleSpeed: 0.04 + rng() * 0.06,
    twinklePhase: rng() * Math.PI * 2,
    hue: rng() > 0.7 ? 30 + rng() * 30 : 200 + rng() * 60,
  }));
}

function generateDiscoveries(seed: number): DiscoveryData[] {
  const rng = seeded(seed);
  return [
    {
      startX: -0.3,
      startY: 0.2 + rng() * 0.6,
      endX: 1.3,
      endY: 0.3 + rng() * 0.4,
      size: 8 + rng() * 12,
      hue: 30 + rng() * 20,
      type: "planet",
      appearProgress: 0.2,
      disappearProgress: 0.7,
    },
    {
      startX: 0.8 + rng() * 0.4,
      startY: -0.2,
      endX: 0.2 + rng() * 0.3,
      endY: 1.2,
      size: 15 + rng() * 10,
      hue: 270 + rng() * 40,
      type: "nebula",
      appearProgress: 0.45,
      disappearProgress: 0.85,
    },
  ];
}

interface Props {
  frames: EnhancedFrameData[];
}

export const TelescopeView: React.FC<Props> = ({ frames }) => {
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

  const stars = React.useMemo(() => generateStars(7575), []);
  const discoveries = React.useMemo(() => generateDiscoveries(7576), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.75;

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.32;
  const clipId = "telescope-clip";
  const vignetteId = "telescope-vignette";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={radius} />
          </clipPath>
          <radialGradient id={vignetteId} cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="transparent" />
            <stop offset="85%" stopColor="rgba(0,0,0,0.3)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.8)" />
          </radialGradient>
          <filter id="telescope-star-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="telescope-discovery-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Dark background behind telescope */}
        <circle cx={cx} cy={cy} r={radius + 3} fill="#0A0A1A" opacity={0.6} />

        {/* Star field (clipped to circle) */}
        <g clipPath={`url(#${clipId})`}>
          {/* Deep space background */}
          <rect
            x={cx - radius}
            y={cy - radius}
            width={radius * 2}
            height={radius * 2}
            fill="#050510"
          />

          {/* Stars */}
          {stars.map((star, si) => {
            const drift = frame * star.driftSpeed * 0.01;
            const sx =
              cx +
              ((star.x + Math.cos(star.driftAngle) * drift) % 1 - 0.5) * radius * 2;
            const sy =
              cy +
              ((star.y + Math.sin(star.driftAngle) * drift) % 1 - 0.5) * radius * 2;
            const twinkle =
              star.brightness *
              (0.6 + 0.4 * Math.sin(frame * star.twinkleSpeed + star.twinklePhase));
            const dist = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
            if (dist > radius) return null;

            return (
              <circle
                key={`star-${si}`}
                cx={sx}
                cy={sy}
                r={star.size * (0.8 + energy * 0.5)}
                fill={`hsla(${star.hue}, 60%, 85%, ${twinkle})`}
                filter="url(#telescope-star-glow)"
              />
            );
          })}

          {/* Discoveries */}
          {discoveries.map((disc, di) => {
            const discProgress = interpolate(progress, [disc.appearProgress, disc.disappearProgress], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            if (discProgress <= 0 || discProgress >= 1) return null;

            const dx = cx + (disc.startX + (disc.endX - disc.startX) * discProgress - 0.5) * radius * 2;
            const dy = cy + (disc.startY + (disc.endY - disc.startY) * discProgress - 0.5) * radius * 2;
            const discOpacity = interpolate(discProgress, [0, 0.15, 0.85, 1], [0, 0.8, 0.8, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            if (disc.type === "planet") {
              return (
                <g key={`disc-${di}`} filter="url(#telescope-discovery-glow)">
                  <circle
                    cx={dx}
                    cy={dy}
                    r={disc.size}
                    fill={`hsl(${disc.hue}, 50%, 45%)`}
                    opacity={discOpacity * 0.7}
                  />
                  <ellipse
                    cx={dx}
                    cy={dy}
                    rx={disc.size * 1.5}
                    ry={disc.size * 0.2}
                    fill="none"
                    stroke={`hsl(${disc.hue + 20}, 40%, 60%)`}
                    strokeWidth={1.5}
                    opacity={discOpacity * 0.5}
                    transform={`rotate(-15, ${dx}, ${dy})`}
                  />
                  <circle
                    cx={dx - disc.size * 0.25}
                    cy={dy - disc.size * 0.25}
                    r={disc.size * 0.2}
                    fill="#FFFFFF"
                    opacity={discOpacity * 0.2}
                  />
                </g>
              );
            }

            // Nebula
            return (
              <g key={`disc-${di}`} filter="url(#telescope-discovery-glow)">
                <ellipse
                  cx={dx}
                  cy={dy}
                  rx={disc.size * 1.2}
                  ry={disc.size * 0.8}
                  fill={`hsl(${disc.hue}, 60%, 40%)`}
                  opacity={discOpacity * 0.3}
                />
                <ellipse
                  cx={dx + disc.size * 0.3}
                  cy={dy - disc.size * 0.2}
                  rx={disc.size * 0.7}
                  ry={disc.size * 0.5}
                  fill={`hsl(${disc.hue + 30}, 70%, 50%)`}
                  opacity={discOpacity * 0.25}
                />
                <ellipse
                  cx={dx - disc.size * 0.2}
                  cy={dy + disc.size * 0.15}
                  rx={disc.size * 0.5}
                  ry={disc.size * 0.4}
                  fill={`hsl(${disc.hue - 20}, 50%, 55%)`}
                  opacity={discOpacity * 0.2}
                />
              </g>
            );
          })}

          {/* Vignette overlay inside circle */}
          <circle cx={cx} cy={cy} r={radius} fill={`url(#${vignetteId})`} />
        </g>

        {/* Crosshairs */}
        <line
          x1={cx - radius}
          y1={cy}
          x2={cx + radius}
          y2={cy}
          stroke="#88AACC"
          strokeWidth={0.8}
          opacity={0.3}
        />
        <line
          x1={cx}
          y1={cy - radius}
          x2={cx}
          y2={cy + radius}
          stroke="#88AACC"
          strokeWidth={0.8}
          opacity={0.3}
        />

        {/* Tick marks on crosshairs */}
        {[-0.75, -0.5, -0.25, 0.25, 0.5, 0.75].map((t, ti) => (
          <g key={`tick-${ti}`}>
            <line
              x1={cx + t * radius}
              y1={cy - 4}
              x2={cx + t * radius}
              y2={cy + 4}
              stroke="#88AACC"
              strokeWidth={0.6}
              opacity={0.25}
            />
            <line
              x1={cx - 4}
              y1={cy + t * radius}
              x2={cx + 4}
              y2={cy + t * radius}
              stroke="#88AACC"
              strokeWidth={0.6}
              opacity={0.25}
            />
          </g>
        ))}

        {/* Circle border (eyepiece rim) */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#334455"
          strokeWidth={4}
          opacity={0.7}
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius + 2}
          fill="none"
          stroke="#1A2233"
          strokeWidth={2}
          opacity={0.5}
        />
      </svg>
    </div>
  );
};
