/**
 * NorthernLights — Curtains of aurora light with energy-driven undulation.
 * Unlike AuroraBorealis (horizontal bands with wavy tops), NorthernLights renders
 * VERTICAL curtain-like ribbons that hang from the top and sway side-to-side.
 * Each curtain is a series of vertical strips with varying brightness, creating
 * the classic "folded fabric" look of real auroras. Colors shift through
 * green/cyan/purple/magenta. Energy drives the fold frequency and sway amplitude.
 * Cycles: 40s on, 35s off (75s total). Staggered start at frame 450.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface CurtainStrip {
  xNorm: number;
  baseHeight: number;
  swayPhase: number;
  swayFreq: number;
  foldPhase: number;
  foldFreq: number;
  hueOffset: number;
  widthMult: number;
}

const NUM_STRIPS = 60;

function generateStrips(seed: number): CurtainStrip[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_STRIPS }, (_, i) => ({
    xNorm: i / NUM_STRIPS + (rng() - 0.5) * 0.01,
    baseHeight: 0.2 + rng() * 0.3,
    swayPhase: rng() * Math.PI * 2,
    swayFreq: 0.01 + rng() * 0.02,
    foldPhase: rng() * Math.PI * 2,
    foldFreq: 0.03 + rng() * 0.05,
    hueOffset: rng() * 80 - 40,
    widthMult: 0.7 + rng() * 0.6,
  }));
}

const CYCLE = 2250; // 75s at 30fps
const DURATION = 1200; // 40s
const STAGGER_START = 450;

interface Props {
  frames: EnhancedFrameData[];
}

export const NorthernLights: React.FC<Props> = ({ frames }) => {
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

  const strips = React.useMemo(() => generateStrips(16180339), []);

  // Stagger gate
  if (frame < STAGGER_START) return null;

  // Timing gate
  const adjustedFrame = frame - STAGGER_START;
  const cycleFrame = adjustedFrame % CYCLE;
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
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.25 + energy * 0.35);

  if (masterOpacity < 0.01) return null;

  // Base hue cycles slowly: green(120) -> cyan(180) -> purple(280) -> magenta(320) -> green
  const baseHue = 120 + Math.sin(frame * 0.002) * 80 + Math.cos(frame * 0.0013) * 40;

  // Energy drives fold and sway amplitude
  const swayAmp = interpolate(energy, [0.03, 0.3], [15, 60], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const foldIntensity = interpolate(energy, [0.03, 0.3], [0.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const stripWidth = (width / NUM_STRIPS) * 1.3;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: "blur(4px)",
          mixBlendMode: "screen",
        }}
      >
        <defs>
          {strips.map((strip, i) => {
            const hue = (baseHue + strip.hueOffset + 360) % 360;
            return (
              <linearGradient
                key={`nlg-${i}`}
                id={`nl-grad-${i}`}
                x1="0" y1="0" x2="0" y2="1"
              >
                <stop offset="0%" stopColor={`hsla(${hue}, 75%, 60%, 0.7)`} />
                <stop offset="30%" stopColor={`hsla(${(hue + 20) % 360}, 70%, 55%, 0.5)`} />
                <stop offset="70%" stopColor={`hsla(${(hue + 40) % 360}, 65%, 45%, 0.2)`} />
                <stop offset="100%" stopColor={`hsla(${hue}, 60%, 40%, 0)`} />
              </linearGradient>
            );
          })}
        </defs>

        {strips.map((strip, i) => {
          // Sway: lateral movement
          const sway = Math.sin(frame * strip.swayFreq + strip.swayPhase) * swayAmp;
          // Fold: brightness modulation (simulates curtain folds)
          const fold = (Math.sin(frame * strip.foldFreq + strip.foldPhase) + 1) * 0.5;
          const foldAlpha = 0.3 + fold * foldIntensity * 0.7;

          const x = strip.xNorm * width + sway;
          const curtainHeight = strip.baseHeight * height * (0.8 + energy * 0.6);
          const w = stripWidth * strip.widthMult;

          // Bottom edge undulates
          const bottomWave = Math.sin(frame * 0.015 + i * 0.5) * 15 * energy;

          return (
            <rect
              key={`ns${i}`}
              x={x - w / 2}
              y={0}
              width={w}
              height={curtainHeight + bottomWave}
              fill={`url(#nl-grad-${i})`}
              opacity={foldAlpha}
              rx={2}
            />
          );
        })}
      </svg>
    </div>
  );
};
