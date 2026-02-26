/**
 * PrayerFlags -- A string of 8-12 rectangular Tibetan prayer flags strung
 * across upper portion of screen. Flags alternate in traditional colors
 * (blue, white, red, green, yellow). Each flag waves/flutters with sine
 * deformation. Flags have faint symbol patterns. Flutter amplitude driven
 * by energy (wind). Always visible at 0.1-0.2 opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Traditional Tibetan prayer flag colors (in order)
const FLAG_COLORS = [
  "#2962FF", // blue (sky/space)
  "#FAFAFA", // white (air/wind)
  "#D32F2F", // red (fire)
  "#2E7D32", // green (water)
  "#FDD835", // yellow (earth)
];

interface FlagDef {
  color: string;
  phaseOffset: number;
  /** Symbol index for faint pattern */
  symbolIdx: number;
}

function generateFlags(seed: number): FlagDef[] {
  const rng = seeded(seed);
  const count = 10;
  const flags: FlagDef[] = [];
  for (let i = 0; i < count; i++) {
    flags.push({
      color: FLAG_COLORS[i % FLAG_COLORS.length],
      phaseOffset: rng() * Math.PI * 2,
      symbolIdx: Math.floor(rng() * 4),
    });
  }
  return flags;
}

// Simple SVG symbols for prayer flag patterns
function renderSymbol(symbolIdx: number, flagW: number, flagH: number, color: string): React.ReactNode {
  const cx = flagW / 2;
  const cy = flagH / 2;
  const s = Math.min(flagW, flagH) * 0.25;

  switch (symbolIdx) {
    case 0: // Wind horse (simplified rectangle + triangle)
      return (
        <g opacity={0.15} stroke={color} strokeWidth={0.8} fill="none">
          <rect x={cx - s * 0.6} y={cy - s * 0.3} width={s * 1.2} height={s * 0.6} />
          <polygon points={`${cx},${cy - s * 0.7} ${cx - s * 0.4},${cy - s * 0.3} ${cx + s * 0.4},${cy - s * 0.3}`} />
        </g>
      );
    case 1: // Dharma wheel (circle + spokes)
      return (
        <g opacity={0.15} stroke={color} strokeWidth={0.8} fill="none">
          <circle cx={cx} cy={cy} r={s * 0.5} />
          {[0, 45, 90, 135].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            return (
              <line
                key={deg}
                x1={cx + Math.cos(rad) * s * 0.15}
                y1={cy + Math.sin(rad) * s * 0.15}
                x2={cx + Math.cos(rad) * s * 0.5}
                y2={cy + Math.sin(rad) * s * 0.5}
              />
            );
          })}
        </g>
      );
    case 2: // Lotus (overlapping petals)
      return (
        <g opacity={0.15} stroke={color} strokeWidth={0.8} fill="none">
          {[0, 72, 144, 216, 288].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const px = cx + Math.cos(rad) * s * 0.3;
            const py = cy + Math.sin(rad) * s * 0.3;
            return (
              <ellipse
                key={deg}
                cx={px}
                cy={py}
                rx={s * 0.25}
                ry={s * 0.12}
                transform={`rotate(${deg}, ${px}, ${py})`}
              />
            );
          })}
        </g>
      );
    case 3: // Endless knot (simplified crossed lines)
    default:
      return (
        <g opacity={0.15} stroke={color} strokeWidth={0.8} fill="none">
          <rect x={cx - s * 0.4} y={cy - s * 0.4} width={s * 0.8} height={s * 0.8} rx={s * 0.1} />
          <line x1={cx - s * 0.4} y1={cy} x2={cx + s * 0.4} y2={cy} />
          <line x1={cx} y1={cy - s * 0.4} x2={cx} y2={cy + s * 0.4} />
        </g>
      );
  }
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PrayerFlags: React.FC<Props> = ({ frames }) => {
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

  const flags = React.useMemo(() => generateFlags(10877), []);

  // Always visible at 0.1-0.2 opacity
  const opacity = interpolate(energy, [0.02, 0.2], [0.1, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  // Flutter amplitude driven by energy (wind)
  const flutterAmp = interpolate(energy, [0.02, 0.3], [3, 15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // String endpoints
  const stringY = height * 0.08;
  const stringStartX = width * 0.02;
  const stringEndX = width * 0.98;
  const stringLen = stringEndX - stringStartX;

  // Flag dimensions
  const flagCount = flags.length;
  const flagSpacing = stringLen / flagCount;
  const flagW = flagSpacing * 0.85;
  const flagH = flagW * 1.2;

  // String sag (catenary approximation)
  const sag = 15 + energy * 5;

  function getStringY(xFrac: number): number {
    // Parabolic sag: max at center
    const t = xFrac * 2 - 1; // -1 to 1
    return stringY + sag * (1 - t * t);
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        {/* The string */}
        <path
          d={`M ${stringStartX} ${getStringY(0)} ${Array.from({ length: 20 }, (_, i) => {
            const frac = (i + 1) / 20;
            return `L ${stringStartX + frac * stringLen} ${getStringY(frac)}`;
          }).join(" ")}`}
          fill="none"
          stroke="#AAA"
          strokeWidth={1.5}
          opacity={0.4}
        />

        {/* Flags */}
        {flags.map((flag, fi) => {
          const xFrac = (fi + 0.5) / flagCount;
          const flagX = stringStartX + xFrac * stringLen - flagW / 2;
          const flagTopY = getStringY(xFrac);

          // Wave deformation: sine along y axis of flag
          // Creates flutter/wave effect
          const flutterFreq = 0.06 + fi * 0.005;
          const phase = flag.phaseOffset;

          // Generate deformed flag as path with wavy bottom and sides
          const segments = 8;
          const topPoints: string[] = [];
          const bottomPoints: string[] = [];

          for (let s = 0; s <= segments; s++) {
            const t = s / segments;
            const px = flagX + t * flagW;
            // Top edge: slight wave
            const topWave = Math.sin(frame * flutterFreq + phase + t * 3) * flutterAmp * 0.3;
            topPoints.push(`${px},${flagTopY + topWave}`);
            // Bottom edge: stronger wave
            const bottomWave = Math.sin(frame * flutterFreq + phase + t * 3 + 1) * flutterAmp;
            bottomPoints.push(`${px},${flagTopY + flagH + bottomWave}`);
          }

          const pathD = `M ${topPoints[0]} ${topPoints.slice(1).map((p) => `L ${p}`).join(" ")} ${bottomPoints.reverse().map((p) => `L ${p}`).join(" ")} Z`;

          // Symbol contrast color
          const symbolColor = flag.color === "#FAFAFA" ? "#333" : "#FFF";

          return (
            <g key={`flag-${fi}`}>
              {/* Flag body */}
              <path
                d={pathD}
                fill={flag.color}
                fillOpacity={0.7}
                stroke={flag.color}
                strokeWidth={0.5}
                strokeOpacity={0.3}
              />
              {/* Faint symbol pattern */}
              <g transform={`translate(${flagX}, ${flagTopY})`}>
                {renderSymbol(flag.symbolIdx, flagW, flagH, symbolColor)}
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
