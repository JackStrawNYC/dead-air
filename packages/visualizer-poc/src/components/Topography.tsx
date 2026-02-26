/**
 * Topography — Contour lines that ripple outward from center.
 * Concentric irregular contour rings expand from a central point.
 * Line density and ripple speed vary with energy. Contour elevation
 * labels at cardinal points. Neon green/gold palette.
 * Positioned center. Appears every 45s for 12s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1350; // 45 seconds at 30fps
const DURATION = 360; // 12 seconds visible
const NUM_RINGS = 8;

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Topography: React.FC<Props> = ({ frames }) => {
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

  // Pre-compute contour shapes deterministically
  const contourPaths = React.useMemo(() => {
    const paths: string[][] = [];
    for (let ring = 0; ring < NUM_RINGS; ring++) {
      const rng = mulberry32(ring * 7919 + 31337);
      const segments = 60;
      const variants: string[] = [];
      // Generate 3 path variants per ring for animation cycling
      for (let v = 0; v < 3; v++) {
        const points: Array<{ x: number; y: number }> = [];
        for (let s = 0; s <= segments; s++) {
          const angle = (s / segments) * Math.PI * 2;
          const baseR = (ring + 1) / NUM_RINGS;
          // Irregular radius with seeded noise
          const noise = (rng() - 0.5) * 0.08 + (rng() - 0.5) * 0.04 * Math.sin(angle * 3 + v);
          const r = baseR + noise;
          points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
        }
        // Build SVG path
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let p = 1; p < points.length; p++) {
          d += ` L ${points[p].x} ${points[p].y}`;
        }
        d += " Z";
        variants.push(d);
      }
      paths.push(variants);
    }
    return paths;
  }, []);

  // Timing gate
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
  const baseOpacity = interpolate(energy, [0.02, 0.25], [0.15, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxRadius = Math.min(width, height) * 0.35;

  // Ripple expansion driven by energy
  const rippleSpeed = 0.3 + energy * 1.5;
  const ripplePhase = (frame * rippleSpeed * 0.01) % 1;

  const green = "#44FF88";
  const gold = "#DDAA22";
  const pale = "#AAFFCC";

  const glowSize = interpolate(energy, [0.02, 0.3], [1, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${green})`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {contourPaths.map((variants, ring) => {
            // Expand rings outward with ripple phase
            const baseScale = ((ring + 1 + ripplePhase) / (NUM_RINGS + 1)) * maxRadius;
            const scale = baseScale * (1 + energy * 0.15);

            // Pick variant based on slow frame cycling
            const variantIdx = Math.floor(frame * 0.02 + ring * 0.3) % 3;
            const d = variants[variantIdx];

            // Fade inner rings less, outer rings more
            const ringOpacity = interpolate(ring, [0, NUM_RINGS - 1], [0.7, 0.25], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            // Alternating colors
            const color = ring % 3 === 0 ? gold : green;
            const strokeW = ring % 2 === 0 ? 1.2 : 0.7;

            return (
              <g key={`ring-${ring}`} transform={`scale(${scale})`}>
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeW / scale} // Normalize stroke to screen space
                  opacity={ringOpacity}
                />
              </g>
            );
          })}

          {/* Elevation labels at cardinal points */}
          {[0, 90, 180, 270].map((deg, di) => {
            const rad = ((deg - 90) * Math.PI) / 180;
            const labelR = maxRadius * 0.6;
            const elevation = Math.round(100 + energy * 900 * (1 + di * 0.2));
            return (
              <text
                key={`elev-${di}`}
                x={Math.cos(rad) * labelR}
                y={Math.sin(rad) * labelR}
                textAnchor="middle"
                dominantBaseline="central"
                fill={pale}
                fontSize={10}
                fontFamily="monospace"
                opacity={0.4}
              >
                {elevation}m
              </text>
            );
          })}

          {/* Center peak marker */}
          <line x1={-6} y1={0} x2={6} y2={0} stroke={gold} strokeWidth={1.5} opacity={0.6} />
          <line x1={0} y1={-6} x2={0} y2={6} stroke={gold} strokeWidth={1.5} opacity={0.6} />
          <circle cx={0} cy={0} r={3} fill={gold} opacity={0.5} />
        </g>
      </svg>
    </div>
  );
};
