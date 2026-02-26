/**
 * UFOBeam — Classic flying saucer hovering with a tractor beam below.
 * Saucer is a flattened ellipse with dome on top and rim lights.
 * Tractor beam is a triangular cone of light widening downward with scan lines.
 * Saucer tilts and drifts. Beam pulses with energy.
 * Green/blue/silver sci-fi palette.
 * Cycle: 55s (1650 frames), 16s (480 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE_TOTAL = 1650; // 55s
const VISIBLE_DURATION = 480; // 16s
const NUM_RIM_LIGHTS = 12;

interface Props {
  frames: EnhancedFrameData[];
}

export const UFOBeam: React.FC<Props> = ({ frames }) => {
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

  // Pre-compute positions per cycle
  const positions = React.useMemo(() => {
    const rng = seeded(51515151);
    return Array.from({ length: 200 }, () => ({
      xNorm: 0.25 + rng() * 0.5,
    }));
  }, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  const cycleIndex = Math.floor(frame / CYCLE_TOTAL);

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.8;

  if (opacity < 0.01) return null;

  const posData = positions[cycleIndex % positions.length];

  // UFO hovers with gentle drift
  const baseX = posData.xNorm * width;
  const baseY = height * 0.18;
  const driftX = Math.sin(frame * 0.012) * 40;
  const driftY = Math.sin(frame * 0.018 + 1.2) * 15;
  const ufoX = baseX + driftX;
  const ufoY = baseY + driftY;

  // Tilt
  const tilt = Math.sin(frame * 0.015) * 6;

  // Saucer dimensions
  const saucerRx = 80;
  const saucerRy = 18;
  const domeRx = 35;
  const domeRy = 25;

  // Beam dimensions
  const beamTopWidth = saucerRx * 0.5;
  const beamBottomWidth = saucerRx * 2.5;
  const beamHeight = height * 0.65;

  // Beam pulse
  const beamPulse = 0.3 + energy * 0.7;
  const scanLineOffset = (frame * 2) % 30;

  // Rim light chase animation
  const rimChase = frame * 0.15;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          <filter id="ufo-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="beam-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,255,180,0.5)" />
            <stop offset="40%" stopColor="rgba(0,200,255,0.2)" />
            <stop offset="100%" stopColor="rgba(0,200,255,0.02)" />
          </linearGradient>
          <linearGradient id="saucer-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B0BEC5" />
            <stop offset="50%" stopColor="#78909C" />
            <stop offset="100%" stopColor="#546E7A" />
          </linearGradient>
          <radialGradient id="dome-grad" cx="0.4" cy="0.3">
            <stop offset="0%" stopColor="rgba(100,255,218,0.7)" />
            <stop offset="100%" stopColor="rgba(0,150,136,0.4)" />
          </radialGradient>
          <clipPath id="beam-clip">
            <polygon
              points={`${ufoX - beamTopWidth},${ufoY + saucerRy} ${ufoX + beamTopWidth},${ufoY + saucerRy} ${ufoX + beamBottomWidth},${ufoY + beamHeight} ${ufoX - beamBottomWidth},${ufoY + beamHeight}`}
            />
          </clipPath>
        </defs>

        <g transform={`rotate(${tilt}, ${ufoX}, ${ufoY})`}>
          {/* Tractor beam */}
          <polygon
            points={`${ufoX - beamTopWidth},${ufoY + saucerRy} ${ufoX + beamTopWidth},${ufoY + saucerRy} ${ufoX + beamBottomWidth},${ufoY + beamHeight} ${ufoX - beamBottomWidth},${ufoY + beamHeight}`}
            fill="url(#beam-grad)"
            opacity={beamPulse}
          />

          {/* Beam scan lines */}
          <g clipPath="url(#beam-clip)" opacity={beamPulse * 0.5}>
            {Array.from({ length: 25 }).map((_, li) => {
              const lineY = ufoY + saucerRy + li * 30 + scanLineOffset;
              if (lineY > ufoY + beamHeight) return null;
              // Width expands with distance
              const t = (lineY - ufoY - saucerRy) / beamHeight;
              const lineHalfW = beamTopWidth + (beamBottomWidth - beamTopWidth) * t;
              return (
                <line
                  key={li}
                  x1={ufoX - lineHalfW}
                  y1={lineY}
                  x2={ufoX + lineHalfW}
                  y2={lineY}
                  stroke="rgba(0,255,200,0.15)"
                  strokeWidth={1}
                />
              );
            })}
          </g>

          {/* Saucer body */}
          <g filter="url(#ufo-glow)">
            {/* Bottom plate */}
            <ellipse
              cx={ufoX}
              cy={ufoY + saucerRy * 0.3}
              rx={saucerRx}
              ry={saucerRy}
              fill="url(#saucer-body)"
            />

            {/* Main body (slightly flatter top ellipse) */}
            <ellipse
              cx={ufoX}
              cy={ufoY}
              rx={saucerRx * 0.9}
              ry={saucerRy * 0.7}
              fill="#90A4AE"
            />

            {/* Dome */}
            <ellipse
              cx={ufoX}
              cy={ufoY - saucerRy * 0.5}
              rx={domeRx}
              ry={domeRy}
              fill="url(#dome-grad)"
            />

            {/* Dome highlight */}
            <ellipse
              cx={ufoX - 8}
              cy={ufoY - saucerRy * 0.5 - 8}
              rx={domeRx * 0.35}
              ry={domeRy * 0.3}
              fill="rgba(255,255,255,0.3)"
            />
          </g>

          {/* Rim lights */}
          {Array.from({ length: NUM_RIM_LIGHTS }).map((_, li) => {
            const angle = (li / NUM_RIM_LIGHTS) * Math.PI * 2;
            const lx = ufoX + Math.cos(angle) * saucerRx * 0.85;
            const ly = ufoY + saucerRy * 0.3 + Math.sin(angle) * saucerRy * 0.6;

            // Chase pattern: lights pulse in sequence
            const chasePhase = Math.sin(rimChase + li * (Math.PI * 2 / NUM_RIM_LIGHTS));
            const lightBrightness = 0.3 + chasePhase * 0.7;

            const lightHue = li % 2 === 0 ? 160 : 200; // alternating green / blue
            const lightColor = `hsla(${lightHue}, 100%, 70%, ${lightBrightness})`;

            return (
              <circle
                key={li}
                cx={lx}
                cy={ly}
                r={3 + energy * 2}
                fill={lightColor}
              />
            );
          })}

          {/* Center beam emitter glow */}
          <circle
            cx={ufoX}
            cy={ufoY + saucerRy}
            r={8 + energy * 6}
            fill="rgba(0,255,180,0.4)"
            opacity={beamPulse}
          />
        </g>
      </svg>
    </div>
  );
};
