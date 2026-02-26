/**
 * BoxOfRain -- Rain falling from a floating wireframe box.
 * A small 3D-ish wireframe cube (~80px) floats in upper-center, gently bobbing.
 * Rain drops (SVG lines/circles) fall from box bottom downward.
 * Rain intensity scales with energy. Drops have slight wind drift.
 * Box rotates slowly. Neon blue/cyan rain, warm amber box outline.
 * Appears every 60s for 16s. Whimsical and poetic.
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

interface RainDrop {
  /** X offset from box center, normalized -1 to 1 */
  xOffset: number;
  /** Fall speed multiplier */
  speed: number;
  /** Phase offset for staggered start */
  phase: number;
  /** Drop length */
  length: number;
  /** Hue shift from base cyan */
  hueShift: number;
  /** Wind drift amount */
  windDrift: number;
  /** Brightness */
  brightness: number;
}

const NUM_DROPS = 60;
const CYCLE = 1800; // 60 seconds at 30fps
const DURATION = 480; // 16 seconds at 30fps

function generateDrops(seed: number): RainDrop[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_DROPS }, () => ({
    xOffset: (rng() - 0.5) * 2,
    speed: 2 + rng() * 4,
    phase: rng() * 300,
    length: 8 + rng() * 18,
    hueShift: rng() * 30 - 15, // -15 to +15 around cyan
    windDrift: (rng() - 0.3) * 0.8, // slight rightward bias
    brightness: 0.5 + rng() * 0.5,
  }));
}

/** Project a 3D point with simple isometric-ish rotation */
function projectCube(
  x: number, y: number, z: number,
  rotY: number, rotX: number,
  scale: number,
): { px: number; py: number } {
  // Rotate around Y
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const x1 = x * cosY - z * sinY;
  const z1 = x * sinY + z * cosY;

  // Rotate around X
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const y1 = y * cosX - z1 * sinX;

  return { px: x1 * scale, py: y1 * scale };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const BoxOfRain: React.FC<Props> = ({ frames }) => {
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

  const drops = React.useMemo(() => generateDrops(77_508_01), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const opacity = interpolate(progress, [0, 0.08, 0.88, 1], [0, 0.8, 0.8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  // Box position: upper center, bobbing gently
  const boxCx = width / 2;
  const boxCy = height * 0.22 + Math.sin(cycleFrame * 0.025) * 12;
  const boxSize = 40; // half-size of cube

  // Slow rotation
  const rotY = cycleFrame * 0.008;
  const rotX = 0.3 + Math.sin(cycleFrame * 0.012) * 0.15;

  // Cube corners: 8 vertices of a cube from -1 to 1, scaled by boxSize
  const corners: [number, number, number][] = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ];
  const projected = corners.map(([x, y, z]) => projectCube(x, y, z, rotY, rotX, boxSize));

  // Cube edges: 12 edges connecting corner indices
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  // Rain intensity from energy
  const rainIntensity = interpolate(energy, [0.03, 0.25], [0.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const visibleDrops = Math.floor(NUM_DROPS * rainIntensity);

  // Box bottom Y (max Y of projected corners)
  const boxBottomY = Math.max(...projected.map(p => p.py)) + boxCy;
  const boxLeftX = Math.min(...projected.map(p => p.px)) + boxCx;
  const boxRightX = Math.max(...projected.map(p => p.px)) + boxCx;
  const boxWidth = boxRightX - boxLeftX;

  // Amber color for box
  const amberGlow = `hsla(38, 100%, 65%, ${0.6 + energy * 0.3})`;
  const amberBright = `hsla(38, 100%, 75%, ${0.8 + energy * 0.2})`;

  // Wind direction shifts slightly over time
  const windAngle = Math.sin(cycleFrame * 0.01) * 0.15;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        {/* Rain drops falling from box */}
        {drops.slice(0, visibleDrops).map((drop, i) => {
          const dropStart = drop.phase;
          const elapsed = cycleFrame - dropStart;
          if (elapsed < 0) return null;

          const fallDistance = height * 0.8;
          const fallTime = fallDistance / drop.speed;
          const dropProgress = (elapsed * drop.speed * 0.8) % fallDistance;

          const dx = boxLeftX + (drop.xOffset + 1) * 0.5 * boxWidth;
          const dy = boxBottomY + dropProgress;
          const windShift = dropProgress * drop.windDrift + Math.sin(windAngle) * dropProgress * 0.1;

          if (dy > height + 20) return null;

          const dropAlpha = drop.brightness * rainIntensity *
            interpolate(dy, [boxBottomY, boxBottomY + 40, height - 100, height], [0.2, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

          const hue = 190 + drop.hueShift; // cyan range
          const color = `hsla(${hue}, 90%, 70%, ${dropAlpha})`;
          const glowColor = `hsla(${hue}, 100%, 80%, ${dropAlpha * 0.5})`;

          return (
            <g key={`drop-${i}`}>
              {/* Drop glow */}
              <line
                x1={dx + windShift}
                y1={dy}
                x2={dx + windShift - drop.windDrift * 2}
                y2={dy - drop.length}
                stroke={glowColor}
                strokeWidth={3}
                strokeLinecap="round"
                style={{ filter: "blur(2px)" }}
              />
              {/* Drop core */}
              <line
                x1={dx + windShift}
                y1={dy}
                x2={dx + windShift - drop.windDrift * 2}
                y2={dy - drop.length}
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
              {/* Bright head */}
              <circle
                cx={dx + windShift}
                cy={dy}
                r={1.5}
                fill={`hsla(${hue}, 100%, 85%, ${dropAlpha * 0.8})`}
              />
            </g>
          );
        })}

        {/* Wireframe box */}
        <g style={{ filter: `drop-shadow(0 0 8px ${amberGlow}) drop-shadow(0 0 16px hsla(38, 100%, 50%, 0.3))` }}>
          {edges.map(([a, b], i) => (
            <line
              key={`edge-${i}`}
              x1={projected[a].px + boxCx}
              y1={projected[a].py + boxCy}
              x2={projected[b].px + boxCx}
              y2={projected[b].py + boxCy}
              stroke={amberBright}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
          {/* Corner dots */}
          {projected.map((p, i) => (
            <circle
              key={`corner-${i}`}
              cx={p.px + boxCx}
              cy={p.py + boxCy}
              r={2.5}
              fill={amberBright}
            />
          ))}
        </g>

        {/* Splash effects at box bottom */}
        {energy > 0.1 && (
          <ellipse
            cx={boxCx}
            cy={boxBottomY + 5}
            rx={boxWidth * 0.6}
            ry={3}
            fill="none"
            stroke={`hsla(190, 80%, 70%, ${energy * 0.3})`}
            strokeWidth={1}
            style={{ filter: "blur(2px)" }}
          />
        )}
      </svg>
    </div>
  );
};
