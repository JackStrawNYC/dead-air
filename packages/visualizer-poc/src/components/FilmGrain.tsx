/**
 * FilmGrain — procedural noise overlay for analog texture.
 * Uses deterministic seeded random for Remotion compatibility.
 * Renders as a canvas-generated noise pattern.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

interface Props {
  opacity?: number;
  /** Audio energy (0–1) for energy-aware breathing speed */
  energy?: number;
}

export const FilmGrain: React.FC<Props> = ({ opacity = 0.10, energy = 0 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // feTurbulence seed changes every frame for grain variation
  const grainSeed = frame * 31337;

  // Energy-aware breathing: peaks pulse fast (1.5s/45fr), quiet drifts slow (3.5s/105fr)
  const energyFactor = Math.max(0, Math.min(1, (energy - 0.03) / 0.27));
  const breathePeriod = 45 + (1 - energyFactor) * 60; // 45 (peak) → 105 (quiet)
  const breathe = 0.90 + 0.10 * Math.sin(frame * Math.PI / breathePeriod);
  const finalOpacity = opacity * breathe;

  // Gate weave — sub-pixel sine offset simulating projector gate instability
  const weaveX = Math.sin(frame * 0.037) * 0.8;
  const weaveY = Math.cos(frame * 0.029) * 0.6;

  return (
    <svg
      width={width}
      height={height}
      style={{
        position: "absolute",
        inset: 0,
        opacity: finalOpacity,
        pointerEvents: "none",
        zIndex: 90,
        mixBlendMode: "overlay",
        transform: `translate(${weaveX.toFixed(2)}px, ${weaveY.toFixed(2)}px)`,
        willChange: "transform",
      }}
    >
      <filter id={`grain-${frame}`}>
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.75"
          numOctaves="4"
          seed={grainSeed}
          stitchTiles="stitch"
        />
      </filter>
      <rect
        width="100%"
        height="100%"
        filter={`url(#grain-${frame})`}
        opacity="0.5"
      />
    </svg>
  );
};
