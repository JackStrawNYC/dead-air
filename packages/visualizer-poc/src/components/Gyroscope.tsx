/**
 * Gyroscope — Spinning gyroscope with 3 concentric gimbal rings rotating on different axes.
 * Inner ring spins fast (Z axis), middle ring tilts (X axis), outer ring precesses slowly (Y axis).
 * Metallic silver/gold rings with axis crossbars.
 * Spin speed driven by energy. Scientific/mechanical beauty.
 * Cycle: 55s, 16s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1650; // 55s at 30fps
const DURATION = 480; // 16s visible

interface Props {
  frames: EnhancedFrameData[];
}

export const Gyroscope: React.FC<Props> = ({ frames }) => {
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

  // Ring detail tick marks (deterministic)
  const tickCounts = React.useMemo(() => {
    const rng = seeded(6060);
    return {
      inner: 24 + Math.floor(rng() * 8),
      middle: 16 + Math.floor(rng() * 8),
      outer: 12 + Math.floor(rng() * 6),
    };
  }, []);

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
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Gyroscope center
  const gyroCx = width * 0.45;
  const gyroCy = height * 0.5;

  // Ring radii
  const innerR = 50;
  const middleR = 80;
  const outerR = 110;

  // Spin speeds driven by energy
  const speedMult = 0.3 + energy * 3.0;

  // Inner ring: fast Z rotation
  const innerAngle = frame * 3.5 * speedMult;
  // Middle ring: moderate X tilt (simulated as ellipse squash)
  const middleTilt = Math.sin(frame * 0.8 * speedMult * 0.1) * 0.6;
  // Outer ring: slow Y precession (simulated as rotation)
  const outerAngle = frame * 0.3 * speedMult;

  // For 2D SVG, we simulate 3D rotation via ellipse ry scaling
  const middleScaleY = Math.abs(Math.cos(middleTilt));
  const outerScaleY = Math.abs(Math.cos(outerAngle * 0.02));

  // Helper: draw a ring as an ellipse with tick marks
  const renderRing = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rotation: number,
    strokeColor: string,
    strokeWidth: number,
    ringOpacity: number,
    numTicks: number,
    tickLen: number,
    hasCrossbars: boolean,
  ) => {
    const ticks: React.ReactElement[] = [];
    for (let i = 0; i < numTicks; i++) {
      const a = (i / numTicks) * Math.PI * 2;
      const tx = Math.cos(a) * rx;
      const ty = Math.sin(a) * ry;
      const outerTx = Math.cos(a) * (rx + tickLen);
      const outerTy = Math.sin(a) * (ry + tickLen * (ry / rx));
      ticks.push(
        <line
          key={`tick-${i}`}
          x1={tx}
          y1={ty}
          x2={outerTx}
          y2={outerTy}
          stroke={strokeColor}
          strokeWidth={0.6}
          opacity={ringOpacity * 0.4}
        />
      );
    }

    const crossbars: React.ReactElement[] = [];
    if (hasCrossbars) {
      // Horizontal crossbar
      crossbars.push(
        <line key="hbar" x1={-rx} y1={0} x2={rx} y2={0} stroke={strokeColor} strokeWidth={2} opacity={ringOpacity * 0.5} />
      );
      // Vertical crossbar
      crossbars.push(
        <line key="vbar" x1={0} y1={-ry} x2={0} y2={ry} stroke={strokeColor} strokeWidth={2} opacity={ringOpacity * 0.5} />
      );
    }

    return (
      <g transform={`translate(${cx},${cy}) rotate(${rotation})`}>
        <ellipse
          cx={0}
          cy={0}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          opacity={ringOpacity}
        />
        {ticks}
        {crossbars}
      </g>
    );
  };

  // Gimbal pivot points (small circles where rings connect)
  const pivotSize = 4;

  const glowStd = interpolate(energy, [0.02, 0.3], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity, willChange: "opacity" }}
      >
        <defs>
          <filter id="gyro-glow">
            <feGaussianBlur stdDeviation={glowStd} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer ring (slow precession) */}
        {renderRing(
          gyroCx, gyroCy,
          outerR, outerR * (0.5 + outerScaleY * 0.5),
          outerAngle * 0.5,
          "#A0A0B0", 3, 0.5,
          tickCounts.outer, 4, true,
        )}

        {/* Middle ring (X-axis tilt) */}
        {renderRing(
          gyroCx, gyroCy,
          middleR, middleR * (0.4 + middleScaleY * 0.6),
          -outerAngle * 0.3,
          "#C0B070", 2.5, 0.55,
          tickCounts.middle, 3, true,
        )}

        {/* Inner ring (fast Z spin) */}
        {renderRing(
          gyroCx, gyroCy,
          innerR, innerR * 0.85,
          innerAngle,
          "#D0D0E0", 2, 0.6,
          tickCounts.inner, 2, false,
        )}

        {/* Center hub */}
        <circle
          cx={gyroCx}
          cy={gyroCy}
          r={8}
          fill="#B0B0C0"
          opacity={0.5}
        />
        <circle
          cx={gyroCx}
          cy={gyroCy}
          r={4}
          fill="#E0E0F0"
          opacity={0.4}
        />

        {/* Gimbal pivot points (where rings connect) */}
        {/* Outer ring pivots (top/bottom) */}
        <circle cx={gyroCx} cy={gyroCy - outerR * (0.5 + outerScaleY * 0.5)} r={pivotSize} fill="#808090" opacity={0.4} />
        <circle cx={gyroCx} cy={gyroCy + outerR * (0.5 + outerScaleY * 0.5)} r={pivotSize} fill="#808090" opacity={0.4} />

        {/* Middle ring pivots (left/right) */}
        <circle cx={gyroCx - middleR} cy={gyroCy} r={pivotSize} fill="#A09050" opacity={0.4} />
        <circle cx={gyroCx + middleR} cy={gyroCy} r={pivotSize} fill="#A09050" opacity={0.4} />

        {/* Energy glow at center */}
        <circle
          cx={gyroCx}
          cy={gyroCy}
          r={15 + energy * 20}
          fill="#88AADD"
          opacity={0.03 + energy * 0.06}
          filter="url(#gyro-glow)"
        />
      </svg>
    </div>
  );
};
