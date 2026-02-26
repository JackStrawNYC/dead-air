/**
 * BatikPattern — Wax-resist dye pattern flowing outward from center.
 * Organic blob shapes (like wax drips) form boundaries, and color fills
 * between them. Deep indigo, brown, cream, gold palette (traditional batik).
 * Pattern grows outward radially. Dye color "bleeds" at edges.
 * Energy drives flow speed. Cycle: 65s, 20s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1950; // 65s at 30fps
const DURATION = 600; // 20s visible
const RING_COUNT = 6;
const BLOB_POINTS = 12;

const BATIK_COLORS = [
  "#1B1464", // deep indigo
  "#2C1810", // dark brown
  "#F5E6C8", // cream
  "#C5961A", // gold
  "#3D1C6E", // dark purple
  "#4A2511", // rich brown
  "#E8D5A3", // light gold
  "#0D0B3E", // midnight blue
];

interface RingData {
  baseRadius: number;
  colorIdx: number;
  blobOffsets: number[];
  blobAmplitudes: number[];
  rotationSpeed: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const BatikPattern: React.FC<Props> = ({ frames }) => {
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

  const rings = React.useMemo(() => {
    const rng = seeded(65_042_001);
    const maxR = Math.min(1920, 1080) * 0.45;
    return Array.from({ length: RING_COUNT }, (_, ri): RingData => ({
      baseRadius: (maxR * (ri + 1)) / RING_COUNT,
      colorIdx: Math.floor(rng() * BATIK_COLORS.length),
      blobOffsets: Array.from({ length: BLOB_POINTS }, () => rng() * Math.PI * 2),
      blobAmplitudes: Array.from({ length: BLOB_POINTS }, () => 8 + rng() * 25),
      rotationSpeed: 0.001 + rng() * 0.003,
    }));
  }, []);

  // Cycle gating
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

  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.15, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;

  // Radial growth driven by progress + energy
  const growthSpeed = 0.6 + energy * 1.5;
  const growthProgress = interpolate(progress * growthSpeed, [0, 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Wax-crack line parameters
  const crackOpacity = interpolate(energy, [0.05, 0.2], [0.2, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Build ring paths
  const ringElements: React.ReactNode[] = [];

  for (let ri = 0; ri < RING_COUNT; ri++) {
    const ring = rings[ri];
    // Each ring appears progressively
    const ringAppear = interpolate(
      growthProgress,
      [Math.max(0, ri / RING_COUNT - 0.15), Math.min(1, ri / RING_COUNT + 0.25)],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );

    if (ringAppear < 0.01) continue;

    const rotation = frame * ring.rotationSpeed;

    // Build organic blob path using polar coordinates
    let path = "";
    const pointCount = BLOB_POINTS * 4; // smooth curve
    for (let p = 0; p <= pointCount; p++) {
      const angle = (p / pointCount) * Math.PI * 2 + rotation;

      // Sum blob contributions for organic edge
      let radiusOffset = 0;
      for (let b = 0; b < BLOB_POINTS; b++) {
        const freq = b + 1;
        radiusOffset += ring.blobAmplitudes[b] *
          Math.sin(angle * freq + ring.blobOffsets[b] + frame * 0.005 * (b + 1));
      }
      radiusOffset /= BLOB_POINTS;

      // Breathing with energy
      const breathe = 1 + energy * 0.1 * Math.sin(frame * 0.04 + ri);
      const r = ring.baseRadius * breathe + radiusOffset * ringAppear;

      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      if (p === 0) {
        path = `M ${x} ${y}`;
      } else {
        path += ` L ${x} ${y}`;
      }
    }
    path += " Z";

    const color = BATIK_COLORS[ring.colorIdx];

    // Dye bleed: slight feather via multiple overlapping shapes
    ringElements.push(
      <g key={`ring-${ri}`} opacity={ringAppear}>
        {/* Bleed layer (slightly larger, semi-transparent) */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={6 + energy * 4}
          opacity={0.2}
          strokeLinejoin="round"
        />
        {/* Main wax boundary */}
        <path
          d={path}
          fill="none"
          stroke={BATIK_COLORS[(ring.colorIdx + 2) % BATIK_COLORS.length]}
          strokeWidth={2}
          opacity={0.7}
          strokeLinejoin="round"
        />
      </g>
    );

    // Fill between rings (using the ring as a filled shape for inner rings)
    if (ri > 0) {
      ringElements.push(
        <path
          key={`fill-${ri}`}
          d={path}
          fill={color}
          opacity={0.15 * ringAppear}
          strokeLinejoin="round"
        />
      );
    }
  }

  // Wax crack lines radiating from center
  const crackRng = seeded(65_042_003);
  const crackLines: React.ReactNode[] = [];
  const crackCount = 8;
  for (let c = 0; c < crackCount; c++) {
    const angle = crackRng() * Math.PI * 2;
    const length = 80 + crackRng() * 300;
    const wobble1 = crackRng() * 40 - 20;
    const wobble2 = crackRng() * 40 - 20;
    const midX = Math.cos(angle) * length * 0.5 + wobble1;
    const midY = Math.sin(angle) * length * 0.5 + wobble2;
    const endX = Math.cos(angle) * length;
    const endY = Math.sin(angle) * length;

    crackLines.push(
      <path
        key={`crack-${c}`}
        d={`M 0 0 Q ${midX} ${midY} ${endX} ${endY}`}
        stroke="#F5E6C8"
        strokeWidth={0.8}
        fill="none"
        opacity={crackOpacity * growthProgress}
        strokeDasharray="4 8"
      />
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 8px rgba(27, 20, 100, 0.4))`,
        }}
      >
        <defs>
          <radialGradient id="batik-center-glow">
            <stop offset="0%" stopColor="#C5961A" stopOpacity="0.15" />
            <stop offset="60%" stopColor="#1B1464" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#1B1464" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Center glow */}
          <circle cx={0} cy={0} r={200 * growthProgress} fill="url(#batik-center-glow)" />

          {/* Ring shapes */}
          {ringElements}

          {/* Wax crack lines */}
          {crackLines}
        </g>
      </svg>
    </div>
  );
};
