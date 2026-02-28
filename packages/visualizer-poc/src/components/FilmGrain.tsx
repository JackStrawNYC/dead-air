/**
 * FilmGrain — procedural noise overlay for analog texture.
 * Uses deterministic seeded random for Remotion compatibility.
 * Renders as a canvas-generated noise pattern.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

interface Props {
  opacity?: number;
  /** Audio energy (0–1) for energy-aware breathing speed */
  energy?: number;
}

/** Mulberry32 PRNG */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FilmGrain: React.FC<Props> = ({ opacity = 0.20, energy = 0 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // feTurbulence seed changes every frame for grain variation
  const grainSeed = frame * 31337;

  // Energy-aware breathing: peaks pulse fast (1.5s/45fr), quiet drifts slow (3.5s/105fr)
  const energyFactor = Math.max(0, Math.min(1, (energy - 0.03) / 0.27));
  const breathePeriod = 45 + (1 - energyFactor) * 60; // 45 (peak) → 105 (quiet)
  const breathe = 0.85 + 0.30 * Math.sin(frame * Math.PI / breathePeriod);
  const finalOpacity = opacity * breathe;

  // Gate weave — sub-pixel sine offset simulating projector gate instability
  const weaveX = Math.sin(frame * 0.037) * 0.8;
  const weaveY = Math.cos(frame * 0.029) * 0.6;

  // Static noise dots — only depend on viewport size, not frame
  const dots = useMemo(() => {
    const rng = mulberry32(width * 7919 + height * 104729);
    const count = 400;
    const result: Array<{ x: number; y: number; r: number; o: number }> = [];
    for (let i = 0; i < count; i++) {
      result.push({
        x: rng() * width,
        y: rng() * height,
        r: 0.5 + rng() * 1.5,
        o: rng() * 0.5,
      });
    }
    return result;
  }, [width, height]);

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
          baseFrequency="0.65"
          numOctaves="3"
          seed={grainSeed}
          stitchTiles="stitch"
        />
      </filter>
      <rect
        width="100%"
        height="100%"
        filter={`url(#grain-${frame})`}
        opacity="0.4"
      />
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.r}
          fill={`rgba(255,255,255,${d.o})`}
        />
      ))}
    </svg>
  );
};
