/**
 * PyramidBeams — Egyptian pyramid silhouette with mysterious light beams
 * shooting from the apex. Pyramid is a triangle outline at bottom.
 * 3-5 light beams radiate upward from the tip in a fan pattern.
 * Beams are golden/white with Egyptian blue accents. Stars in background.
 * Energy drives beam intensity and spread.
 * Cycle: 65s, 20s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/* ---- seeded PRNG (mulberry32) ---- */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 1950; // 65 seconds at 30fps
const DURATION = 600; // 20 seconds visible

const NUM_BEAMS = 5;
const NUM_STARS = 40;

// Egyptian color palette
const GOLD = "#FFD700";
const WARM_WHITE = "#FFF8DC";
const EGYPTIAN_BLUE = "#1034A6";
const PALE_GOLD = "#ECD67E";
const DEEP_GOLD = "#B8860B";

interface Props {
  frames: EnhancedFrameData[];
}

export const PyramidBeams: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-generate star positions
  const stars = React.useMemo(() => {
    const r = seeded(7712);
    return Array.from({ length: NUM_STARS }).map(() => ({
      x: r() * 100,
      y: r() * 55, // only upper portion
      size: 1 + r() * 2.5,
      twinkleSpeed: 0.03 + r() * 0.08,
      twinklePhase: r() * Math.PI * 2,
      brightness: 0.3 + r() * 0.7,
    }));
  }, []);

  // Pre-generate beam properties
  const beamProps = React.useMemo(() => {
    const r = seeded(3319);
    return Array.from({ length: NUM_BEAMS }).map((_, i) => ({
      baseAngle: -90 + (i - (NUM_BEAMS - 1) / 2) * 18,
      wobbleSpeed: 0.02 + r() * 0.03,
      wobblePhase: r() * Math.PI * 2,
      widthBase: 8 + r() * 12,
      lengthBase: 0.35 + r() * 0.2,
      isBlue: i === 1 || i === 3,
    }));
  }, []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

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
  const baseOpacity = interpolate(energy, [0.02, 0.25], [0.3, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Pyramid dimensions
  const pyramidBaseY = height * 0.85;
  const pyramidApexY = height * 0.45;
  const pyramidHalfWidth = width * 0.22;
  const apexX = width * 0.5;

  // Beam spread driven by energy
  const spreadMult = 1 + energy * 0.8;

  const glowSize = interpolate(energy, [0.02, 0.3], [4, 18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const beamIntensity = interpolate(energy, [0.02, 0.3], [0.2, 0.7], {
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
          willChange: "opacity",
        }}
      >
        <defs>
          {/* Beam gradient */}
          <linearGradient id="beam-gold" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.8} />
            <stop offset="100%" stopColor={WARM_WHITE} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="beam-blue" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={EGYPTIAN_BLUE} stopOpacity={0.6} />
            <stop offset="100%" stopColor={WARM_WHITE} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Stars */}
        {stars.map((star, si) => {
          const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(frame * star.twinkleSpeed + star.twinklePhase));
          return (
            <circle
              key={`star-${si}`}
              cx={(star.x / 100) * width}
              cy={(star.y / 100) * height}
              r={star.size}
              fill={WARM_WHITE}
              opacity={twinkle * star.brightness * 0.5}
            />
          );
        })}

        {/* Light beams from apex */}
        {beamProps.map((bp, bi) => {
          const wobble = Math.sin(frame * bp.wobbleSpeed + bp.wobblePhase) * 5 * energy;
          const angle = (bp.baseAngle * spreadMult + wobble) * Math.PI / 180;
          const beamLength = height * bp.lengthBase * (1 + energy * 0.5);
          const halfWidth = bp.widthBase * (1 + energy * 0.5);

          // Beam tip position
          const tipX = apexX + Math.cos(angle) * beamLength;
          const tipY = pyramidApexY + Math.sin(angle) * beamLength;

          // Perpendicular offsets at tip for beam width
          const perpAngle = angle + Math.PI / 2;
          const bx1 = tipX + Math.cos(perpAngle) * halfWidth;
          const by1 = tipY + Math.sin(perpAngle) * halfWidth;
          const bx2 = tipX - Math.cos(perpAngle) * halfWidth;
          const by2 = tipY - Math.sin(perpAngle) * halfWidth;

          const beamColor = bp.isBlue ? EGYPTIAN_BLUE : GOLD;
          const beamAlpha = beamIntensity * (bp.isBlue ? 0.4 : 0.5);

          return (
            <polygon
              key={`beam-${bi}`}
              points={`${apexX},${pyramidApexY} ${bx1},${by1} ${bx2},${by2}`}
              fill={beamColor}
              opacity={beamAlpha}
              style={{
                filter: `drop-shadow(0 0 ${glowSize}px ${beamColor})`,
              }}
            />
          );
        })}

        {/* Pyramid silhouette */}
        <polygon
          points={`${apexX},${pyramidApexY} ${apexX - pyramidHalfWidth},${pyramidBaseY} ${apexX + pyramidHalfWidth},${pyramidBaseY}`}
          fill="none"
          stroke={PALE_GOLD}
          strokeWidth={2.5}
          opacity={0.7}
          style={{
            filter: `drop-shadow(0 0 ${glowSize * 0.5}px ${GOLD})`,
          }}
        />

        {/* Pyramid stone lines */}
        {[0.2, 0.4, 0.6, 0.8].map((t, li) => {
          const ly = pyramidApexY + (pyramidBaseY - pyramidApexY) * t;
          const lHalf = pyramidHalfWidth * t;
          return (
            <line
              key={`stone-${li}`}
              x1={apexX - lHalf}
              y1={ly}
              x2={apexX + lHalf}
              y2={ly}
              stroke={DEEP_GOLD}
              strokeWidth={1}
              opacity={0.25}
            />
          );
        })}

        {/* Apex glow point */}
        <circle
          cx={apexX}
          cy={pyramidApexY}
          r={4 + energy * 6}
          fill={WARM_WHITE}
          opacity={0.6 + energy * 0.3}
          style={{
            filter: `drop-shadow(0 0 ${glowSize * 2}px ${GOLD})`,
          }}
        />
      </svg>
    </div>
  );
};
