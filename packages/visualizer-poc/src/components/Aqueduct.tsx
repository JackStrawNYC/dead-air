/**
 * Aqueduct — Roman aqueduct arches stretching across the bottom of the screen.
 * Two tiers of arches (larger below, smaller above). Water flows along the top
 * channel with speed matching energy. Stone pillars connect the tiers.
 * Water particles stream and splash. Warm limestone palette.
 * Cycle: 50s on / off, 14s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1500; // 50s at 30fps
const DURATION = 420; // 14s visible
const LOWER_ARCH_COUNT = 8;
const UPPER_ARCH_COUNT = 12;
const WATER_PARTICLE_COUNT = 30;

const LIMESTONE = "#C8B896";
const LIMESTONE_DARK = "#A69474";
const LIMESTONE_SHADOW = "#877656";
const WATER_BLUE = "#4FC3F7";
const WATER_DEEP = "#0288D1";
const MOSS_GREEN = "#558B2F";

interface Props {
  frames: EnhancedFrameData[];
}

export const Aqueduct: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-generate water particles
  const waterParticles = React.useMemo(() => {
    const rng = seeded(62_449_081);
    return Array.from({ length: WATER_PARTICLE_COUNT }, () => ({
      phaseOffset: rng() * 1000,
      yJitter: (rng() - 0.5) * 6,
      size: 1.5 + rng() * 3,
      speed: 0.8 + rng() * 0.4,
      opacity: 0.3 + rng() * 0.5,
    }));
  }, []);

  // Pre-generate moss patches
  const mossPatches = React.useMemo(() => {
    const rng = seeded(19_773_042);
    return Array.from({ length: 12 }, () => ({
      arch: Math.floor(rng() * LOWER_ARCH_COUNT),
      offsetX: (rng() - 0.5) * 20,
      offsetY: rng() * 15,
      rx: 3 + rng() * 6,
      ry: 2 + rng() * 4,
    }));
  }, []);

  // Rolling energy (151-frame window)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.86, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.02, 0.25], [0.22, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;
  if (masterOpacity < 0.01) return null;

  // Layout
  const lowerBaseY = height * 0.98;
  const lowerTopY = height * 0.68;
  const upperBaseY = lowerTopY - 4;
  const upperTopY = height * 0.52;
  const channelY = upperTopY - 6;
  const channelH = 8;

  const archSpanW = width / LOWER_ARCH_COUNT;
  const upperArchSpanW = width / UPPER_ARCH_COUNT;
  const pillarW = 10;

  // Water flow speed driven by energy
  const flowSpeed = 1.5 + energy * 6;

  const glowSize = interpolate(energy, [0.02, 0.3], [1, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          willChange: "opacity",
        }}
      >
        <defs>
          <linearGradient id="aqueduct-water" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={WATER_DEEP} stopOpacity={0.6} />
            <stop offset="50%" stopColor={WATER_BLUE} stopOpacity={0.8} />
            <stop offset="100%" stopColor={WATER_DEEP} stopOpacity={0.6} />
          </linearGradient>
        </defs>

        {/* Lower tier arches */}
        {Array.from({ length: LOWER_ARCH_COUNT }).map((_, ai) => {
          const ax = ai * archSpanW;
          const archW = archSpanW - pillarW;
          const archR = archW / 2;
          const archCx = ax + archSpanW / 2;

          return (
            <g key={`lower-${ai}`}>
              {/* Arch opening */}
              <path
                d={`M ${ax + pillarW / 2} ${lowerBaseY} L ${ax + pillarW / 2} ${lowerTopY + archR} A ${archR} ${archR} 0 0 1 ${ax + archSpanW - pillarW / 2} ${lowerTopY + archR} L ${ax + archSpanW - pillarW / 2} ${lowerBaseY}`}
                fill="none"
                stroke={LIMESTONE}
                strokeWidth={4}
                opacity={0.6}
              />

              {/* Pillar left */}
              <rect
                x={ax}
                y={lowerTopY}
                width={pillarW}
                height={lowerBaseY - lowerTopY}
                fill={LIMESTONE_DARK}
                opacity={0.55}
              />

              {/* Keystone */}
              <rect
                x={archCx - 5}
                y={lowerTopY - 2}
                width={10}
                height={8}
                fill={LIMESTONE}
                opacity={0.5}
                rx={1}
              />
            </g>
          );
        })}

        {/* Upper tier arches */}
        {Array.from({ length: UPPER_ARCH_COUNT }).map((_, ai) => {
          const ax = ai * upperArchSpanW;
          const archW = upperArchSpanW - pillarW * 0.7;
          const archR = archW / 2;

          return (
            <g key={`upper-${ai}`}>
              <path
                d={`M ${ax + pillarW * 0.35} ${upperBaseY} L ${ax + pillarW * 0.35} ${upperTopY + archR} A ${archR} ${archR} 0 0 1 ${ax + upperArchSpanW - pillarW * 0.35} ${upperTopY + archR} L ${ax + upperArchSpanW - pillarW * 0.35} ${upperBaseY}`}
                fill="none"
                stroke={LIMESTONE}
                strokeWidth={3}
                opacity={0.5}
              />
              {/* Pillar */}
              <rect
                x={ax}
                y={upperTopY}
                width={pillarW * 0.7}
                height={upperBaseY - upperTopY}
                fill={LIMESTONE_DARK}
                opacity={0.45}
              />
            </g>
          );
        })}

        {/* Entablature bands */}
        <rect x={0} y={lowerTopY - 5} width={width} height={5} fill={LIMESTONE_SHADOW} opacity={0.4} />
        <rect x={0} y={upperTopY - 3} width={width} height={3} fill={LIMESTONE_SHADOW} opacity={0.35} />

        {/* Water channel on top */}
        <rect
          x={0}
          y={channelY}
          width={width}
          height={channelH}
          fill="url(#aqueduct-water)"
          opacity={0.5 + energy * 0.3}
        />

        {/* Water ripple highlight */}
        <line
          x1={0}
          y1={channelY + 2}
          x2={width}
          y2={channelY + 2}
          stroke={WATER_BLUE}
          strokeWidth={1}
          opacity={0.3 + energy * 0.3}
          strokeDasharray="8,12"
          strokeDashoffset={-(frame * flowSpeed) % 20}
        />

        {/* Flowing water particles */}
        {waterParticles.map((wp, wi) => {
          const rawX = (wp.phaseOffset + frame * flowSpeed * wp.speed) % (width + 40) - 20;
          const py = channelY + channelH / 2 + wp.yJitter;
          return (
            <circle
              key={`water-${wi}`}
              cx={rawX}
              cy={py}
              r={wp.size}
              fill={WATER_BLUE}
              opacity={wp.opacity * (0.3 + energy * 0.5)}
              style={{ filter: `drop-shadow(0 0 ${glowSize * 0.3}px ${WATER_BLUE})` }}
            />
          );
        })}

        {/* Moss patches on lower arches */}
        {mossPatches.map((mp, mi) => {
          const archCx = (mp.arch + 0.5) * archSpanW;
          return (
            <ellipse
              key={`moss-${mi}`}
              cx={archCx + mp.offsetX}
              cy={lowerTopY + 20 + mp.offsetY}
              rx={mp.rx}
              ry={mp.ry}
              fill={MOSS_GREEN}
              opacity={0.15}
            />
          );
        })}

        {/* Channel walls */}
        <rect x={0} y={channelY - 3} width={width} height={3} fill={LIMESTONE} opacity={0.45} rx={1} />
        <rect x={0} y={channelY + channelH} width={width} height={3} fill={LIMESTONE} opacity={0.4} rx={1} />
      </svg>
    </div>
  );
};
