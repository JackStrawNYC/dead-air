/**
 * EclipseCorona — Solar eclipse with corona rays, dramatic on energy peaks.
 * Dark moon disc occluding a bright sun, with ethereal corona streamers radiating
 * outward. Corona ray length and brightness intensify with energy. Diamond ring
 * effect flashes on highest energy peaks. Bailey's beads (bright dots) along the
 * eclipse limb. Positioned center. Cycles: 25s on, 65s off (90s total).
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

interface CoronaRay {
  angle: number;
  length: number;
  width: number;
  curvature: number;
  speed: number;
  phase: number;
  brightness: number;
}

interface BaileyBead {
  angle: number;
  size: number;
  brightness: number;
}

function generateRays(seed: number, count: number): CoronaRay[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    angle: rng() * Math.PI * 2,
    length: 0.5 + rng() * 1.5,
    width: 1 + rng() * 3,
    curvature: (rng() - 0.5) * 0.6,
    speed: 0.005 + rng() * 0.015,
    phase: rng() * Math.PI * 2,
    brightness: 0.4 + rng() * 0.6,
  }));
}

function generateBeads(seed: number, count: number): BaileyBead[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    angle: rng() * Math.PI * 2,
    size: 1.5 + rng() * 3,
    brightness: 0.5 + rng() * 0.5,
  }));
}

const CYCLE = 2700; // 90s at 30fps
const DURATION = 750; // 25s
const NUM_RAYS = 24;

interface Props {
  frames: EnhancedFrameData[];
}

export const EclipseCorona: React.FC<Props> = ({ frames }) => {
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

  const rays = React.useMemo(() => generateRays(14142135, NUM_RAYS), []);
  const beads = React.useMemo(() => generateBeads(17320508, 8), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.5 + energy * 0.4);

  if (masterOpacity < 0.01) return null;

  const baseSize = Math.min(width, height);
  const cx = width * 0.5;
  const cy = height * 0.4;
  const sunRadius = baseSize * 0.065;
  const moonRadius = sunRadius * 0.98; // slightly smaller for chromosphere ring

  // Diamond ring effect on high energy
  const isDiamondRing = energy > 0.3;
  const diamondAngle = Math.sin(frame * 0.01) * Math.PI * 0.3 + Math.PI * 0.25;

  // Corona ray length scales with energy
  const rayLengthMult = interpolate(energy, [0.05, 0.35], [0.6, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <radialGradient id="eclipse-outer-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFE8C0" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#FFD080" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#FFD080" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="eclipse-chromosphere" cx="50%" cy="50%" r="50%">
            <stop offset="85%" stopColor="transparent" />
            <stop offset="92%" stopColor="#FF4040" stopOpacity="0.3" />
            <stop offset="97%" stopColor="#FF6030" stopOpacity="0.15" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="eclipse-bloom">
            <feGaussianBlur stdDeviation="8" result="bloom" />
            <feMerge>
              <feMergeNode in="bloom" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="eclipse-soft">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer corona glow */}
        <circle cx={cx} cy={cy} r={sunRadius * 5} fill="url(#eclipse-outer-glow)" />

        {/* Corona rays */}
        {rays.map((ray, ri) => {
          const wave = Math.sin(frame * ray.speed + ray.phase);
          const angleWobble = wave * 0.1;
          const angle = ray.angle + angleWobble + frame * 0.0003;

          const len = ray.length * sunRadius * rayLengthMult;
          const sx = cx + Math.cos(angle) * (sunRadius * 1.05);
          const sy = cy + Math.sin(angle) * (sunRadius * 1.05);
          const ex = cx + Math.cos(angle) * (sunRadius * 1.05 + len);
          const ey = cy + Math.sin(angle) * (sunRadius * 1.05 + len);

          // Curved control point
          const cpAngle = angle + ray.curvature * wave;
          const cpDist = sunRadius * 1.05 + len * 0.55;
          const cpx = cx + Math.cos(cpAngle) * cpDist;
          const cpy = cy + Math.sin(cpAngle) * cpDist;

          const alpha = ray.brightness * (0.3 + energy * 0.5);

          return (
            <path
              key={`cr${ri}`}
              d={`M ${sx} ${sy} Q ${cpx} ${cpy}, ${ex} ${ey}`}
              fill="none"
              stroke={`rgba(255, 230, 180, ${Math.min(alpha, 0.8)})`}
              strokeWidth={ray.width * (0.7 + energy * 0.6)}
              strokeLinecap="round"
              filter="url(#eclipse-soft)"
              style={{ mixBlendMode: "screen" }}
            />
          );
        })}

        {/* Chromosphere ring */}
        <circle
          cx={cx} cy={cy}
          r={sunRadius}
          fill="url(#eclipse-chromosphere)"
          filter="url(#eclipse-bloom)"
        />

        {/* Thin bright ring at sun edge */}
        <circle
          cx={cx} cy={cy}
          r={sunRadius}
          fill="none"
          stroke="rgba(255, 200, 120, 0.4)"
          strokeWidth={1.5 + energy * 1.5}
          filter="url(#eclipse-soft)"
        />

        {/* Moon disc (dark) */}
        <circle cx={cx} cy={cy} r={moonRadius} fill="#080810" />
        {/* Subtle moon edge highlight */}
        <circle
          cx={cx} cy={cy}
          r={moonRadius}
          fill="none"
          stroke="rgba(40, 40, 60, 0.3)"
          strokeWidth={1}
        />

        {/* Bailey's beads */}
        {beads.map((bead, bi) => {
          const bx = cx + Math.cos(bead.angle) * sunRadius;
          const by = cy + Math.sin(bead.angle) * sunRadius;
          const flicker = (Math.sin(frame * 0.12 + bi * 2.1) + 1) * 0.5;
          const alpha = bead.brightness * flicker * (0.3 + energy * 0.5);
          if (alpha < 0.05) return null;
          return (
            <circle
              key={`bb${bi}`}
              cx={bx} cy={by}
              r={bead.size * (0.8 + energy * 0.5)}
              fill={`rgba(255, 240, 200, ${Math.min(alpha, 0.9)})`}
              filter="url(#eclipse-bloom)"
            />
          );
        })}

        {/* Diamond ring effect */}
        {isDiamondRing && (
          <g>
            <circle
              cx={cx + Math.cos(diamondAngle) * sunRadius}
              cy={cy + Math.sin(diamondAngle) * sunRadius}
              r={4 + energy * 8}
              fill="#FFFFFF"
              filter="url(#eclipse-bloom)"
              opacity={interpolate(energy, [0.3, 0.45], [0.3, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })}
            />
            {/* Diamond ring radial spikes */}
            {Array.from({ length: 4 }, (_, si) => {
              const spikeAngle = diamondAngle + (si * Math.PI) / 2;
              const spikeLen = 15 + energy * 40;
              const bx = cx + Math.cos(diamondAngle) * sunRadius;
              const by = cy + Math.sin(diamondAngle) * sunRadius;
              return (
                <line
                  key={`ds${si}`}
                  x1={bx} y1={by}
                  x2={bx + Math.cos(spikeAngle) * spikeLen}
                  y2={by + Math.sin(spikeAngle) * spikeLen}
                  stroke="rgba(255, 255, 255, 0.5)"
                  strokeWidth={1.5}
                  filter="url(#eclipse-bloom)"
                />
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
};
