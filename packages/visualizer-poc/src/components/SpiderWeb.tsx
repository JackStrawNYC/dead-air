/**
 * SpiderWeb — Radial spider web pattern with concentric rings connected by
 * radial threads. Web positioned in a corner. Dew drops (small bright circles)
 * along threads that glisten/sparkle. Web sways gently with energy.
 * Silver/white threads with rainbow-refracting dew drops.
 * Cycle: 70s (2100 frames), 22s (660 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2100; // 70s at 30fps
const DURATION = 660; // 22s visible
const RADIAL_COUNT = 16;
const RING_COUNT = 8;

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DewDrop {
  ringIdx: number;
  radialIdx: number;
  sparklePhase: number;
  hue: number;
  size: number;
}

function generateDewDrops(seed: number): DewDrop[] {
  const rng = mulberry32(seed);
  const drops: DewDrop[] = [];
  for (let ring = 1; ring <= RING_COUNT; ring++) {
    for (let rad = 0; rad < RADIAL_COUNT; rad++) {
      if (rng() < 0.35) {
        drops.push({
          ringIdx: ring,
          radialIdx: rad,
          sparklePhase: rng() * Math.PI * 2,
          hue: rng() * 360,
          size: 1.5 + rng() * 2.5,
        });
      }
    }
  }
  return drops;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SpiderWeb: React.FC<Props> = ({ frames }) => {
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

  const dewDrops = React.useMemo(() => generateDewDrops(5577), []);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.2, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Web in top-right corner
  const anchorX = width * 0.88;
  const anchorY = height * 0.08;
  const webRadius = Math.min(width, height) * 0.35;

  // Web sways with energy
  const swayAngle = Math.sin(frame * 0.015) * 2 * (1 + energy * 3);
  const swayX = Math.sin(frame * 0.01) * 5 * energy;
  const swayY = Math.cos(frame * 0.012) * 4 * energy;

  // Angle range for the web (quarter-circle plus some extra, hanging downward-left)
  const startAngle = Math.PI * 0.55; // pointing down-left
  const endAngle = Math.PI * 1.1;
  const angleStep = (endAngle - startAngle) / (RADIAL_COUNT - 1);

  // Get position on the web given ring and radial indices, with sway deformation
  const getWebPoint = (ringIdx: number, radialIdx: number) => {
    const r = (ringIdx / RING_COUNT) * webRadius;
    const angle = startAngle + radialIdx * angleStep;

    // Sway deformation: outer rings sway more
    const swayFactor = ringIdx / RING_COUNT;
    const deformX = Math.sin(frame * 0.02 + radialIdx * 0.3) * 3 * swayFactor * (1 + energy * 2);
    const deformY = Math.cos(frame * 0.018 + radialIdx * 0.4) * 2 * swayFactor * (1 + energy * 2);

    return {
      x: anchorX + swayX + Math.cos(angle) * r + deformX,
      y: anchorY + swayY + Math.sin(angle) * r + deformY,
    };
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: "drop-shadow(0 0 3px rgba(255, 255, 255, 0.3))",
          willChange: "opacity",
        }}
      >
        <g transform={`rotate(${swayAngle} ${anchorX} ${anchorY})`}>
          {/* Radial threads from center to outer ring */}
          {Array.from({ length: RADIAL_COUNT }, (_, ri) => {
            const inner = getWebPoint(0, ri);
            const outer = getWebPoint(RING_COUNT, ri);
            return (
              <line
                key={`rad-${ri}`}
                x1={anchorX + swayX}
                y1={anchorY + swayY}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(220, 220, 240, 0.5)"
                strokeWidth={0.8}
              />
            );
          })}

          {/* Concentric ring threads */}
          {Array.from({ length: RING_COUNT }, (_, ringIdx) => {
            const ring = ringIdx + 1;
            const points: string[] = [];
            for (let ri = 0; ri < RADIAL_COUNT; ri++) {
              const p = getWebPoint(ring, ri);
              points.push(ri === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`);
            }
            return (
              <path
                key={`ring-${ringIdx}`}
                d={points.join(" ")}
                fill="none"
                stroke="rgba(220, 220, 240, 0.35)"
                strokeWidth={0.6}
              />
            );
          })}

          {/* Dew drops */}
          {dewDrops.map((drop, di) => {
            const pos = getWebPoint(drop.ringIdx, drop.radialIdx);
            // Sparkle: brightness oscillates
            const sparkle = 0.4 + Math.sin(frame * 0.08 + drop.sparklePhase) * 0.4;
            // Rainbow refraction: hue shifts slowly
            const hue = (drop.hue + frame * 0.5) % 360;

            return (
              <React.Fragment key={`dew-${di}`}>
                {/* Glow */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={drop.size * 2.5}
                  fill={`hsla(${hue}, 100%, 80%, ${sparkle * 0.15})`}
                />
                {/* Drop */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={drop.size}
                  fill={`hsla(${hue}, 90%, 85%, ${sparkle * 0.8})`}
                />
                {/* Highlight */}
                <circle
                  cx={pos.x - drop.size * 0.3}
                  cy={pos.y - drop.size * 0.3}
                  r={drop.size * 0.35}
                  fill={`rgba(255, 255, 255, ${sparkle * 0.9})`}
                />
              </React.Fragment>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
