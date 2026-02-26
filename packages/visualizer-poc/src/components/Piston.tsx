/**
 * Piston — Steam engine piston pumping up and down.
 * Vertical reciprocating motion: cylinder housing with a piston rod moving inside.
 * Flywheel connects via a connecting rod. Speed tied to beat tempo / energy.
 * Industrial copper/bronze palette with neon accent highlights.
 * Positioned lower-left. Cycle: 50s on, 50s off (100s total = 3000 frames).
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

const CYCLE = 3000; // 100s at 30fps
const DURATION = 1500; // 50s visible

interface Props {
  frames: EnhancedFrameData[];
}

export const Piston: React.FC<Props> = ({ frames }) => {
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

  // Pre-compute steam puff data
  const steamPuffs = React.useMemo(() => {
    const rng = seeded(71423);
    return Array.from({ length: 30 }, () => ({
      dx: (rng() - 0.5) * 40,
      dy: -rng() * 30,
      driftX: (rng() - 0.5) * 60,
      driftY: -20 - rng() * 50,
      maxR: 4 + rng() * 10,
      birthOffset: Math.floor(rng() * 60),
    }));
  }, []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Piston geometry
  const cx = width * 0.18;
  const cy = height * 0.7;
  const cylinderW = 50;
  const cylinderH = 140;
  const rodW = 14;
  const flywheelR = 55;
  const flywheelCx = cx + 100;
  const flywheelCy = cy - cylinderH * 0.3;

  // Piston reciprocation: speed driven by energy
  const pistonSpeed = 2 + energy * 8;
  const pistonPhase = (frame * pistonSpeed * 0.04) % (Math.PI * 2);
  const stroke = 50 + energy * 20; // piston travel distance
  const pistonY = Math.sin(pistonPhase) * stroke * 0.5;

  // Flywheel rotation
  const flywheelAngle = pistonPhase;
  const crankX = flywheelCx + Math.cos(flywheelAngle) * flywheelR * 0.6;
  const crankY = flywheelCy + Math.sin(flywheelAngle) * flywheelR * 0.6;

  // Piston head position
  const pistonTopY = cy - cylinderH * 0.5 + pistonY;

  // Steam bursts near the exhaust stroke (when piston moves up)
  const exhaustIntensity = Math.max(0, -Math.sin(pistonPhase)) * energy;

  const glowSize = interpolate(energy, [0.03, 0.3], [3, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity, willChange: "opacity" }}>
        <defs>
          <filter id="piston-glow">
            <feGaussianBlur stdDeviation={glowSize} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="piston-copper" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D4945A" />
            <stop offset="50%" stopColor="#B87333" />
            <stop offset="100%" stopColor="#8B5E3C" />
          </linearGradient>
          <linearGradient id="piston-steel" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#A0A0A0" />
            <stop offset="100%" stopColor="#606060" />
          </linearGradient>
        </defs>

        {/* Cylinder housing */}
        <rect
          x={cx - cylinderW / 2}
          y={cy - cylinderH}
          width={cylinderW}
          height={cylinderH}
          rx={4}
          fill="none"
          stroke="url(#piston-copper)"
          strokeWidth={3}
          opacity={0.7}
        />

        {/* Cylinder interior dark fill */}
        <rect
          x={cx - cylinderW / 2 + 3}
          y={cy - cylinderH + 3}
          width={cylinderW - 6}
          height={cylinderH - 6}
          rx={2}
          fill="#1A1A1A"
          opacity={0.4}
        />

        {/* Piston head */}
        <rect
          x={cx - cylinderW / 2 + 4}
          y={pistonTopY - 10}
          width={cylinderW - 8}
          height={20}
          rx={3}
          fill="url(#piston-steel)"
          opacity={0.8}
          filter="url(#piston-glow)"
        />

        {/* Piston rod going down */}
        <line
          x1={cx}
          y1={pistonTopY + 10}
          x2={cx}
          y2={cy + 20}
          stroke="#909090"
          strokeWidth={rodW * 0.5}
          opacity={0.6}
          strokeLinecap="round"
        />

        {/* Connecting rod to flywheel */}
        <line
          x1={cx}
          y1={pistonTopY}
          x2={crankX}
          y2={crankY}
          stroke="#B87333"
          strokeWidth={4}
          opacity={0.7}
          strokeLinecap="round"
        />

        {/* Flywheel rim */}
        <circle
          cx={flywheelCx}
          cy={flywheelCy}
          r={flywheelR}
          fill="none"
          stroke="#B87333"
          strokeWidth={5}
          opacity={0.6}
        />

        {/* Flywheel spokes */}
        {[0, 1, 2, 3, 4, 5].map((si) => {
          const sa = flywheelAngle + (si / 6) * Math.PI * 2;
          return (
            <line
              key={`spoke-${si}`}
              x1={flywheelCx + Math.cos(sa) * 8}
              y1={flywheelCy + Math.sin(sa) * 8}
              x2={flywheelCx + Math.cos(sa) * (flywheelR - 4)}
              y2={flywheelCy + Math.sin(sa) * (flywheelR - 4)}
              stroke="#B87333"
              strokeWidth={2}
              opacity={0.5}
            />
          );
        })}

        {/* Flywheel hub */}
        <circle
          cx={flywheelCx}
          cy={flywheelCy}
          r={10}
          fill="#B87333"
          opacity={0.6}
        />

        {/* Crank pin on flywheel */}
        <circle
          cx={crankX}
          cy={crankY}
          r={5}
          fill="#D4945A"
          opacity={0.8}
        />

        {/* Steam exhaust puffs */}
        {steamPuffs.map((puff, pi) => {
          const puffCycle = 60;
          const age = (cycleFrame + puff.birthOffset) % puffCycle;
          const life = age / puffCycle;
          const puffOpacity = interpolate(life, [0, 0.15, 0.6, 1], [0, 0.4, 0.2, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * exhaustIntensity;
          if (puffOpacity < 0.02) return null;
          const r = puff.maxR * interpolate(life, [0, 1], [0.3, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const px = cx + puff.dx + puff.driftX * life;
          const py = (cy - cylinderH - 10) + puff.dy + puff.driftY * life;
          return (
            <circle key={pi} cx={px} cy={py} r={r} fill="#C0C0C0" opacity={puffOpacity} />
          );
        })}

        {/* Neon accent on cylinder bolts */}
        {[-1, 1].map((side) => (
          <React.Fragment key={`bolts-${side}`}>
            <circle
              cx={cx + side * (cylinderW / 2)}
              cy={cy - cylinderH + 15}
              r={3}
              fill="#FF6600"
              opacity={0.4 + energy * 0.3}
            />
            <circle
              cx={cx + side * (cylinderW / 2)}
              cy={cy - 15}
              r={3}
              fill="#FF6600"
              opacity={0.4 + energy * 0.3}
            />
          </React.Fragment>
        ))}
      </svg>
    </div>
  );
};
