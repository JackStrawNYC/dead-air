/**
 * EmberRise — Hot embers floating upward from bottom of screen.
 * 40-60 small circle particles rising from bottom. Size 2-6px, warm colors
 * (orange, red, yellow, white-hot). Rise speed varies per particle. Gentle
 * horizontal drift via sine. Particles fade out near top. More particles and
 * brighter when energy is high. Evokes "Fire on the Mountain". Always visible
 * at 10-30% opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

interface EmberData {
  /** X position as fraction of width */
  x: number;
  /** Rise speed (px per frame) */
  riseSpeed: number;
  /** Horizontal drift frequency */
  driftFreq: number;
  /** Horizontal drift amplitude (px) */
  driftAmp: number;
  /** Drift phase */
  driftPhase: number;
  /** Base size (radius in px) */
  size: number;
  /** Hue: warm range (0-60 for red/orange/yellow) */
  hue: number;
  /** Lightness: 50-90% (hotter = lighter) */
  lightness: number;
  /** Cycle offset so embers aren't all in sync */
  cycleOffset: number;
  /** Flicker frequency */
  flickerFreq: number;
  /** Flicker phase */
  flickerPhase: number;
}

const NUM_EMBERS = 50;
// Each ember cycles through a full rise, then resets
const RISE_CYCLE = 240; // 8 seconds to float from bottom to top

function generateEmbers(seed: number): EmberData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_EMBERS }, () => ({
    x: rng(),
    riseSpeed: 1.5 + rng() * 3.5,
    driftFreq: 0.01 + rng() * 0.03,
    driftAmp: 15 + rng() * 50,
    driftPhase: rng() * Math.PI * 2,
    size: 1 + rng() * 2.5,
    hue: rng() * 55, // 0-55: red through yellow
    lightness: 50 + rng() * 40,
    cycleOffset: Math.floor(rng() * RISE_CYCLE),
    flickerFreq: 0.08 + rng() * 0.2,
    flickerPhase: rng() * Math.PI * 2,
  }));
}

// Stagger: fade in over 4 seconds
const STAGGER_START = 120;

interface Props {
  frames: EnhancedFrameData[];
}

export const EmberRise: React.FC<Props> = ({ frames }) => {
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

  const embers = React.useMemo(() => generateEmbers(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Overall opacity: 10-30% based on energy
  const baseOpacity = interpolate(energy, [0.03, 0.3], [0.10, 0.30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = baseOpacity * masterFade;

  if (masterOpacity < 0.01) return null;

  // Energy drives brightness boost and speed
  const brightnessMult = interpolate(energy, [0.03, 0.3], [0.6, 1.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const speedMult = interpolate(energy, [0.03, 0.3], [0.7, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // How many embers visible (more with energy)
  const visibleCount = Math.round(interpolate(energy, [0.03, 0.3], [25, NUM_EMBERS], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {embers.slice(0, visibleCount).map((ember, i) => {
          // Cycle position: each ember loops independently
          const cycleFrame = (frame * speedMult + ember.cycleOffset) % RISE_CYCLE;
          const riseProgress = cycleFrame / RISE_CYCLE; // 0 = bottom, 1 = top

          // Y position: bottom to top
          const py = height * (1.05 - riseProgress * 1.15);

          // X position: base + sine drift
          const px = ember.x * width
            + Math.sin(frame * ember.driftFreq + ember.driftPhase) * ember.driftAmp;

          // Wrap X
          const wx = ((px % width) + width) % width;

          // Fade: bright at bottom, fading near top
          const verticalFade = interpolate(riseProgress, [0, 0.15, 0.7, 1], [0.2, 1, 0.6, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          // Flicker
          const flicker = 0.6 + Math.sin(frame * ember.flickerFreq + ember.flickerPhase) * 0.3
            + Math.sin(frame * ember.flickerFreq * 2.7 + ember.flickerPhase * 0.8) * 0.1;

          const alpha = verticalFade * flicker * brightnessMult;

          if (alpha < 0.03) return null;

          // Size slightly decreases as ember rises (cools)
          const r = ember.size * (1 - riseProgress * 0.3);

          // Color: hotter (whiter) when brighter, cooler (redder) when dimmer
          const hue = ember.hue;
          const lightness = ember.lightness * brightnessMult;
          const coreColor = `hsla(${hue}, 100%, ${Math.min(95, lightness + 15)}%, ${alpha})`;
          const glowColor = `hsla(${hue}, 100%, ${lightness}%, ${alpha * 0.5})`;
          const outerGlow = `hsla(${hue + 10}, 80%, ${lightness - 10}%, ${alpha * 0.2})`;

          return (
            <g key={i}>
              {/* Outer glow */}
              <circle
                cx={wx}
                cy={py}
                r={r * 4}
                fill={outerGlow}
                style={{ filter: `blur(${3}px)` }}
              />
              {/* Mid glow */}
              <circle
                cx={wx}
                cy={py}
                r={r * 2}
                fill={glowColor}
                style={{ filter: `blur(${1.5}px)` }}
              />
              {/* Core */}
              <circle
                cx={wx}
                cy={py}
                r={r}
                fill={coreColor}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
