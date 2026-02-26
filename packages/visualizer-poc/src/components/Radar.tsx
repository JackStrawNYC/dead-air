/**
 * Radar — Sweeping radar screen. Dark circular screen with concentric range
 * rings. Bright sweep line rotates 360deg every 3 seconds. "Blips" appear at
 * random positions when energy peaks detected (bright dots that fade over 60
 * frames). Grid overlay with crosshair. Green phosphor color (#00FF41). Range
 * ring count = 4. Positioned center. Appears every 50s for 16s.
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

const PHOSPHOR = "#00FF41";
const PHOSPHOR_DIM = "rgba(0, 255, 65, 0.15)";
const SCREEN_BG = "rgba(0, 15, 5, 0.85)";

const CYCLE_FRAMES = 1500; // 50 seconds at 30fps
const VISIBLE_FRAMES = 480; // 16 seconds at 30fps
const SWEEP_PERIOD = 90; // 3 seconds per full rotation
const BLIP_LIFETIME = 60; // frames a blip stays visible
const NUM_RANGE_RINGS = 4;
const MAX_BLIPS = 30;

interface Blip {
  x: number; // -1 to 1 relative to center
  y: number;
  birthFrame: number;
  intensity: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Radar: React.FC<Props> = ({ frames }) => {
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

  // Build blip list deterministically based on energy peaks in recent history
  // ALL useMemo BEFORE any return null
  const blips = React.useMemo(() => {
    const result: Blip[] = [];
    // Scan frames for energy peaks
    for (let f = Math.max(0, idx - BLIP_LIFETIME); f <= idx; f++) {
      if (f >= frames.length) break;
      const fd = frames[f];
      // Detect onset peaks as blip triggers
      if (fd.onset > 0.5 && fd.rms > 0.15) {
        const rng = seeded(f * 31 + 19770508);
        // Random position within the radar circle
        const angle = rng() * Math.PI * 2;
        const dist = 0.2 + rng() * 0.75;
        result.push({
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          birthFrame: f,
          intensity: fd.rms,
        });
      }
    }
    // Keep only the most recent blips
    return result.slice(-MAX_BLIPS);
  }, [idx, frames]);

  // Periodic visibility
  const cycleFrame = frame % CYCLE_FRAMES;
  const fadeIn = interpolate(cycleFrame, [0, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cycleFrame, [VISIBLE_FRAMES - 45, VISIBLE_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const visibilityOpacity = cycleFrame < VISIBLE_FRAMES ? fadeIn * fadeOut : 0;

  if (visibilityOpacity < 0.01) return null;

  // Radar dimensions
  const radarRadius = Math.min(width, height) * 0.18;
  const cx = width / 2;
  const cy = height / 2;

  // Sweep angle (0-360, full rotation every SWEEP_PERIOD frames)
  const sweepAngle = ((frame % SWEEP_PERIOD) / SWEEP_PERIOD) * 360;
  const sweepRad = (sweepAngle * Math.PI) / 180;
  const sweepEndX = cx + Math.cos(sweepRad - Math.PI / 2) * radarRadius;
  const sweepEndY = cy + Math.sin(sweepRad - Math.PI / 2) * radarRadius;

  // Sweep trail (fading arc behind the sweep line)
  const trailArcAngle = 45; // degrees of trail
  const trailStartAngle = sweepAngle - trailArcAngle;

  // Build trail arc path
  const trailStart = ((trailStartAngle - 90) * Math.PI) / 180;
  const trailEnd = ((sweepAngle - 90) * Math.PI) / 180;
  const tStartX = cx + Math.cos(trailStart) * radarRadius;
  const tStartY = cy + Math.sin(trailStart) * radarRadius;
  const tEndX = cx + Math.cos(trailEnd) * radarRadius;
  const tEndY = cy + Math.sin(trailEnd) * radarRadius;
  const largeArc = trailArcAngle > 180 ? 1 : 0;
  const trailPath = `M ${cx} ${cy} L ${tStartX} ${tStartY} A ${radarRadius} ${radarRadius} 0 ${largeArc} 1 ${tEndX} ${tEndY} Z`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: visibilityOpacity * 0.6,
          filter: `drop-shadow(0 0 10px ${PHOSPHOR}) drop-shadow(0 0 20px rgba(0, 255, 65, 0.3))`,
        }}
      >
        {/* Radar screen background */}
        <circle cx={cx} cy={cy} r={radarRadius + 4} fill={SCREEN_BG} />
        <circle cx={cx} cy={cy} r={radarRadius + 4} fill="none" stroke={PHOSPHOR} strokeWidth={2} opacity={0.4} />

        {/* Range rings */}
        {Array.from({ length: NUM_RANGE_RINGS }, (_, ri) => {
          const ringR = (radarRadius / (NUM_RANGE_RINGS + 1)) * (ri + 1);
          return (
            <circle
              key={`ring-${ri}`}
              cx={cx}
              cy={cy}
              r={ringR}
              fill="none"
              stroke={PHOSPHOR}
              strokeWidth={0.5}
              opacity={0.2}
            />
          );
        })}

        {/* Crosshair */}
        <line x1={cx - radarRadius} y1={cy} x2={cx + radarRadius} y2={cy} stroke={PHOSPHOR} strokeWidth={0.5} opacity={0.15} />
        <line x1={cx} y1={cy - radarRadius} x2={cx} y2={cy + radarRadius} stroke={PHOSPHOR} strokeWidth={0.5} opacity={0.15} />

        {/* Diagonal crosshair */}
        <line
          x1={cx - radarRadius * 0.707}
          y1={cy - radarRadius * 0.707}
          x2={cx + radarRadius * 0.707}
          y2={cy + radarRadius * 0.707}
          stroke={PHOSPHOR}
          strokeWidth={0.3}
          opacity={0.08}
        />
        <line
          x1={cx + radarRadius * 0.707}
          y1={cy - radarRadius * 0.707}
          x2={cx - radarRadius * 0.707}
          y2={cy + radarRadius * 0.707}
          stroke={PHOSPHOR}
          strokeWidth={0.3}
          opacity={0.08}
        />

        {/* Sweep trail (glowing wedge) */}
        <path
          d={trailPath}
          fill="url(#sweepGradient)"
          opacity={0.3}
        />

        {/* SVG gradient for sweep trail */}
        <defs>
          <radialGradient id="sweepGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={PHOSPHOR} stopOpacity={0} />
            <stop offset="60%" stopColor={PHOSPHOR} stopOpacity={0.15} />
            <stop offset="100%" stopColor={PHOSPHOR} stopOpacity={0.3} />
          </radialGradient>
        </defs>

        {/* Sweep line */}
        <line
          x1={cx}
          y1={cy}
          x2={sweepEndX}
          y2={sweepEndY}
          stroke={PHOSPHOR}
          strokeWidth={2}
          opacity={0.9}
        />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={3} fill={PHOSPHOR} opacity={0.8} />

        {/* Blips */}
        {blips.map((blip, bi) => {
          const age = idx - blip.birthFrame;
          if (age < 0 || age > BLIP_LIFETIME) return null;
          const fadeProgress = age / BLIP_LIFETIME;
          const blipOpacity = interpolate(fadeProgress, [0, 0.1, 0.5, 1], [0, 1, 0.6, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const bx = cx + blip.x * radarRadius;
          const by = cy + blip.y * radarRadius;
          const blipSize = 2 + blip.intensity * 4;

          return (
            <g key={`blip-${bi}`}>
              {/* Glow */}
              <circle
                cx={bx}
                cy={by}
                r={blipSize * 3}
                fill={PHOSPHOR}
                opacity={blipOpacity * 0.15}
              />
              {/* Core */}
              <circle
                cx={bx}
                cy={by}
                r={blipSize}
                fill={PHOSPHOR}
                opacity={blipOpacity * 0.9}
              />
            </g>
          );
        })}

        {/* Outer bezel markings (degree marks) */}
        {Array.from({ length: 36 }, (_, di) => {
          const degAngle = ((di * 10 - 90) * Math.PI) / 180;
          const inner = radarRadius + 2;
          const outer = radarRadius + (di % 9 === 0 ? 10 : 5);
          return (
            <line
              key={`deg-${di}`}
              x1={cx + Math.cos(degAngle) * inner}
              y1={cy + Math.sin(degAngle) * inner}
              x2={cx + Math.cos(degAngle) * outer}
              y2={cy + Math.sin(degAngle) * outer}
              stroke={PHOSPHOR}
              strokeWidth={di % 9 === 0 ? 1 : 0.5}
              opacity={di % 9 === 0 ? 0.5 : 0.2}
            />
          );
        })}
      </svg>
    </div>
  );
};
