/**
 * VolcanoFlow — Triangular volcano silhouette with lava flowing from crater.
 * Lava streams are orange/red bezier curves flowing down the slopes.
 * Smoke/ash particles rise from crater. Lava glow illuminates the mountain.
 * Energy drives eruption intensity: quiet = smoldering smoke, loud = full lava flow.
 * Cycle: 55s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1650; // 55s at 30fps
const DURATION = 540; // 18s visible

interface LavaStream {
  side: "left" | "right";
  xOffset: number;     // offset from slope center
  controlX: number;    // bezier control offset
  controlY: number;
  speed: number;
  width: number;
  hue: number;         // 0-30 range for orange/red
}

interface SmokeParticle {
  xOffset: number;
  riseSpeed: number;
  driftFreq: number;
  driftAmp: number;
  size: number;
  phase: number;
  opacity: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const VolcanoFlow: React.FC<Props> = ({ frames }) => {
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

  const lavaStreams = React.useMemo(() => {
    const rng = seeded(5678);
    const result: LavaStream[] = [];
    for (let i = 0; i < 6; i++) {
      result.push({
        side: i < 3 ? "left" : "right",
        xOffset: (rng() - 0.5) * 30,
        controlX: (rng() - 0.5) * 60,
        controlY: 0.3 + rng() * 0.4,
        speed: 0.5 + rng() * 1.5,
        width: 3 + rng() * 5,
        hue: rng() * 30,
      });
    }
    return result;
  }, []);

  const smokeParticles = React.useMemo(() => {
    const rng = seeded(9012);
    const result: SmokeParticle[] = [];
    for (let i = 0; i < 25; i++) {
      result.push({
        xOffset: (rng() - 0.5) * 60,
        riseSpeed: 0.8 + rng() * 2.0,
        driftFreq: 0.005 + rng() * 0.02,
        driftAmp: 10 + rng() * 30,
        size: 4 + rng() * 12,
        phase: rng() * 200,
        opacity: 0.15 + rng() * 0.3,
      });
    }
    return result;
  }, []);

  const ashParticles = React.useMemo(() => {
    const rng = seeded(3333);
    return Array.from({ length: 15 }, () => ({
      xOffset: (rng() - 0.5) * 120,
      riseSpeed: 0.3 + rng() * 1.0,
      driftFreq: 0.008 + rng() * 0.015,
      driftAmp: 15 + rng() * 40,
      size: 1 + rng() * 3,
      phase: rng() * 300,
    }));
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
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.25, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Eruption intensity
  const intensity = interpolate(energy, [0.03, 0.15, 0.35], [0.1, 0.5, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Volcano geometry
  const peakX = width * 0.6;
  const peakY = height * 0.3;
  const baseLeft = width * 0.3;
  const baseRight = width * 0.9;
  const baseY = height * 0.95;
  const craterLeft = peakX - 25;
  const craterRight = peakX + 25;
  const craterY = peakY + 8;

  // Mountain silhouette path
  const mountainPath = `M${baseLeft},${baseY} L${craterLeft},${craterY} L${craterRight},${craterY} L${baseRight},${baseY} Z`;

  const glowRadius = interpolate(energy, [0.02, 0.3], [20, 60], {
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
          <filter id="volcano-glow">
            <feGaussianBlur stdDeviation={glowRadius} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="lava-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="smoke-blur">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <radialGradient id="crater-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF4400" stopOpacity={0.4 * intensity} />
            <stop offset="50%" stopColor="#FF2200" stopOpacity={0.2 * intensity} />
            <stop offset="100%" stopColor="#880000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mountain-grad" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#3A2A1A" stopOpacity="0.8" />
            <stop offset="40%" stopColor="#2A1A0A" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#1A0D00" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {/* Lava glow behind mountain */}
        <ellipse
          cx={peakX}
          cy={craterY}
          rx={40 + intensity * 40}
          ry={30 + intensity * 30}
          fill="url(#crater-glow)"
          filter="url(#volcano-glow)"
        />

        {/* Mountain silhouette */}
        <path
          d={mountainPath}
          fill="url(#mountain-grad)"
        />

        {/* Lava streams */}
        {lavaStreams.map((stream, li) => {
          const streamIntensity = intensity * (0.5 + Math.sin(frame * 0.03 + li * 1.5) * 0.3);
          if (streamIntensity < 0.15) return null;

          const startX = peakX + stream.xOffset * (stream.side === "left" ? -1 : 1);
          const endXBase = stream.side === "left"
            ? baseLeft + (peakX - baseLeft) * 0.4
            : peakX + (baseRight - peakX) * 0.4;
          const endX = endXBase + stream.xOffset;
          const endY = peakY + (baseY - peakY) * (0.3 + streamIntensity * 0.5);

          const ctrlX = startX + stream.controlX * (stream.side === "left" ? -1 : 1);
          const ctrlY = peakY + (endY - peakY) * stream.controlY;

          const flowOffset = (frame * stream.speed) % 30;
          const dashLen = 8 + streamIntensity * 15;
          const hue = stream.hue + Math.sin(frame * 0.05) * 10;
          const lavaColor = `hsl(${hue}, 100%, ${45 + streamIntensity * 15}%)`;

          return (
            <path
              key={`lava-${li}`}
              d={`M${startX},${craterY} Q${ctrlX},${ctrlY} ${endX},${endY}`}
              fill="none"
              stroke={lavaColor}
              strokeWidth={stream.width * streamIntensity}
              strokeLinecap="round"
              strokeDasharray={`${dashLen} ${dashLen * 0.5}`}
              strokeDashoffset={-flowOffset}
              opacity={0.6 + streamIntensity * 0.3}
              filter="url(#lava-glow)"
            />
          );
        })}

        {/* Crater lava pool */}
        <ellipse
          cx={peakX}
          cy={craterY}
          rx={20 + intensity * 8}
          ry={6 + intensity * 3}
          fill={`hsl(${15 + intensity * 15}, 100%, ${40 + intensity * 20}%)`}
          opacity={0.5 + intensity * 0.3}
          filter="url(#lava-glow)"
        />

        {/* Smoke particles (always visible, more during quiet) */}
        {smokeParticles.map((sp, si) => {
          const smokeAmount = 1.0 - intensity * 0.4; // more smoke when less lava
          if (si / smokeParticles.length > smokeAmount + 0.3) return null;

          const t = ((cycleFrame + sp.phase) % 150) / 150;
          const riseY = craterY - t * height * 0.4;
          const driftX = peakX + sp.xOffset + Math.sin((cycleFrame + sp.phase) * sp.driftFreq) * sp.driftAmp;
          const expandSize = sp.size * (1 + t * 2.5);
          const smokeOp = (1 - t) * sp.opacity * smokeAmount;

          if (smokeOp < 0.02) return null;

          return (
            <circle
              key={`smoke-${si}`}
              cx={driftX}
              cy={riseY}
              r={expandSize}
              fill="#555"
              opacity={smokeOp}
              filter="url(#smoke-blur)"
            />
          );
        })}

        {/* Ash particles (visible during eruption) */}
        {intensity > 0.3 && ashParticles.map((ash, ai) => {
          const t = ((cycleFrame + ash.phase) % 180) / 180;
          const ay = craterY - t * height * 0.5;
          const ax = peakX + ash.xOffset + Math.sin((cycleFrame + ash.phase) * ash.driftFreq) * ash.driftAmp;
          const ashOp = (1 - t) * 0.4 * intensity;
          if (ashOp < 0.02) return null;

          return (
            <circle
              key={`ash-${ai}`}
              cx={ax}
              cy={ay}
              r={ash.size}
              fill="#AA4400"
              opacity={ashOp}
            />
          );
        })}
      </svg>
    </div>
  );
};
