/**
 * ArtDeco -- Bold geometric Art Deco patterns.
 * Radiating sunburst fan shapes, zigzag chevrons, and stepped pyramid forms.
 * Gold/black/cream palette. Symmetric about center axis. Elements build
 * progressively (stroke-dasharray animation). Energy drives glow intensity.
 * Cycle: 70s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2100;    // 70 seconds at 30fps
const DURATION = 540;  // 18 seconds visible

const GOLD = "#D4A017";
const CREAM = "#F5E6C8";
const BRIGHT_GOLD = "#FFD700";

interface Props {
  frames: EnhancedFrameData[];
}

export const ArtDeco: React.FC<Props> = ({ frames }) => {
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

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity =
    Math.min(fadeIn, fadeOut) *
    interpolate(energy, [0.03, 0.25], [0.15, 0.5], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  if (opacity < 0.01) return null;

  // Glow intensity driven by energy
  const glowSize = interpolate(energy, [0.03, 0.3], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Build progress for sequential element reveal
  const buildProgress = interpolate(progress, [0.03, 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const cx = width / 2;
  const cy = height / 2;

  // --- Sunburst fan rays ---
  const NUM_RAYS = 24;
  const rayLength = Math.min(width, height) * 0.45;
  const raysVisible = Math.floor(buildProgress * NUM_RAYS);

  // --- Chevron zigzags ---
  const NUM_CHEVRONS = 6;
  const chevronSpacing = height * 0.06;
  const chevronWidth = width * 0.35;
  const chevronsVisible = Math.floor(
    interpolate(buildProgress, [0.2, 0.7], [0, NUM_CHEVRONS], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  // --- Stepped pyramid ---
  const NUM_STEPS = 5;
  const stepsVisible = Math.floor(
    interpolate(buildProgress, [0.4, 0.9], [0, NUM_STEPS], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const stepWidth = width * 0.08;
  const stepHeight = height * 0.03;

  // Dash animation offset for shimmer
  const dashOffset = frame * 0.5;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${GOLD}88)`,
        }}
      >
        {/* Sunburst rays from center-bottom */}
        <g>
          {Array.from({ length: raysVisible }).map((_, ri) => {
            // Fan from -80deg to +80deg (half-circle up)
            const angle = -80 + (ri / (NUM_RAYS - 1)) * 160;
            const rad = (angle * Math.PI) / 180;
            const x2 = cx + Math.sin(rad) * rayLength;
            const y2 = cy - Math.cos(rad) * rayLength;

            // Alternating gold/cream
            const color = ri % 2 === 0 ? GOLD : CREAM;
            const strokeW = ri % 3 === 0 ? 2 : 1;

            // Dash animation for draw-in
            const segLen = rayLength;
            const drawLen = interpolate(
              buildProgress,
              [ri / NUM_RAYS, Math.min(1, ri / NUM_RAYS + 0.15)],
              [0, segLen],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );

            return (
              <line
                key={`ray-${ri}`}
                x1={cx}
                y1={cy}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={strokeW}
                strokeDasharray={`${drawLen} ${segLen}`}
                opacity={0.6}
              />
            );
          })}
        </g>

        {/* Concentric arcs at top of sunburst */}
        {buildProgress > 0.3 && (
          <g opacity={interpolate(buildProgress, [0.3, 0.5], [0, 0.5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}>
            {[0.6, 0.75, 0.9].map((r, ai) => (
              <path
                key={`arc-${ai}`}
                d={`M ${cx - rayLength * r} ${cy} A ${rayLength * r} ${rayLength * r} 0 0 1 ${cx + rayLength * r} ${cy}`}
                fill="none"
                stroke={ai % 2 === 0 ? GOLD : CREAM}
                strokeWidth={1.5}
                strokeDasharray="8 4"
                strokeDashoffset={dashOffset * (ai % 2 === 0 ? 1 : -1)}
                opacity={0.5}
              />
            ))}
          </g>
        )}

        {/* Zigzag chevrons -- symmetric about center, below sunburst */}
        <g>
          {Array.from({ length: chevronsVisible }).map((_, ci) => {
            const y = cy + height * 0.08 + ci * chevronSpacing;
            const indent = ci * width * 0.015;
            const hw = chevronWidth - indent;
            const peakY = y - chevronSpacing * 0.35;

            const d = `M ${cx - hw} ${y} L ${cx} ${peakY} L ${cx + hw} ${y}`;
            const color = ci % 2 === 0 ? GOLD : CREAM;

            const segLen = hw * 3;
            const drawLen = interpolate(
              buildProgress,
              [0.2 + ci * 0.08, 0.2 + ci * 0.08 + 0.15],
              [0, segLen],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );

            return (
              <path
                key={`chev-${ci}`}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={ci === 0 ? 2.5 : 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${drawLen} ${segLen}`}
                opacity={0.55}
              />
            );
          })}
        </g>

        {/* Stepped pyramid at bottom */}
        <g>
          {Array.from({ length: stepsVisible }).map((_, si) => {
            const level = NUM_STEPS - si; // build from bottom up
            const sw = stepWidth * level;
            const sh = stepHeight;
            const sx = cx - sw / 2;
            const sy = height * 0.82 - si * sh;

            return (
              <rect
                key={`step-${si}`}
                x={sx}
                y={sy}
                width={sw}
                height={sh}
                fill="none"
                stroke={si % 2 === 0 ? GOLD : BRIGHT_GOLD}
                strokeWidth={1.5}
                opacity={0.5}
              />
            );
          })}
        </g>

        {/* Corner keystone accents */}
        {buildProgress > 0.5 && (
          <g opacity={interpolate(buildProgress, [0.5, 0.7], [0, 0.4], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}>
            {/* Top-left */}
            <path d={`M 0 80 L 0 0 L 80 0`} fill="none" stroke={GOLD} strokeWidth={2} />
            <path d={`M 0 60 L 0 20 L 20 0`} fill="none" stroke={CREAM} strokeWidth={1} />
            {/* Top-right */}
            <path d={`M ${width} 80 L ${width} 0 L ${width - 80} 0`} fill="none" stroke={GOLD} strokeWidth={2} />
            <path d={`M ${width} 60 L ${width} 20 L ${width - 20} 0`} fill="none" stroke={CREAM} strokeWidth={1} />
            {/* Bottom-left */}
            <path d={`M 0 ${height - 80} L 0 ${height} L 80 ${height}`} fill="none" stroke={GOLD} strokeWidth={2} />
            {/* Bottom-right */}
            <path d={`M ${width} ${height - 80} L ${width} ${height} L ${width - 80} ${height}`} fill="none" stroke={GOLD} strokeWidth={2} />
          </g>
        )}

        {/* Central keystone diamond */}
        {buildProgress > 0.7 && (
          <g opacity={interpolate(buildProgress, [0.7, 0.85], [0, 0.6], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}>
            <polygon
              points={`${cx},${cy - 30} ${cx + 18},${cy} ${cx},${cy + 30} ${cx - 18},${cy}`}
              fill="none"
              stroke={BRIGHT_GOLD}
              strokeWidth={2}
            />
            <circle cx={cx} cy={cy} r={6 + energy * 4} fill={GOLD} opacity={0.4} />
          </g>
        )}
      </svg>
    </div>
  );
};
