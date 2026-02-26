/**
 * FilmGrain — procedural noise overlay for analog texture.
 * Uses deterministic seeded random for Remotion compatibility.
 * Renders as a canvas-generated noise pattern.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

interface Props {
  opacity?: number;
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

export const FilmGrain: React.FC<Props> = ({ opacity = 0.06 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Generate grain pattern as SVG noise (lighter than canvas)
  // Use frame-based seed for per-frame variation
  const grainSeed = frame * 31337;

  // Breathing opacity
  const breathe = 0.85 + 0.3 * Math.sin(frame * Math.PI / 2) * 0.5;
  const finalOpacity = opacity * breathe;

  // Generate sparse noise dots using SVG
  const dots = useMemo(() => {
    const rng = mulberry32(grainSeed);
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
  }, [grainSeed, width, height]);

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
