/**
 * MoonPhases — Moon cycling through phases, rate tied to section progress.
 * A luminous moon body with shadow crescent that sweeps across to create
 * new/crescent/quarter/gibbous/full phases. Phase rate accelerates with energy.
 * Surrounded by a subtle halo glow. Crater details on the lit surface.
 * Positioned upper-left area. Cycles on/off: 45s on, 45s off (90s total).
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

interface Crater {
  cx: number;
  cy: number;
  r: number;
  depth: number;
}

function generateCraters(seed: number, count: number): Crater[] {
  const rng = seeded(seed);
  const craters: Crater[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * 0.75;
    craters.push({
      cx: Math.cos(angle) * dist,
      cy: Math.sin(angle) * dist,
      r: 0.04 + rng() * 0.1,
      depth: 0.3 + rng() * 0.5,
    });
  }
  return craters;
}

const CYCLE = 2700; // 90s at 30fps
const DURATION = 1350; // 45s visible

interface Props {
  frames: EnhancedFrameData[];
}

export const MoonPhases: React.FC<Props> = ({ frames }) => {
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

  const craters = React.useMemo(() => generateCraters(29979245, 12), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.55 + energy * 0.35);

  if (masterOpacity < 0.01) return null;

  const moonRadius = Math.min(width, height) * 0.055;
  const cx = width * 0.18;
  const cy = height * 0.2;

  // Phase: 0 = new moon, 0.5 = full moon, 1 = new moon again
  // Speed scales with energy (faster phase cycling at higher energy)
  const phaseSpeed = 0.0008 + energy * 0.002;
  const phase = (frame * phaseSpeed) % 1;

  // Shadow ellipse x-radius determines the phase shape
  // phase 0->0.25: waxing crescent (shadow covers most, shrinking from right)
  // phase 0.25->0.5: waxing gibbous (lit area growing)
  // phase 0.5: full moon
  // phase 0.5->0.75: waning gibbous
  // phase 0.75->1: waning crescent
  const phaseAngle = phase * Math.PI * 2;
  const shadowXScale = Math.cos(phaseAngle); // -1 to 1

  // Halo glow intensity
  const haloIntensity = interpolate(energy, [0.05, 0.3], [0.1, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle wobble
  const wobbleX = Math.sin(frame * 0.007) * 3;
  const wobbleY = Math.cos(frame * 0.005) * 2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <radialGradient id="moon-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#C8D8FF" stopOpacity="0.3" />
            <stop offset="60%" stopColor="#A0B8E0" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#A0B8E0" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="moon-surface" cx="45%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#F8F4E8" />
            <stop offset="50%" stopColor="#E8E0D0" />
            <stop offset="80%" stopColor="#D0C8B8" />
            <stop offset="100%" stopColor="#B8B0A0" />
          </radialGradient>
          <clipPath id="moon-clip">
            <circle cx={cx + wobbleX} cy={cy + wobbleY} r={moonRadius} />
          </clipPath>
          <filter id="moon-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Halo */}
        <circle
          cx={cx + wobbleX}
          cy={cy + wobbleY}
          r={moonRadius * 3}
          fill="url(#moon-halo)"
          opacity={haloIntensity}
        />

        {/* Moon body */}
        <g clipPath="url(#moon-clip)">
          <circle
            cx={cx + wobbleX}
            cy={cy + wobbleY}
            r={moonRadius}
            fill="url(#moon-surface)"
            filter="url(#moon-glow)"
          />

          {/* Craters on lit surface */}
          {craters.map((crater, i) => {
            const crX = cx + wobbleX + crater.cx * moonRadius;
            const crY = cy + wobbleY + crater.cy * moonRadius;
            return (
              <circle
                key={`cr${i}`}
                cx={crX}
                cy={crY}
                r={crater.r * moonRadius}
                fill={`rgba(160, 150, 130, ${crater.depth * 0.3})`}
              />
            );
          })}

          {/* Shadow overlay for phase */}
          <ellipse
            cx={cx + wobbleX + (shadowXScale > 0 ? moonRadius * 0.05 : -moonRadius * 0.05)}
            cy={cy + wobbleY}
            rx={moonRadius * Math.abs(shadowXScale)}
            ry={moonRadius * 1.02}
            fill="rgba(10, 10, 20, 0.92)"
          />
          {/* Second shadow half for crescent phases */}
          {Math.abs(shadowXScale) < 0.5 && (
            <rect
              x={shadowXScale > 0
                ? cx + wobbleX
                : cx + wobbleX - moonRadius}
              y={cy + wobbleY - moonRadius}
              width={moonRadius}
              height={moonRadius * 2}
              fill="rgba(10, 10, 20, 0.92)"
            />
          )}
        </g>

        {/* Rim light on the lit edge */}
        <circle
          cx={cx + wobbleX}
          cy={cy + wobbleY}
          r={moonRadius}
          fill="none"
          stroke="rgba(220, 230, 255, 0.15)"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
};
