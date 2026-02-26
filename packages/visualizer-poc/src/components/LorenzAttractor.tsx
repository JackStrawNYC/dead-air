/**
 * LorenzAttractor — The classic butterfly-shaped Lorenz strange attractor.
 * Compute 1000+ points of the Lorenz system (dx/dt = sigma(y-x), dy/dt = x(rho-z)-y,
 * dz/dt = xy - beta*z). Render as a continuous SVG path projected to 2D.
 * Slowly rotate the 3D view. Trail glows with neon colors.
 * Energy drives the rho parameter slightly for visual variation.
 * Appears every 65s for 14s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1950; // 65 seconds at 30fps
const DURATION = 420; // 14 seconds visible
const NUM_POINTS = 1500;

interface Props {
  frames: EnhancedFrameData[];
}

export const LorenzAttractor: React.FC<Props> = ({ frames }) => {
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

  // Compute the Lorenz attractor points (must be before return null)
  const lorenzData = React.useMemo(() => {
    // Lorenz parameters
    const sigma = 10;
    const beta = 8 / 3;
    // rho varies slightly with energy for visual variation
    const rho = 28 + (energy - 0.1) * 5;

    const dt = 0.005;
    let x = 1.0;
    let y = 1.0;
    let z = 1.0;

    const points: Array<[number, number, number]> = [];
    for (let i = 0; i < NUM_POINTS; i++) {
      const dx = sigma * (y - x);
      const dy = x * (rho - z) - y;
      const dz = x * y - beta * z;
      x += dx * dt;
      y += dy * dt;
      z += dz * dt;
      points.push([x, y, z]);
    }

    return points;
  }, [energy]);

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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const viewScale = Math.min(width, height) * 0.012;

  // Slow 3D rotation
  const rotY = frame * 0.008;
  const rotX = frame * 0.003;
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);

  // Project 3D to 2D with rotation
  const project = (p: [number, number, number]): { x: number; y: number } => {
    // Rotate around Y axis
    let x = p[0] * cosY + p[2] * sinY;
    const z1 = -p[0] * sinY + p[2] * cosY;
    // Rotate around X axis
    let y = p[1] * cosX - z1 * sinX;
    // Simple orthographic projection (Lorenz attractor looks great without perspective)
    return { x: x * viewScale, y: y * viewScale };
  };

  // Progressive reveal: show more points as the cycle progresses
  const revealFraction = interpolate(progress, [0, 0.3], [0.1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const visiblePoints = Math.floor(lorenzData.length * revealFraction);

  // Build path segments with color gradients
  const segmentCount = 16;
  const pointsPerSeg = Math.max(1, Math.floor(visiblePoints / segmentCount));
  const baseHue = (frame * 0.6) % 360;

  const segments: Array<{ d: string; color: string }> = [];
  for (let s = 0; s < segmentCount; s++) {
    const start = s * pointsPerSeg;
    const end = Math.min(start + pointsPerSeg + 1, visiblePoints);
    if (start >= visiblePoints) break;

    const projected = [];
    for (let p = start; p < end; p++) {
      projected.push(project(lorenzData[p]));
    }

    if (projected.length < 2) continue;

    let pathD = `M ${projected[0].x} ${projected[0].y}`;
    for (let p = 1; p < projected.length; p++) {
      pathD += ` L ${projected[p].x} ${projected[p].y}`;
    }

    const hue = (baseHue + (s / segmentCount) * 180) % 360;
    segments.push({ d: pathD, color: `hsl(${hue}, 100%, 65%)` });
  }

  const glowSize = interpolate(energy, [0.03, 0.3], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowColor = `hsl(${baseHue}, 100%, 60%)`;

  const strokeWidth = interpolate(energy, [0.03, 0.3], [1, 2.2], {
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
          filter: `drop-shadow(0 0 ${glowSize}px ${glowColor}) drop-shadow(0 0 ${glowSize * 2}px ${glowColor})`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Glow layer (wider, dimmer) */}
          {segments.map((seg, si) => (
            <path
              key={`glow-${si}`}
              d={seg.d}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth * 3}
              opacity={0.12}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Main path */}
          {segments.map((seg, si) => (
            <path
              key={`main-${si}`}
              d={seg.d}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              opacity={0.85}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Bright core */}
          {segments.map((seg, si) => (
            <path
              key={`core-${si}`}
              d={seg.d}
              fill="none"
              stroke="white"
              strokeWidth={strokeWidth * 0.4}
              opacity={0.2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Head dot at the most recent point */}
          {visiblePoints > 0 && (() => {
            const headPt = project(lorenzData[visiblePoints - 1]);
            return (
              <circle
                cx={headPt.x}
                cy={headPt.y}
                r={4 + energy * 4}
                fill={`hsl(${baseHue}, 100%, 80%)`}
                opacity={0.9}
              />
            );
          })()}
        </g>
      </svg>
    </div>
  );
};
