/**
 * WindChimes -- 5-7 hanging chime tubes of different lengths suspended from
 * a horizontal bar. Tubes sway with pendulum motion, phase-offset. Longer
 * tubes = lower swing frequency (physical accuracy). Tubes clink/flash when
 * they come close to each other. Metallic silver/bronze colors. Sway amplitude
 * driven by energy. Cycle: 60s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1800;   // 60 seconds at 30fps
const DURATION = 540;  // 18 seconds visible

interface ChimeTube {
  /** Fraction of bar width for hang point (0-1) */
  hangFrac: number;
  /** Tube length in pixels (relative to screen) */
  lengthFrac: number; // 0.08 - 0.22
  /** Tube width */
  tubeWidth: number;
  /** Phase offset for swing */
  phase: number;
  /** Color */
  color: string;
  /** Highlight color */
  highlight: string;
}

function generateChimes(seed: number): ChimeTube[] {
  const rng = seeded(seed);
  const count = 6;
  const chimes: ChimeTube[] = [];

  const COLORS = [
    { color: "#C0C0C0", highlight: "#E8E8E8" }, // silver
    { color: "#CD7F32", highlight: "#E8A852" }, // bronze
    { color: "#B8B8B8", highlight: "#DEDEDE" }, // light silver
    { color: "#A0522D", highlight: "#C8733D" }, // dark bronze
    { color: "#D4D4D4", highlight: "#F0F0F0" }, // platinum
    { color: "#B87333", highlight: "#D89353" }, // copper
  ];

  for (let i = 0; i < count; i++) {
    const colorSet = COLORS[i % COLORS.length];
    chimes.push({
      hangFrac: (i + 0.5) / count,
      lengthFrac: 0.08 + rng() * 0.14,
      tubeWidth: 5 + rng() * 4,
      phase: rng() * Math.PI * 2,
      color: colorSet.color,
      highlight: colorSet.highlight,
    });
  }

  return chimes;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const WindChimes: React.FC<Props> = ({ frames }) => {
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

  const chimes = React.useMemo(() => generateChimes(60177), []);

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
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.03, 0.25], [0.2, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  // Sway amplitude driven by energy
  const swayAmp = interpolate(energy, [0.02, 0.3], [5, 25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bar position
  const barY = height * 0.12;
  const barX1 = width * 0.25;
  const barX2 = width * 0.75;
  const barWidth = barX2 - barX1;

  // Compute each chime's bottom position for proximity checks
  const chimePositions: Array<{ bottomX: number; bottomY: number }> = [];

  for (const chime of chimes) {
    const hangX = barX1 + chime.hangFrac * barWidth;
    const tubeLen = chime.lengthFrac * height;

    // Pendulum physics: freq proportional to 1/sqrt(length)
    // Longer tube = slower swing
    const freq = 0.04 / Math.sqrt(chime.lengthFrac / 0.08);
    const angle = swayAmp * Math.sin(frame * freq + chime.phase);
    const angleRad = (angle * Math.PI) / 180;

    const bottomX = hangX + Math.sin(angleRad) * tubeLen;
    const bottomY = barY + Math.cos(angleRad) * tubeLen;
    chimePositions.push({ bottomX, bottomY });
  }

  // Check proximity between adjacent chimes for clink flash
  const clinkPairs: Array<{ midX: number; midY: number; intensity: number }> = [];
  for (let ci = 0; ci < chimePositions.length - 1; ci++) {
    const a = chimePositions[ci];
    const b = chimePositions[ci + 1];
    const dx = a.bottomX - b.bottomX;
    const dy = a.bottomY - b.bottomY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const threshold = 30;
    if (dist < threshold) {
      const intensity = 1 - dist / threshold;
      clinkPairs.push({
        midX: (a.bottomX + b.bottomX) / 2,
        midY: (a.bottomY + b.bottomY) / 2,
        intensity,
      });
    }
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          <filter id="wc-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="wc-tube-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#999" stopOpacity={0.6} />
            <stop offset="40%" stopColor="#DDD" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#888" stopOpacity={0.5} />
          </linearGradient>
        </defs>

        {/* Horizontal support bar */}
        <line
          x1={barX1 - 15}
          y1={barY}
          x2={barX2 + 15}
          y2={barY}
          stroke="#AAA"
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.5}
        />
        {/* Bar end caps */}
        <circle cx={barX1 - 15} cy={barY} r={5} fill="#888" opacity={0.4} />
        <circle cx={barX2 + 15} cy={barY} r={5} fill="#888" opacity={0.4} />

        {/* Chime tubes */}
        {chimes.map((chime, ci) => {
          const hangX = barX1 + chime.hangFrac * barWidth;
          const tubeLen = chime.lengthFrac * height;
          const freq = 0.04 / Math.sqrt(chime.lengthFrac / 0.08);
          const angle = swayAmp * Math.sin(frame * freq + chime.phase);
          const angleRad = (angle * Math.PI) / 180;

          const topX = hangX + Math.sin(angleRad) * 0;
          const topY = barY;
          const bottomX = hangX + Math.sin(angleRad) * tubeLen;
          const bottomY = barY + Math.cos(angleRad) * tubeLen;

          // Perpendicular offsets for tube width
          const perpX = Math.cos(angleRad) * (chime.tubeWidth / 2);
          const perpY = -Math.sin(angleRad) * (chime.tubeWidth / 2);

          return (
            <g key={`chime-${ci}`}>
              {/* String from bar to tube top */}
              <line
                x1={hangX}
                y1={barY}
                x2={hangX + Math.sin(angleRad) * 10}
                y2={barY + Math.cos(angleRad) * 10}
                stroke="#999"
                strokeWidth={1}
                opacity={0.5}
              />

              {/* Tube body (rectangle along pendulum axis) */}
              <polygon
                points={`${topX + Math.sin(angleRad) * 10 - perpX},${topY + Math.cos(angleRad) * 10 - perpY} ${topX + Math.sin(angleRad) * 10 + perpX},${topY + Math.cos(angleRad) * 10 + perpY} ${bottomX + perpX},${bottomY + perpY} ${bottomX - perpX},${bottomY - perpY}`}
                fill={chime.color}
                opacity={0.6}
                stroke={chime.highlight}
                strokeWidth={0.5}
              />

              {/* Highlight stripe down center */}
              <line
                x1={hangX + Math.sin(angleRad) * 12}
                y1={barY + Math.cos(angleRad) * 12}
                x2={bottomX}
                y2={bottomY}
                stroke={chime.highlight}
                strokeWidth={1}
                opacity={0.3}
              />

              {/* Bottom cap */}
              <circle
                cx={bottomX}
                cy={bottomY}
                r={chime.tubeWidth / 2 + 1}
                fill={chime.color}
                opacity={0.5}
              />
            </g>
          );
        })}

        {/* Clink flash effects */}
        {clinkPairs.map((clink, ci) => (
          <g key={`clink-${ci}`}>
            <circle
              cx={clink.midX}
              cy={clink.midY}
              r={8 + clink.intensity * 12}
              fill="white"
              opacity={clink.intensity * 0.5}
              filter="url(#wc-glow)"
            />
            {/* Small spark lines */}
            {[0, 60, 120, 180, 240, 300].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              const len = 4 + clink.intensity * 8;
              return (
                <line
                  key={`spark-${ci}-${deg}`}
                  x1={clink.midX + Math.cos(rad) * 3}
                  y1={clink.midY + Math.sin(rad) * 3}
                  x2={clink.midX + Math.cos(rad) * len}
                  y2={clink.midY + Math.sin(rad) * len}
                  stroke="white"
                  strokeWidth={1}
                  opacity={clink.intensity * 0.6}
                />
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
};
