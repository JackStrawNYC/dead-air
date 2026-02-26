/**
 * WallOfSound — speaker stack silhouette + spinning vinyl + neon sign.
 * Three iconic elements:
 * - Wall of Sound: the famous speaker tower silhouette along bottom
 * - Vinyl record: spinning in corner, groove lines animated
 * - Neon sign: flickering "GRATEFUL DEAD" neon tubes
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

// ── WALL OF SOUND SILHOUETTE ────────────────────────────────────

const WallSpeakers: React.FC<{ width: number; height: number; energy: number; frame: number }> = ({
  width, height, energy, frame,
}) => {
  // Only visible during high energy
  if (energy < 0.15) return null;

  const opacity = interpolate(energy, [0.15, 0.3], [0, 0.4], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hue = (frame * 0.5) % 360;
  const color = `hsl(${hue}, 80%, 50%)`;
  const glow = `drop-shadow(0 0 8px ${color}) drop-shadow(0 0 20px ${color})`;

  const stackW = 80;
  const numStacks = Math.ceil(width / stackW) + 1;
  const baseY = height - 10;

  // Speaker cone pulse with energy
  const pulse = 1 + energy * 0.15;

  return (
    <svg
      width={width} height={height}
      style={{ position: "absolute", inset: 0, opacity, filter: glow, pointerEvents: "none" }}
    >
      {Array.from({ length: numStacks }, (_, i) => {
        const x = i * stackW;
        // Alternating heights for that iconic staggered look
        const stackH = (i % 3 === 1 ? 180 : i % 3 === 2 ? 140 : 160) * (0.8 + energy * 0.4);
        const y = baseY - stackH;

        return (
          <g key={i}>
            {/* Cabinet outline */}
            <rect x={x + 2} y={y} width={stackW - 4} height={stackH} stroke={color} strokeWidth="1.5" fill="none" opacity="0.6" />

            {/* Speaker cones (4 rows) */}
            {Array.from({ length: 4 }, (_, row) => {
              const coneY = y + 15 + row * (stackH / 4);
              const coneR = 12 * pulse;
              return (
                <g key={row}>
                  <circle cx={x + stackW * 0.3} cy={coneY} r={coneR} stroke={color} strokeWidth="1" fill="none" opacity="0.4" />
                  <circle cx={x + stackW * 0.3} cy={coneY} r={coneR * 0.4} fill={color} opacity="0.3" />
                  <circle cx={x + stackW * 0.7} cy={coneY} r={coneR} stroke={color} strokeWidth="1" fill="none" opacity="0.4" />
                  <circle cx={x + stackW * 0.7} cy={coneY} r={coneR * 0.4} fill={color} opacity="0.3" />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
};

// ── SPINNING VINYL ──────────────────────────────────────────────

const VinylRecord: React.FC<{ energy: number; frame: number }> = ({ energy, frame }) => {
  const size = 100;
  const rotation = frame * (2 + energy * 3); // RPM increases with energy
  const color = `hsl(${(frame * 0.3) % 360}, 70%, 50%)`;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        opacity: 0.5,
        filter: `drop-shadow(0 0 8px ${color})`,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100">
        <g transform={`rotate(${rotation} 50 50)`}>
          {/* Record */}
          <circle cx="50" cy="50" r="48" fill="#111" stroke={color} strokeWidth="1" />
          {/* Grooves */}
          {[38, 32, 26, 20, 44].map((r, i) => (
            <circle key={i} cx="50" cy="50" r={r} stroke={color} strokeWidth="0.5" fill="none" opacity={0.25 + i * 0.05} />
          ))}
          {/* Label */}
          <circle cx="50" cy="50" r="15" fill={color} opacity="0.4" />
          <circle cx="50" cy="50" r="14" stroke={color} strokeWidth="1" fill="none" opacity="0.6" />
          {/* Center hole */}
          <circle cx="50" cy="50" r="3" fill="#000" />
          {/* Label text */}
          <text x="50" y="48" textAnchor="middle" fontSize="5" fill="white" opacity="0.5" fontFamily="serif">GRATEFUL</text>
          <text x="50" y="55" textAnchor="middle" fontSize="5" fill="white" opacity="0.5" fontFamily="serif">DEAD</text>
          {/* Light reflection streak */}
          <line x1="20" y1="50" x2="80" y2="50" stroke="white" strokeWidth="0.3" opacity="0.15" />
        </g>
      </svg>
    </div>
  );
};

// ── NEON SIGN ───────────────────────────────────────────────────

const NeonSign: React.FC<{ energy: number; frame: number }> = ({ energy, frame }) => {
  const NEON_CYCLE = 2100;     // 70 seconds between appearances
  const NEON_DURATION = 360;   // 12 seconds visible

  const cycleFrame = frame % NEON_CYCLE;
  if (cycleFrame >= NEON_DURATION) return null;

  const progress = cycleFrame / NEON_DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(fadeIn, fadeOut) * 0.75;

  // Neon flicker
  const flicker1 = Math.sin(frame * 3.7) > 0.92 ? 0.3 : 1;
  const flicker2 = Math.sin(frame * 5.1 + 2) > 0.95 ? 0.4 : 1;

  const hue = (frame * 0.4) % 360;
  const color1 = `hsl(${hue}, 100%, 65%)`;
  const color2 = `hsl(${(hue + 60) % 360}, 100%, 65%)`;

  return (
    <div
      style={{
        position: "absolute",
        top: "45%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        opacity,
        pointerEvents: "none",
      }}
    >
      {/* "GRATEFUL" */}
      <div
        style={{
          fontSize: 64,
          fontWeight: 900,
          fontFamily: "serif",
          letterSpacing: 16,
          color: color1,
          opacity: flicker1,
          textShadow: `
            0 0 10px ${color1},
            0 0 20px ${color1},
            0 0 40px ${color1},
            0 0 80px ${color1}
          `,
          textAlign: "center",
          lineHeight: 1,
        }}
      >
        GRATEFUL
      </div>
      {/* "DEAD" */}
      <div
        style={{
          fontSize: 80,
          fontWeight: 900,
          fontFamily: "serif",
          letterSpacing: 24,
          color: color2,
          opacity: flicker2,
          textShadow: `
            0 0 10px ${color2},
            0 0 20px ${color2},
            0 0 40px ${color2},
            0 0 80px ${color2}
          `,
          textAlign: "center",
          lineHeight: 1,
          marginTop: 4,
        }}
      >
        DEAD
      </div>
    </div>
  );
};

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const WallOfSound: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 60); i <= Math.min(frames.length - 1, idx + 60); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <WallSpeakers width={width} height={height} energy={energy} frame={frame} />
      <VinylRecord energy={energy} frame={frame} />
      <NeonSign energy={energy} frame={frame} />
    </div>
  );
};
