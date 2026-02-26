/**
 * LotusOpen — Sacred lotus flower in center-bottom of screen.
 * Multiple petal layers (3 rings of 8 petals each) that open sequentially
 * from outside in. Pink/magenta outer, white/cream inner petals. Golden
 * stamen center revealed last. Petals glow with energy. Water ripple
 * effect beneath. Cycle: 60s, 18s bloom duration, energy > 0.15.
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

const CYCLE = 1800; // 60s at 30fps
const DURATION = 540; // 18s bloom duration
const PETALS_PER_RING = 8;
const NUM_RINGS = 3;
const NUM_STAMENS = 12;
const NUM_RIPPLES = 5;

interface PetalData {
  ring: number;
  index: number;
  angle: number;
  angleOffset: number;
  lengthScale: number;
  widthScale: number;
}

interface StamenData {
  angle: number;
  length: number;
  tipSize: number;
}

interface RippleData {
  phase: number;
  speed: number;
  maxRadius: number;
}

interface LotusData {
  petals: PetalData[];
  stamens: StamenData[];
  ripples: RippleData[];
}

function generateLotus(seed: number): LotusData {
  const rng = seeded(seed);

  const petals: PetalData[] = [];
  for (let ring = 0; ring < NUM_RINGS; ring++) {
    for (let i = 0; i < PETALS_PER_RING; i++) {
      const baseAngle = (i / PETALS_PER_RING) * Math.PI * 2;
      // Offset each ring so petals interleave
      const ringOffset = (ring * Math.PI) / PETALS_PER_RING;
      petals.push({
        ring,
        index: i,
        angle: baseAngle + ringOffset,
        angleOffset: (rng() - 0.5) * 0.1,
        lengthScale: 0.85 + rng() * 0.3,
        widthScale: 0.8 + rng() * 0.4,
      });
    }
  }

  const stamens: StamenData[] = Array.from({ length: NUM_STAMENS }, () => ({
    angle: rng() * Math.PI * 2,
    length: 10 + rng() * 15,
    tipSize: 2 + rng() * 2,
  }));

  const ripples: RippleData[] = Array.from({ length: NUM_RIPPLES }, () => ({
    phase: rng() * Math.PI * 2,
    speed: 0.008 + rng() * 0.012,
    maxRadius: 80 + rng() * 60,
  }));

  return { petals, stamens, ripples };
}

// Petal colors by ring: outer = pink/magenta, middle = light pink, inner = white/cream
function getPetalColor(ring: number, energy: number, pulse: number): string {
  const brightness = 60 + energy * 20 + pulse * 10;
  switch (ring) {
    case 0: return `hsl(330, ${70 + energy * 20}%, ${brightness}%)`;  // magenta/pink
    case 1: return `hsl(340, ${50 + energy * 15}%, ${brightness + 10}%)`;  // light pink
    default: return `hsl(40, ${20 + energy * 10}%, ${brightness + 20}%)`;  // cream/white
  }
}

function getPetalGlow(ring: number): string {
  switch (ring) {
    case 0: return "rgba(255, 20, 147, 0.4)";
    case 1: return "rgba(255, 105, 180, 0.3)";
    default: return "rgba(255, 248, 220, 0.3)";
  }
}

interface Props {
  frames: EnhancedFrameData[];
}

export const LotusOpen: React.FC<Props> = ({ frames }) => {
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

  const lotus = React.useMemo(() => generateLotus(10801080), []);

  const cycleFrame = frame % CYCLE;

  // Energy gate
  if (cycleFrame >= DURATION) return null;

  const energyGate = interpolate(energy, [0.08, 0.15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (energyGate < 0.01) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * energyGate * (0.5 + energy * 0.35);

  if (masterOpacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.82;
  const baseRadius = Math.min(width, height) * 0.12;
  const pulse = (Math.sin(frame * 0.04) + 1) * 0.5;

  // Ring opening sequence: outer ring opens first, inner last
  const ringOpenProgress = (ring: number): number => {
    const ringStart = ring * 0.2; // ring 0 starts at 0, ring 1 at 0.2, ring 2 at 0.4
    const ringEnd = ringStart + 0.4;
    return interpolate(progress, [ringStart, ringEnd], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
  };

  // Stamen reveal: last to appear
  const stamenReveal = interpolate(progress, [0.6, 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 10px rgba(255, 20, 147, 0.3)) drop-shadow(0 0 20px rgba(255, 105, 180, 0.2))`,
        }}
      >
        <defs>
          <filter id="lotus-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Water ripples beneath */}
        {lotus.ripples.map((ripple, ri) => {
          const ripplePhase = (frame * ripple.speed + ripple.phase) % (Math.PI * 2);
          const rippleR = (ripplePhase / (Math.PI * 2)) * ripple.maxRadius + baseRadius * 1.5;
          const rippleOpacity = interpolate(
            ripplePhase,
            [0, Math.PI * 0.5, Math.PI * 2],
            [0.3, 0.15, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          return (
            <ellipse
              key={`ripple-${ri}`}
              cx={cx}
              cy={cy + 15}
              rx={rippleR}
              ry={rippleR * 0.25}
              stroke="rgba(100, 180, 220, 0.3)"
              strokeWidth={1}
              fill="none"
              opacity={rippleOpacity * masterOpacity}
            />
          );
        })}

        {/* Petals: rendered ring by ring (outer first for layering) */}
        {lotus.petals
          .sort((a, b) => a.ring - b.ring) // outer rings rendered first (behind)
          .map((petal, pi) => {
            const openAmount = ringOpenProgress(petal.ring);
            if (openAmount < 0.01) return null;

            const ringRadius = baseRadius * (1.2 - petal.ring * 0.25);
            const petalLength = ringRadius * petal.lengthScale * (0.7 + openAmount * 0.3);
            const petalWidth = ringRadius * 0.35 * petal.widthScale;
            const petalAngle = petal.angle + petal.angleOffset;

            // Petals "unfold" outward: closed = pointing up, open = pointing radially out
            const tiltAngle = interpolate(openAmount, [0, 1], [-Math.PI * 0.4, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            // Breathing motion
            const breathe = Math.sin(frame * 0.02 + petal.index * 0.8 + petal.ring * 1.5) * 3;
            const radialAngle = petalAngle + tiltAngle;

            // Petal tip position
            const tipX = cx + Math.cos(radialAngle) * (petalLength + breathe);
            const tipY = cy + Math.sin(radialAngle) * (petalLength + breathe);

            // Petal base (near center)
            const baseOffsetX = Math.cos(petalAngle) * 5;
            const baseOffsetY = Math.sin(petalAngle) * 5;

            // Control points for petal shape (curved elliptical)
            const perpAngle = radialAngle + Math.PI * 0.5;
            const cpLeftX = cx + baseOffsetX + Math.cos(radialAngle) * petalLength * 0.4 + Math.cos(perpAngle) * petalWidth;
            const cpLeftY = cy + baseOffsetY + Math.sin(radialAngle) * petalLength * 0.4 + Math.sin(perpAngle) * petalWidth;
            const cpRightX = cx + baseOffsetX + Math.cos(radialAngle) * petalLength * 0.4 - Math.cos(perpAngle) * petalWidth;
            const cpRightY = cy + baseOffsetY + Math.sin(radialAngle) * petalLength * 0.4 - Math.sin(perpAngle) * petalWidth;

            const pathD = `M ${cx + baseOffsetX} ${cy + baseOffsetY} Q ${cpLeftX} ${cpLeftY}, ${tipX} ${tipY} Q ${cpRightX} ${cpRightY}, ${cx + baseOffsetX} ${cy + baseOffsetY}`;

            const color = getPetalColor(petal.ring, energy, pulse);
            const glow = getPetalGlow(petal.ring);

            return (
              <g key={`petal-${pi}`}>
                {/* Petal glow */}
                <path
                  d={pathD}
                  fill={glow}
                  opacity={openAmount * 0.4}
                  style={{ filter: "blur(4px)" }}
                />
                {/* Petal shape */}
                <path
                  d={pathD}
                  fill={color}
                  stroke={`rgba(255, 255, 255, ${0.15 + energy * 0.1})`}
                  strokeWidth={0.5}
                  opacity={openAmount * (0.7 + pulse * 0.2)}
                  filter="url(#lotus-glow)"
                />
              </g>
            );
          })}

        {/* Golden stamen center */}
        {stamenReveal > 0.01 && (
          <g opacity={stamenReveal}>
            {/* Central dome */}
            <circle
              cx={cx}
              cy={cy}
              r={8 + energy * 4}
              fill="rgba(255, 215, 0, 0.7)"
              filter="url(#lotus-glow)"
            />

            {/* Stamen filaments */}
            {lotus.stamens.map((stamen, si) => {
              const sAngle = stamen.angle + Math.sin(frame * 0.03 + si) * 0.1;
              const sLen = stamen.length * stamenReveal;
              const sx = cx + Math.cos(sAngle) * sLen;
              const sy = cy + Math.sin(sAngle) * sLen;

              return (
                <g key={`stamen-${si}`}>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={sx}
                    y2={sy}
                    stroke="rgba(218, 165, 32, 0.6)"
                    strokeWidth={1}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={sx}
                    cy={sy}
                    r={stamen.tipSize * stamenReveal}
                    fill="rgba(255, 200, 0, 0.8)"
                  />
                </g>
              );
            })}

            {/* Central glow */}
            <circle
              cx={cx}
              cy={cy}
              r={20 + energy * 10}
              fill="rgba(255, 215, 0, 0.15)"
              style={{ filter: "blur(8px)" }}
            />
          </g>
        )}
      </svg>
    </div>
  );
};
