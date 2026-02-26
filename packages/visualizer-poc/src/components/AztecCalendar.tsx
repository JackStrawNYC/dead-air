/**
 * AztecCalendar — Circular Aztec/Mayan calendar stone design.
 * Concentric rings of geometric patterns: center sun face (simplified),
 * inner ring of glyphs (rectangles with dots), outer ring of triangular points.
 * Stone gold/brown color with turquoise accents.
 * Rings rotate at different speeds. Energy drives glow intensity.
 * Cycle: 80s, 24s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2400; // 80 seconds at 30fps
const DURATION = 720; // 24 seconds visible

const NUM_GLYPHS = 20;
const NUM_OUTER_POINTS = 32;
const NUM_INNER_MARKS = 12;

// Stone gold/brown palette with turquoise accents
const STONE_GOLD = "#C8A84E";
const DARK_GOLD = "#8B6914";
const TURQUOISE = "#40E0D0";
const WARM_STONE = "#D4A843";
const DEEP_BROWN = "#6B4226";

interface Props {
  frames: EnhancedFrameData[];
}

export const AztecCalendar: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const baseRadius = Math.min(width, height) * 0.28;

  // Ring rotation speeds (different for each ring)
  const speedMult = 0.5 + energy * 2.0;
  const outerRotation = frame * 0.08 * speedMult;
  const middleRotation = frame * -0.12 * speedMult;
  const innerRotation = frame * 0.18 * speedMult;

  // Glow driven by energy
  const glowSize = interpolate(energy, [0.03, 0.3], [3, 15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sun face pulse
  const sunPulse = 1 + Math.sin(frame * 0.08) * energy * 0.15;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${STONE_GOLD}) drop-shadow(0 0 ${glowSize * 2}px ${TURQUOISE})`,
          willChange: "opacity",
        }}
      >
        {/* Outer ring: triangular points */}
        <g transform={`translate(${cx}, ${cy}) rotate(${outerRotation})`}>
          <circle cx={0} cy={0} r={baseRadius} fill="none" stroke={STONE_GOLD} strokeWidth={2} opacity={0.4} />
          <circle cx={0} cy={0} r={baseRadius * 1.02} fill="none" stroke={DARK_GOLD} strokeWidth={1} opacity={0.25} />
          {Array.from({ length: NUM_OUTER_POINTS }).map((_, i) => {
            const angle = (i * 360 / NUM_OUTER_POINTS) * Math.PI / 180;
            const innerR = baseRadius * 0.92;
            const outerR = baseRadius * 1.08;
            const halfSpread = (Math.PI / NUM_OUTER_POINTS) * 0.6;
            const tipX = Math.cos(angle) * outerR;
            const tipY = Math.sin(angle) * outerR;
            const leftX = Math.cos(angle - halfSpread) * innerR;
            const leftY = Math.sin(angle - halfSpread) * innerR;
            const rightX = Math.cos(angle + halfSpread) * innerR;
            const rightY = Math.sin(angle + halfSpread) * innerR;
            const color = i % 4 === 0 ? TURQUOISE : STONE_GOLD;
            return (
              <polygon
                key={`outer-${i}`}
                points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
                fill={color}
                opacity={i % 4 === 0 ? 0.5 : 0.3}
                stroke={DARK_GOLD}
                strokeWidth={0.5}
              />
            );
          })}
        </g>

        {/* Middle ring: glyph rectangles with dots */}
        <g transform={`translate(${cx}, ${cy}) rotate(${middleRotation})`}>
          <circle cx={0} cy={0} r={baseRadius * 0.75} fill="none" stroke={WARM_STONE} strokeWidth={1.5} opacity={0.5} />
          <circle cx={0} cy={0} r={baseRadius * 0.6} fill="none" stroke={WARM_STONE} strokeWidth={1.5} opacity={0.5} />
          {Array.from({ length: NUM_GLYPHS }).map((_, i) => {
            const angle = (i * 360 / NUM_GLYPHS) * Math.PI / 180;
            const glyphR = baseRadius * 0.675;
            const gx = Math.cos(angle) * glyphR;
            const gy = Math.sin(angle) * glyphR;
            const glyphW = baseRadius * 0.08;
            const glyphH = baseRadius * 0.11;
            const rot = (i * 360 / NUM_GLYPHS);
            const color = i % 3 === 0 ? TURQUOISE : STONE_GOLD;
            return (
              <g key={`glyph-${i}`} transform={`translate(${gx}, ${gy}) rotate(${rot})`}>
                <rect
                  x={-glyphW / 2}
                  y={-glyphH / 2}
                  width={glyphW}
                  height={glyphH}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.2}
                  opacity={0.55}
                  rx={2}
                />
                {/* Dot inside glyph */}
                <circle cx={0} cy={0} r={2.5} fill={color} opacity={0.6} />
              </g>
            );
          })}
        </g>

        {/* Inner ring: small marks */}
        <g transform={`translate(${cx}, ${cy}) rotate(${innerRotation})`}>
          <circle cx={0} cy={0} r={baseRadius * 0.45} fill="none" stroke={STONE_GOLD} strokeWidth={1.5} opacity={0.45} />
          {Array.from({ length: NUM_INNER_MARKS }).map((_, i) => {
            const angle = (i * 360 / NUM_INNER_MARKS) * Math.PI / 180;
            const r1 = baseRadius * 0.40;
            const r2 = baseRadius * 0.50;
            return (
              <line
                key={`inner-${i}`}
                x1={Math.cos(angle) * r1}
                y1={Math.sin(angle) * r1}
                x2={Math.cos(angle) * r2}
                y2={Math.sin(angle) * r2}
                stroke={WARM_STONE}
                strokeWidth={2}
                opacity={0.5}
                strokeLinecap="round"
              />
            );
          })}
        </g>

        {/* Center sun face (simplified) */}
        <g transform={`translate(${cx}, ${cy}) scale(${sunPulse})`}>
          {/* Sun disk */}
          <circle cx={0} cy={0} r={baseRadius * 0.28} fill="none" stroke={STONE_GOLD} strokeWidth={2.5} opacity={0.6} />
          <circle cx={0} cy={0} r={baseRadius * 0.22} fill={DARK_GOLD} opacity={0.2} />

          {/* Sun rays from center */}
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i * 45) * Math.PI / 180;
            const r1 = baseRadius * 0.23;
            const r2 = baseRadius * 0.35;
            return (
              <line
                key={`ray-${i}`}
                x1={Math.cos(angle) * r1}
                y1={Math.sin(angle) * r1}
                x2={Math.cos(angle) * r2}
                y2={Math.sin(angle) * r2}
                stroke={STONE_GOLD}
                strokeWidth={2}
                opacity={0.5}
                strokeLinecap="round"
              />
            );
          })}

          {/* Eyes */}
          <ellipse cx={-baseRadius * 0.08} cy={-baseRadius * 0.04} rx={baseRadius * 0.04} ry={baseRadius * 0.025} fill={TURQUOISE} opacity={0.7} />
          <ellipse cx={baseRadius * 0.08} cy={-baseRadius * 0.04} rx={baseRadius * 0.04} ry={baseRadius * 0.025} fill={TURQUOISE} opacity={0.7} />

          {/* Nose */}
          <line
            x1={0}
            y1={-baseRadius * 0.01}
            x2={0}
            y2={baseRadius * 0.05}
            stroke={STONE_GOLD}
            strokeWidth={1.5}
            opacity={0.5}
          />

          {/* Mouth */}
          <path
            d={`M ${-baseRadius * 0.06} ${baseRadius * 0.09} Q 0 ${baseRadius * 0.14} ${baseRadius * 0.06} ${baseRadius * 0.09}`}
            fill="none"
            stroke={STONE_GOLD}
            strokeWidth={1.5}
            opacity={0.5}
          />
        </g>
      </svg>
    </div>
  );
};
