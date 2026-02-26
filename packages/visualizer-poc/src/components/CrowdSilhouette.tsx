/**
 * CrowdSilhouette — Concert crowd silhouette along bottom of frame.
 * 20-25 head/shoulder silhouettes as SVG circles+trapezoids. Some have raised
 * hands (rectangles). Hands wave/bob with energy. Silhouettes are dark against
 * the visual. Subtle neon outline glow. Always visible at 10-20% opacity.
 * Energy drives hand-raise count and bob intensity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PersonData {
  /** x position as fraction of width */
  x: number;
  /** Height variation multiplier */
  heightMult: number;
  /** Head radius */
  headRadius: number;
  /** Shoulder width */
  shoulderWidth: number;
  /** Has hand up (probability-based, energy controls which are active) */
  handThreshold: number;
  /** Hand wave frequency */
  waveFreq: number;
  /** Hand wave phase */
  wavePhase: number;
  /** Bob frequency */
  bobFreq: number;
  /** Bob phase */
  bobPhase: number;
  /** Which side hand is on (-1 left, 1 right) */
  handSide: number;
  /** Neon glow hue */
  glowHue: number;
}

const NUM_PEOPLE = 23;

function generateCrowd(seed: number): PersonData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_PEOPLE }, () => ({
    x: 0.01 + rng() * 0.98,
    heightMult: 0.7 + rng() * 0.5,
    headRadius: 8 + rng() * 6,
    shoulderWidth: 22 + rng() * 16,
    handThreshold: rng(),
    waveFreq: 0.025 + rng() * 0.045,
    wavePhase: rng() * Math.PI * 2,
    bobFreq: 0.02 + rng() * 0.04,
    bobPhase: rng() * Math.PI * 2,
    handSide: rng() > 0.5 ? 1 : -1,
    glowHue: rng() * 360,
  }));
}

// Stagger: fade in over first 3 seconds
const FADE_IN_START = 0;
const FADE_IN_DURATION = 90;

interface Props {
  frames: EnhancedFrameData[];
}

export const CrowdSilhouette: React.FC<Props> = ({ frames }) => {
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

  const crowd = React.useMemo(() => generateCrowd(19770508), []);

  // Master fade in
  const masterFade = interpolate(frame, [FADE_IN_START, FADE_IN_START + FADE_IN_DURATION], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Opacity: always visible 10-20%, energy slightly increases it
  const baseOpacity = interpolate(energy, [0.03, 0.3], [0.10, 0.20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = baseOpacity * masterFade;

  if (masterOpacity < 0.01) return null;

  // Energy drives how many hands are raised (higher energy = more hands)
  const handRaiseThreshold = interpolate(energy, [0.05, 0.35], [0.9, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bob intensity tied to energy
  const bobIntensity = interpolate(energy, [0.03, 0.3], [1, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow intensity tied to energy
  const glowIntensity = interpolate(energy, [0.05, 0.3], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Base Y line (bottom of screen, slightly above letterbox)
  const baseY = height - 20;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {crowd.map((person, i) => {
          const px = person.x * width;

          // Bob motion
          const bob = Math.sin(frame * person.bobFreq + person.bobPhase) * bobIntensity;

          const headY = baseY - 40 * person.heightMult + bob;
          const shoulderY = headY + person.headRadius + 4;
          const bodyBottom = baseY + 20; // extends below screen

          // Hand raised?
          const handUp = person.handThreshold > handRaiseThreshold;

          // Hand wave angle
          const waveAngle = handUp
            ? Math.sin(frame * person.waveFreq + person.wavePhase) * 15
            : 0;

          const glowColor = `hsla(${person.glowHue}, 100%, 70%, 0.4)`;

          return (
            <g key={i}>
              {/* Shoulder/body trapezoid */}
              <path
                d={`M ${px - person.shoulderWidth / 2} ${shoulderY}
                    L ${px + person.shoulderWidth / 2} ${shoulderY}
                    L ${px + person.shoulderWidth * 0.7} ${bodyBottom}
                    L ${px - person.shoulderWidth * 0.7} ${bodyBottom} Z`}
                fill="rgba(5, 5, 10, 0.85)"
                stroke={glowColor}
                strokeWidth={0.5}
                style={{ filter: `drop-shadow(0 0 ${glowIntensity}px ${glowColor})` }}
              />
              {/* Head */}
              <circle
                cx={px}
                cy={headY}
                r={person.headRadius}
                fill="rgba(5, 5, 10, 0.9)"
                stroke={glowColor}
                strokeWidth={0.5}
                style={{ filter: `drop-shadow(0 0 ${glowIntensity}px ${glowColor})` }}
              />
              {/* Raised hand */}
              {handUp && (
                <g transform={`translate(${px + person.handSide * person.shoulderWidth * 0.4}, ${shoulderY - 5}) rotate(${-30 * person.handSide + waveAngle}, 0, 0)`}>
                  {/* Arm */}
                  <rect
                    x={-2.5}
                    y={-35 * person.heightMult}
                    width={5}
                    height={35 * person.heightMult}
                    rx={2.5}
                    fill="rgba(5, 5, 10, 0.85)"
                    stroke={glowColor}
                    strokeWidth={0.4}
                  />
                  {/* Hand (small circle) */}
                  <circle
                    cx={0}
                    cy={-37 * person.heightMult}
                    r={4}
                    fill="rgba(5, 5, 10, 0.85)"
                    stroke={glowColor}
                    strokeWidth={0.4}
                  />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
