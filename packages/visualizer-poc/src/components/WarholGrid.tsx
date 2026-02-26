/**
 * WarholGrid -- Andy Warhol-style 2x2 grid of repeated Steal Your Face
 * in different neon colorways. Each quadrant has the same stealie SVG
 * (circle + lightning bolt + horizontal line) but with a different neon
 * color scheme (hot pink, electric blue, neon green, golden yellow).
 * Grid lines between quadrants. Slight scale pulse with energy per
 * quadrant (staggered). Appears every 80s for 10s at 25-40% opacity.
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

const CYCLE = 2400; // 80 seconds at 30fps
const DURATION = 300; // 10 seconds at 30fps

/** Neon colorways per quadrant */
const QUADRANT_COLORS = [
  { main: "#FF1493", bolt: "#FF69B4", bg: "rgba(255,20,147,0.06)" },   // hot pink
  { main: "#00BFFF", bolt: "#00FFFF", bg: "rgba(0,191,255,0.06)" },   // electric blue
  { main: "#39FF14", bolt: "#76FF03", bg: "rgba(57,255,20,0.06)" },    // neon green
  { main: "#FFD700", bolt: "#FFEA00", bg: "rgba(255,215,0,0.06)" },    // golden yellow
];

/** Stealie SVG for one quadrant */
const StealieQuadrant: React.FC<{
  size: number;
  mainColor: string;
  boltColor: string;
  scale: number;
}> = ({ size, mainColor, boltColor, scale }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 200 200"
    fill="none"
    style={{ transform: `scale(${scale})` }}
  >
    {/* Outer ring */}
    <circle cx="100" cy="100" r="90" stroke={mainColor} strokeWidth="5" />
    <circle cx="100" cy="100" r="84" stroke={mainColor} strokeWidth="1.5" opacity="0.35" />
    {/* Upper skull dome */}
    <path
      d="M 16 100 A 84 84 0 0 1 184 100"
      fill={mainColor}
      opacity="0.12"
    />
    {/* Horizontal divider */}
    <line x1="10" y1="100" x2="190" y2="100" stroke={mainColor} strokeWidth="3" />
    {/* Lightning bolt */}
    <polygon
      points="100,10 88,80 108,80 78,190 118,108 96,108 116,10"
      fill={boltColor}
    />
    {/* Eye sockets */}
    <circle cx="68" cy="74" r="17" stroke={mainColor} strokeWidth="3" />
    <circle cx="132" cy="74" r="17" stroke={mainColor} strokeWidth="3" />
    {/* Inner eye glow */}
    <circle cx="68" cy="74" r="7" fill={mainColor} opacity="0.25" />
    <circle cx="132" cy="74" r="7" fill={mainColor} opacity="0.25" />
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const WarholGrid: React.FC<Props> = ({ frames }) => {
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

  // Staggered phase offsets for quadrant pulses (memoized once)
  const phaseOffsets = React.useMemo(() => {
    const rng = seeded(42_420_069);
    return QUADRANT_COLORS.map(() => rng() * Math.PI * 2);
  }, []);

  // Cycle gating
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

  // 25-40% opacity driven by energy
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  const halfW = width / 2;
  const halfH = height / 2;
  const stealieSize = Math.min(halfW, halfH) * 0.65;

  // Grid line thickness
  const gridThickness = 3;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: masterOpacity,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
        }}
      >
        {QUADRANT_COLORS.map((colors, qi) => {
          // Staggered energy pulse per quadrant
          const pulsePhase = phaseOffsets[qi];
          const sineVal = Math.sin(frame * 0.08 + pulsePhase);
          const energyPulse = 1 + sineVal * energy * 0.15;

          const glowRadius = interpolate(energy, [0.05, 0.3], [6, 20], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <div
              key={qi}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: colors.bg,
                filter: `drop-shadow(0 0 ${glowRadius}px ${colors.main})`,
              }}
            >
              <StealieQuadrant
                size={stealieSize}
                mainColor={colors.main}
                boltColor={colors.bolt}
                scale={energyPulse}
              />
            </div>
          );
        })}
      </div>
      {/* Grid lines */}
      <div
        style={{
          position: "absolute",
          left: halfW - gridThickness / 2,
          top: 0,
          width: gridThickness,
          height: height,
          background: "rgba(255,255,255,0.25)",
          opacity: masterOpacity,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: halfH - gridThickness / 2,
          width: width,
          height: gridThickness,
          background: "rgba(255,255,255,0.25)",
          opacity: masterOpacity,
        }}
      />
    </div>
  );
};
