/**
 * LissajousCurves — Audio-reactive Lissajous figure-8 / infinity patterns.
 * SVG path computed by x=sin(a*t), y=sin(b*t+phase) where a and b are derived
 * from bass and mids frequency values, phase shifts with centroid.
 * Trail of 200+ points creating the curve. Neon color cycling. Slow rotation.
 * Energy drives trail length and brightness.
 * Appears periodically (every 55s, visible 16s).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1650;    // 55 seconds at 30fps
const DURATION = 480;  // 16 seconds visible
const BASE_TRAIL = 220;
const MAX_TRAIL = 400;

interface Props {
  frames: EnhancedFrameData[];
}

export const LissajousCurves: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy window: idx-75 to idx+75
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Periodic visibility
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade in/out
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
  const baseOpacity = Math.min(fadeIn, fadeOut);

  // Opacity driven by energy
  const opacity = baseOpacity * interpolate(energy, [0.03, 0.25], [0.2, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  const fd = frames[idx];

  // Lissajous parameters derived from audio
  // a and b ratios determine the pattern shape (2:3, 3:4, etc.)
  // Quantize to near-integer ratios for stable patterns, but allow drift
  const rawA = 1 + fd.sub * 3; // 1 to 4 range
  const rawB = 1 + fd.mid * 4; // 1 to 5 range
  // Smooth toward integer ratios for cleaner figures
  const a = Math.round(rawA * 2) / 2; // snaps to 0.5 increments
  const b = Math.round(rawB * 2) / 2;
  // Phase from centroid (0 to PI/2 range for interesting patterns)
  const phase = fd.centroid * Math.PI * 0.5;

  // Trail length driven by energy
  const trailLen = Math.floor(
    interpolate(energy, [0.03, 0.3], [BASE_TRAIL, MAX_TRAIL], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  // Center of the canvas
  const cx = width / 2;
  const cy = height / 2;

  // Size of the Lissajous pattern
  const scaleX = width * 0.3 * (0.8 + energy * 0.4);
  const scaleY = height * 0.25 * (0.8 + energy * 0.4);

  // Slow rotation
  const rotation = frame * 0.2;

  // Time offset that advances the parametric curve
  const timeOffset = frame * 0.03;

  // Color cycling
  const hue1 = (frame * 0.6) % 360;
  const hue2 = (hue1 + 90) % 360;

  // Glow
  const glowSize = interpolate(energy, [0.03, 0.3], [4, 16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowColor = `hsla(${hue1}, 100%, 70%, 0.6)`;

  // Generate trail points
  const points: Array<{ x: number; y: number; alpha: number }> = [];
  for (let p = 0; p < trailLen; p++) {
    const t = timeOffset + (p / trailLen) * Math.PI * 2 * 3; // 3 full loops
    const lx = Math.sin(a * t);
    const ly = Math.sin(b * t + phase);
    const x = lx * scaleX;
    const y = ly * scaleY;

    // Trail fades: newer points (higher p) are brighter
    const trailAlpha = interpolate(p, [0, trailLen * 0.3, trailLen], [0.05, 0.3, 1.0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    points.push({ x, y, alpha: trailAlpha });
  }

  // Build main SVG path
  const pathParts: string[] = [];
  for (let p = 0; p < points.length; p++) {
    const pt = points[p];
    if (p === 0) {
      pathParts.push(`M ${pt.x} ${pt.y}`);
    } else {
      pathParts.push(`L ${pt.x} ${pt.y}`);
    }
  }
  const pathD = pathParts.join(" ");

  // Secondary curve: slightly different parameters for visual depth
  const a2 = a + 0.5;
  const b2 = b + 0.5;
  const phase2 = phase + Math.PI * 0.25;
  const secondaryParts: string[] = [];
  for (let p = 0; p < Math.floor(trailLen * 0.7); p++) {
    const t = timeOffset * 0.8 + (p / (trailLen * 0.7)) * Math.PI * 2 * 2.5;
    const lx = Math.sin(a2 * t) * scaleX * 0.7;
    const ly = Math.sin(b2 * t + phase2) * scaleY * 0.7;
    if (p === 0) {
      secondaryParts.push(`M ${lx} ${ly}`);
    } else {
      secondaryParts.push(`L ${lx} ${ly}`);
    }
  }
  const secondaryD = secondaryParts.join(" ");

  // Nodal points: bright dots at the Lissajous extremes
  const nodalPoints: Array<{ x: number; y: number }> = [];
  for (let n = 0; n < 8; n++) {
    const t = timeOffset + (n / 8) * Math.PI * 2;
    const lx = Math.sin(a * t) * scaleX;
    const ly = Math.sin(b * t + phase) * scaleY;
    nodalPoints.push({ x: lx, y: ly });
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${glowColor}) drop-shadow(0 0 ${glowSize * 2}px ${glowColor})`,
        }}
      >
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
          {/* Secondary curve (dimmer, offset) */}
          <path
            d={secondaryD}
            fill="none"
            stroke={`hsl(${hue2}, 90%, 60%)`}
            strokeWidth={1.2}
            opacity={0.25}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Main curve glow layer */}
          <path
            d={pathD}
            fill="none"
            stroke={`hsl(${hue1}, 100%, 70%)`}
            strokeWidth={4}
            opacity={0.15}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Main curve */}
          <path
            d={pathD}
            fill="none"
            stroke={`hsl(${hue1}, 100%, 65%)`}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Bright center line */}
          <path
            d={pathD}
            fill="none"
            stroke="white"
            strokeWidth={0.8}
            opacity={0.35}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Nodal dots */}
          {nodalPoints.map((np, ni) => (
            <circle
              key={`node-${ni}`}
              cx={np.x}
              cy={np.y}
              r={2 + energy * 3}
              fill={`hsl(${(hue1 + ni * 45) % 360}, 100%, 75%)`}
              opacity={0.6}
            />
          ))}

          {/* Head dot: brightest point at end of trail */}
          {points.length > 0 && (
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r={4 + energy * 5}
              fill={`hsl(${hue1}, 100%, 80%)`}
              opacity={0.9}
            />
          )}
        </g>
      </svg>
    </div>
  );
};
