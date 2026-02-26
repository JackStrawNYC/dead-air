/**
 * SpinningTop — 3-4 spinning tops at different positions.
 * Each top is a cone/diamond shape with pointed bottom tip.
 * Tops precess (wobble) — tilt angle oscillates. Surface has spiral stripe
 * pattern that rotates. Tops spin faster with energy, wobble more as energy
 * decreases (losing stability). Bright toy colors.
 * Cycle: 45s (1350 frames), 12s (360 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE_TOTAL = 1350; // 45s
const VISIBLE_DURATION = 360; // 12s
const NUM_TOPS = 4;

interface TopData {
  cx: number; // normalized x position 0-1
  cy: number; // normalized y position 0-1
  size: number; // radius of the top body
  hue: number; // primary hue
  stripeHue: number; // stripe hue
  wobbleFreq: number; // wobble frequency
  spinFreq: number; // spin frequency multiplier
  phase: number;
}

const TOP_COLORS = [
  { hue: 0, stripe: 45 },     // red with orange stripes
  { hue: 210, stripe: 50 },   // blue with gold stripes
  { hue: 130, stripe: 300 },  // green with magenta stripes
  { hue: 290, stripe: 170 },  // purple with cyan stripes
];

function generateTops(seed: number): TopData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_TOPS }, (_, i) => ({
    cx: 0.15 + (i / (NUM_TOPS - 1)) * 0.7,
    cy: 0.55 + rng() * 0.2,
    size: 30 + rng() * 15,
    hue: TOP_COLORS[i % TOP_COLORS.length].hue,
    stripeHue: TOP_COLORS[i % TOP_COLORS.length].stripe,
    wobbleFreq: 0.03 + rng() * 0.02,
    spinFreq: 0.8 + rng() * 0.4,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SpinningTop: React.FC<Props> = ({ frames }) => {
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

  const tops = React.useMemo(() => generateTops(55667788), []);

  const cycleFrame = frame % CYCLE_TOTAL;

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  const fadeIn = interpolate(progress, [0, 0.07], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.75;

  if (opacity < 0.01) return null;

  // Spin speed from energy
  const spinSpeed = interpolate(energy, [0.03, 0.35], [2, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Wobble amplitude inversely related to energy (losing stability when quiet)
  const wobbleAmp = interpolate(energy, [0.05, 0.35], [18, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          <filter id="top-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {tops.map((top, ti) => {
          const cx = top.cx * width;
          const cy = top.cy * height;

          // Wobble (precession): tilt angle oscillates
          const wobble = Math.sin(frame * top.wobbleFreq + top.phase) * wobbleAmp;
          // Spiral stripe rotation
          const spin = frame * spinSpeed * top.spinFreq;

          const bodyHeight = top.size * 2;
          const bodyRadius = top.size;
          const tipLength = top.size * 0.8;

          // Top body color
          const color = `hsl(${top.hue}, 85%, 55%)`;
          const stripeColor = `hsl(${top.stripeHue}, 90%, 65%)`;
          const highlightColor = `hsl(${top.hue}, 90%, 75%)`;

          // Number of spiral stripes
          const numStripes = 6;

          return (
            <g
              key={ti}
              transform={`translate(${cx}, ${cy}) rotate(${wobble})`}
              filter="url(#top-glow)"
            >
              {/* Shadow on ground */}
              <ellipse
                cx={0}
                cy={tipLength + 4}
                rx={bodyRadius * 0.6}
                ry={4}
                fill="rgba(0,0,0,0.2)"
              />

              {/* Tip (pointed bottom) */}
              <polygon
                points={`${-bodyRadius * 0.15},0 ${bodyRadius * 0.15},0 0,${tipLength}`}
                fill={color}
              />

              {/* Main body (diamond/cone shape) — upper half */}
              <polygon
                points={`0,${-bodyHeight * 0.6} ${bodyRadius},0 0,${bodyHeight * 0.1} ${-bodyRadius},0`}
                fill={color}
              />

              {/* Spiral stripes via clipped arcs */}
              {Array.from({ length: numStripes }).map((_, si) => {
                const angle = (si / numStripes) * 360 + spin;
                const rad = (angle * Math.PI) / 180;
                const stripeX = Math.cos(rad) * bodyRadius * 0.5;
                const stripeTopY = -bodyHeight * 0.5;
                const stripeMidY = 0;

                return (
                  <line
                    key={si}
                    x1={stripeX * 0.2}
                    y1={stripeTopY}
                    x2={stripeX}
                    y2={stripeMidY}
                    stroke={stripeColor}
                    strokeWidth={3}
                    opacity={0.6}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Top cap (handle/knob) */}
              <circle
                cx={0}
                cy={-bodyHeight * 0.6}
                r={bodyRadius * 0.2}
                fill={highlightColor}
              />
              <circle
                cx={0}
                cy={-bodyHeight * 0.6}
                r={bodyRadius * 0.1}
                fill="white"
                opacity={0.5}
              />

              {/* Highlight edge */}
              <ellipse
                cx={-bodyRadius * 0.2}
                cy={-bodyHeight * 0.25}
                rx={bodyRadius * 0.15}
                ry={bodyHeight * 0.15}
                fill="rgba(255,255,255,0.2)"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
