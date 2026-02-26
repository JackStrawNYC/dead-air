/**
 * AuroraBorealis — Shimmering northern lights across the top third of the screen.
 * Multiple overlapping SVG paths with wavy tops, filled with gradient colors
 * (green, purple, pink). The wave undulates via sine functions at different
 * frequencies. Opacity breathes with energy. Color shifts with chroma hue data
 * (smoothed over 20 frames).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface AuroraBand {
  /** Y offset from top as fraction (0 = very top) */
  yOffset: number;
  /** Wave frequency multiplier */
  waveFreq: number;
  /** Wave amplitude (px) */
  waveAmp: number;
  /** Secondary wave frequency (for complex waveform) */
  waveFreq2: number;
  /** Secondary wave amplitude */
  waveAmp2: number;
  /** Phase offset */
  phase: number;
  /** Band height (px) */
  bandHeight: number;
  /** Base hue offset from chroma-derived hue */
  hueOffset: number;
  /** Opacity multiplier */
  alphaScale: number;
}

const NUM_BANDS = 5;
const WAVE_SEGMENTS = 40; // number of line segments per band

function generateBands(seed: number): AuroraBand[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_BANDS }, (_, i) => ({
    yOffset: 0.02 + (i / NUM_BANDS) * 0.22 + rng() * 0.04,
    waveFreq: 0.008 + rng() * 0.012,
    waveAmp: 15 + rng() * 35,
    waveFreq2: 0.015 + rng() * 0.025,
    waveAmp2: 8 + rng() * 18,
    phase: rng() * Math.PI * 2,
    bandHeight: 60 + rng() * 80,
    hueOffset: i * 55, // spread bands across hue range
    alphaScale: 0.5 + rng() * 0.5,
  }));
}

// Stagger: appears at frame 300 (10s in)
const STAGGER_START = 300;

interface Props {
  frames: EnhancedFrameData[];
}

export const AuroraBorealis: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Smooth chroma hue over +/-20 frames
  let chromaSum = 0;
  let chromaCount = 0;
  for (let i = Math.max(0, idx - 20); i <= Math.min(frames.length - 1, idx + 20); i++) {
    const ch = frames[i].chroma;
    let maxIdx = 0;
    for (let j = 1; j < 12; j++) {
      if (ch[j] > ch[maxIdx]) maxIdx = j;
    }
    chromaSum += maxIdx / 12;
    chromaCount++;
  }
  const chromaHue = chromaCount > 0 ? (chromaSum / chromaCount) * 360 : 120;

  const bands = React.useMemo(() => generateBands(19720401), []);

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Breathing opacity driven by energy
  const breathe = interpolate(energy, [0.03, 0.25], [0.12, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = breathe * masterFade;
  if (masterOpacity < 0.01) return null;

  // Shimmer: subtle rapid oscillation on top of energy
  const shimmer = 1 + Math.sin(frame * 0.3) * 0.05 + Math.sin(frame * 0.17) * 0.03;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity * shimmer,
          filter: `blur(6px) drop-shadow(0 0 20px hsla(${chromaHue}, 80%, 60%, 0.3))`,
          mixBlendMode: "screen",
        }}
      >
        <defs>
          {bands.map((band, bi) => {
            const hue1 = (chromaHue + band.hueOffset) % 360;
            const hue2 = (chromaHue + band.hueOffset + 40) % 360;
            return (
              <linearGradient key={`ag-${bi}`} id={`aurora-grad-${bi}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={`hsla(${hue1}, 80%, 65%, 0.8)`} />
                <stop offset="40%" stopColor={`hsla(${hue2}, 70%, 55%, 0.5)`} />
                <stop offset="100%" stopColor={`hsla(${hue1}, 60%, 40%, 0)`} />
              </linearGradient>
            );
          })}
        </defs>

        {bands.map((band, bi) => {
          // Stagger each band
          const bandFade = interpolate(
            frame,
            [STAGGER_START + bi * 25, STAGGER_START + bi * 25 + 90],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          );
          if (bandFade < 0.01) return null;

          // Build the wavy top path + flat bottom to create a filled band
          const topY = band.yOffset * height;
          const segW = width / WAVE_SEGMENTS;

          // Speed of wave animation scales with energy
          const waveSpeed = interpolate(energy, [0.03, 0.3], [0.6, 1.5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const t = frame * waveSpeed;

          // Build top edge points
          const topPoints: Array<{ x: number; y: number }> = [];
          for (let s = 0; s <= WAVE_SEGMENTS; s++) {
            const x = s * segW;
            const xNorm = s / WAVE_SEGMENTS;
            const wave1 = Math.sin(x * band.waveFreq + t * 0.05 + band.phase) * band.waveAmp;
            const wave2 = Math.sin(x * band.waveFreq2 + t * 0.03 + band.phase * 1.7) * band.waveAmp2;
            // Energy-driven amplitude boost
            const energyWave = Math.sin(x * 0.003 + t * 0.02) * energy * 25;
            // Taper at edges for natural look
            const edgeTaper = Math.sin(xNorm * Math.PI);
            const y = topY + (wave1 + wave2 + energyWave) * edgeTaper;
            topPoints.push({ x, y });
          }

          // Build SVG path: top wave, then down right side, across bottom, up left side
          const bottomY = topY + band.bandHeight;
          let d = `M ${topPoints[0].x} ${topPoints[0].y}`;
          for (let s = 1; s < topPoints.length; s++) {
            // Smooth curve between points
            const prev = topPoints[s - 1];
            const curr = topPoints[s];
            const cpx = (prev.x + curr.x) / 2;
            d += ` Q ${prev.x + segW * 0.5} ${prev.y}, ${curr.x} ${curr.y}`;
          }
          // Close: straight down right side, across bottom, up left
          d += ` L ${width} ${bottomY} L 0 ${bottomY} Z`;

          return (
            <path
              key={bi}
              d={d}
              fill={`url(#aurora-grad-${bi})`}
              opacity={bandFade * band.alphaScale}
            />
          );
        })}
      </svg>
    </div>
  );
};
