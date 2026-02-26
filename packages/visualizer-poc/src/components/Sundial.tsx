/**
 * Sundial — Ornate sundial with shadow that rotates slowly over time.
 * The gnomon (shadow-casting blade) glows with energy. Hour markings around
 * the circular dial plate. Shadow angle tracks accumulated frame time.
 * Warm stone/brass aesthetic. Cycle: 70s, 20s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2100; // 70s at 30fps
const DURATION = 600; // 20s visible

interface Props {
  frames: EnhancedFrameData[];
}

export const Sundial: React.FC<Props> = ({ frames }) => {
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

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.55;
  const dialRadius = Math.min(width, height) * 0.2;

  // Colors: warm stone and brass
  const stoneColor = "#D2C4A0";
  const stoneDark = "#A89870";
  const brassColor = "#D4A850";
  const brassDark = "#8B6914";
  const shadowColor = "rgba(40, 30, 10, 0.45)";

  // Shadow angle rotates slowly (full rotation over the visible duration)
  const shadowAngle = interpolate(cycleFrame, [0, DURATION], [-60, 120], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shadowRad = (shadowAngle - 90) * Math.PI / 180;

  // Gnomon glow driven by energy
  const gnomonGlow = interpolate(energy, [0.03, 0.3], [2, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const gnomonBrightness = interpolate(energy, [0.03, 0.3], [0.6, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Hour markings (I-XII)
  const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

  // Shadow length driven slightly by energy
  const shadowLen = dialRadius * (0.7 + energy * 0.3);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${gnomonGlow * 0.5}px rgba(212, 168, 80, 0.3))`,
          willChange: "opacity",
        }}
      >
        <defs>
          <radialGradient id="sundial-plate" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor={stoneColor} stopOpacity={0.15} />
            <stop offset="80%" stopColor={stoneDark} stopOpacity={0.08} />
            <stop offset="100%" stopColor={stoneDark} stopOpacity={0.03} />
          </radialGradient>
        </defs>

        <g transform={`translate(${cx}, ${cy})`}>
          {/* Dial plate */}
          <ellipse cx={0} cy={0} rx={dialRadius} ry={dialRadius * 0.85} fill="url(#sundial-plate)" stroke={stoneDark} strokeWidth={2} opacity={0.5} />
          <ellipse cx={0} cy={0} rx={dialRadius * 0.95} ry={dialRadius * 0.81} fill="none" stroke={brassColor} strokeWidth={0.8} opacity={0.3} />

          {/* Hour lines radiating from center */}
          {ROMAN.map((num, hi) => {
            const angle = ((hi * 30 - 90) * Math.PI) / 180;
            const innerR = dialRadius * 0.25;
            const outerR = dialRadius * 0.78;
            const textR = dialRadius * 0.88;
            return (
              <g key={`hour-${hi}`}>
                <line
                  x1={Math.cos(angle) * innerR}
                  y1={Math.sin(angle) * innerR * 0.85}
                  x2={Math.cos(angle) * outerR}
                  y2={Math.sin(angle) * outerR * 0.85}
                  stroke={brassDark}
                  strokeWidth={hi % 3 === 0 ? 1.5 : 0.8}
                  opacity={hi % 3 === 0 ? 0.5 : 0.3}
                />
                <text
                  x={Math.cos(angle) * textR}
                  y={Math.sin(angle) * textR * 0.85}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={brassColor}
                  fontSize={dialRadius * 0.09}
                  fontFamily="serif"
                  opacity={0.6}
                >
                  {num}
                </text>
              </g>
            );
          })}

          {/* Shadow cast by gnomon */}
          <line
            x1={0}
            y1={0}
            x2={Math.cos(shadowRad) * shadowLen}
            y2={Math.sin(shadowRad) * shadowLen * 0.85}
            stroke={shadowColor}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.6}
          />
          {/* Shadow edge softening */}
          <line
            x1={0}
            y1={0}
            x2={Math.cos(shadowRad) * shadowLen * 0.95}
            y2={Math.sin(shadowRad) * shadowLen * 0.85 * 0.95}
            stroke={shadowColor}
            strokeWidth={10}
            strokeLinecap="round"
            opacity={0.2}
          />

          {/* Gnomon (triangular blade standing up from center) */}
          <polygon
            points={`0,${-dialRadius * 0.35} ${-6},0 ${6},0`}
            fill={brassColor}
            opacity={gnomonBrightness * 0.7}
            stroke={brassDark}
            strokeWidth={1}
          />
          {/* Gnomon glow */}
          <polygon
            points={`0,${-dialRadius * 0.32} ${-4},${-2} ${4},${-2}`}
            fill="#FFE0A0"
            opacity={interpolate(energy, [0.03, 0.3], [0.05, 0.35], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
            filter={`blur(${gnomonGlow * 0.3}px)`}
          />

          {/* Center decorative ring */}
          <circle cx={0} cy={0} r={8} fill={brassColor} opacity={0.5} stroke={brassDark} strokeWidth={1} />
          <circle cx={0} cy={0} r={3} fill="#FFE0A0" opacity={gnomonBrightness * 0.4} />

          {/* Decorative edge ornaments at cardinal points */}
          {[0, 90, 180, 270].map((deg) => {
            const rad = (deg - 90) * Math.PI / 180;
            const ox = Math.cos(rad) * dialRadius * 0.98;
            const oy = Math.sin(rad) * dialRadius * 0.98 * 0.85;
            return (
              <circle key={`orn-${deg}`} cx={ox} cy={oy} r={3.5} fill={brassColor} opacity={0.35} />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
