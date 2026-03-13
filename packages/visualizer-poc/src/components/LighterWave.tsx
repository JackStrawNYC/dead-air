/**
 * LighterWave — Crowd lighters during ballads.
 * 30-50 small flame shapes (teardrop path + inner glow) scattered across
 * bottom 40% of screen. Each flame flickers independently (sine-based
 * brightness). Gentle horizontal sway simulating hand movement. Warm
 * yellow/orange with white-hot tips. INVERSELY gated on energy — MORE
 * visible during quiet passages (rms < 0.15), fading out during loud parts.
 * Creates "sea of lighters" effect for Morning Dew quiet section, Row Jimmy.
 * Layer 1, low energy, 10-25% base opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

interface FlameData {
  /** X position as fraction of width */
  x: number;
  /** Y position as fraction of height (within bottom 40%) */
  y: number;
  /** Base size scale (0.6-1.4) */
  scale: number;
  /** Flicker frequency */
  flickerFreq: number;
  /** Flicker phase offset */
  flickerPhase: number;
  /** Sway frequency (hand movement) */
  swayFreq: number;
  /** Sway amplitude (px) */
  swayAmp: number;
  /** Sway phase */
  swayPhase: number;
  /** Hue: 30-55 (yellow to orange) */
  hue: number;
  /** Base brightness (0.5-1.0) */
  brightness: number;
  /** Vertical bob frequency (gentle arm movement) */
  bobFreq: number;
  /** Vertical bob amplitude (px) */
  bobAmp: number;
  /** Bob phase */
  bobPhase: number;
}

const NUM_FLAMES = 40;
const STAGGER_START = 90; // 3 seconds fade in

function generateFlames(seed: number): FlameData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_FLAMES }, () => ({
    x: 0.03 + rng() * 0.94,
    y: 0.60 + rng() * 0.38, // bottom 40% (0.60 to 0.98)
    scale: 0.6 + rng() * 0.8,
    flickerFreq: 0.06 + rng() * 0.18,
    flickerPhase: rng() * Math.PI * 2,
    swayFreq: 0.008 + rng() * 0.02,
    swayAmp: 3 + rng() * 10,
    swayPhase: rng() * Math.PI * 2,
    hue: 30 + rng() * 25,
    brightness: 0.5 + rng() * 0.5,
    bobFreq: 0.01 + rng() * 0.015,
    bobAmp: 2 + rng() * 6,
    bobPhase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const LighterWave: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const flames = React.useMemo(() => generateFlames(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // INVERSE energy gating: MORE visible when quiet, LESS when loud
  // Full opacity below rms 0.08, fading to zero above rms 0.20
  const energyGate = interpolate(energy, [0.08, 0.20], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Base opacity 10-25% (higher when quieter)
  const baseOpacity = interpolate(energy, [0.0, 0.15], [0.25, 0.10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = baseOpacity * masterFade * energyGate;

  if (masterOpacity < 0.01) return null;

  // How many flames visible (more during quiet passages)
  const visibleCount = Math.round(
    interpolate(energy, [0.0, 0.15], [NUM_FLAMES, 25], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity: masterOpacity, mixBlendMode: "screen" }}
      >
        {flames.slice(0, visibleCount).map((flame, i) => {
          // Flicker: sine-based brightness variation
          const flicker =
            0.5 +
            Math.sin(frame * flame.flickerFreq + flame.flickerPhase) * 0.3 +
            Math.sin(frame * flame.flickerFreq * 2.3 + flame.flickerPhase * 1.7) * 0.15 +
            Math.sin(frame * flame.flickerFreq * 0.4 + flame.flickerPhase * 0.5) * 0.05;

          // Horizontal sway (simulating hand movement)
          const swayX =
            Math.sin(frame * flame.swayFreq + flame.swayPhase) * flame.swayAmp;

          // Vertical bob (arm movement)
          const bobY =
            Math.sin(frame * flame.bobFreq + flame.bobPhase) * flame.bobAmp;

          const px = flame.x * width + swayX;
          const py = flame.y * height + bobY;

          const alpha = flicker * flame.brightness;
          if (alpha < 0.05) return null;

          const s = flame.scale * 8; // base flame size

          // Flame colors — warm yellow/orange with white-hot tips
          const tipColor = `hsla(50, 100%, 95%, ${alpha})`;
          const bodyColor = `hsla(${flame.hue}, 100%, 65%, ${alpha * 0.8})`;
          const outerGlow = `hsla(${flame.hue + 5}, 90%, 50%, ${alpha * 0.3})`;

          return (
            <g key={i} transform={`translate(${px}, ${py})`}>
              {/* Outer glow */}
              <ellipse
                cx={0}
                cy={0}
                rx={s * 2.5}
                ry={s * 3}
                fill={outerGlow}
                style={{ filter: "blur(4px)" }}
              />
              {/* Flame body — teardrop path */}
              <path
                d={`M 0 ${-s * 2}
                    C ${s * 0.8} ${-s * 0.8}, ${s * 0.6} ${s * 0.5}, 0 ${s * 0.8}
                    C ${-s * 0.6} ${s * 0.5}, ${-s * 0.8} ${-s * 0.8}, 0 ${-s * 2}
                    Z`}
                fill={bodyColor}
              />
              {/* Inner bright core (white-hot tip) */}
              <path
                d={`M 0 ${-s * 1.2}
                    C ${s * 0.3} ${-s * 0.3}, ${s * 0.2} ${s * 0.1}, 0 ${s * 0.3}
                    C ${-s * 0.2} ${s * 0.1}, ${-s * 0.3} ${-s * 0.3}, 0 ${-s * 1.2}
                    Z`}
                fill={tipColor}
                style={{ filter: "blur(0.5px)" }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
