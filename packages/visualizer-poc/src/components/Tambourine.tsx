/**
 * Tambourine — Circular tambourine frame with 8-10 jingle pairs around the rim.
 * Frame shakes/vibrates on beats (small rapid translate offsets).
 * Jingles swing outward on hits. Drum head has slight deformation on beats.
 * Warm wood/brass colors. Beat detection drives shake intensity.
 * Cycle: 45s, 12s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1350; // 45s at 30fps
const DURATION = 360; // 12s visible
const NUM_JINGLES = 9;

interface JinglePair {
  angle: number;     // position around rim (radians)
  size: number;      // jingle disc radius
  swingPhase: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Tambourine: React.FC<Props> = ({ frames }) => {
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

  const jingles = React.useMemo(() => {
    const rng = seeded(7890);
    const result: JinglePair[] = [];
    for (let i = 0; i < NUM_JINGLES; i++) {
      const angle = (i / NUM_JINGLES) * Math.PI * 2 + (rng() - 0.5) * 0.15;
      result.push({
        angle,
        size: 5 + rng() * 3,
        swingPhase: rng() * Math.PI * 2,
      });
    }
    return result;
  }, []);

  const shakeSeeds = React.useMemo(() => {
    const rng = seeded(1234);
    return Array.from({ length: 10 }, () => ({
      freqX: 0.3 + rng() * 0.8,
      freqY: 0.4 + rng() * 0.7,
      ampX: rng(),
      ampY: rng(),
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
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const currentFrame = frames[idx];
  const isBeat = currentFrame.beat;
  const onset = currentFrame.onset;

  // Tambourine center position
  const tamCx = width * 0.3;
  const tamCy = height * 0.45;
  const frameRadius = 80;
  const frameWidth = 12;

  // Beat-driven shake
  const shakeIntensity = isBeat ? 1.0 : onset * 0.5;
  const seedIdx = frame % shakeSeeds.length;
  const shakeSeed = shakeSeeds[seedIdx];
  const shakeX = Math.sin(frame * shakeSeed.freqX) * shakeSeed.ampX * shakeIntensity * 6;
  const shakeY = Math.cos(frame * shakeSeed.freqY) * shakeSeed.ampY * shakeIntensity * 5;

  // Drum head deformation on beats
  const headDeform = isBeat ? 0.03 + onset * 0.02 : 0;
  const headScaleY = 1 - headDeform;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity, willChange: "opacity" }}
      >
        <defs>
          <filter id="tam-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="tam-head-grad" cx="45%" cy="42%" r="50%">
            <stop offset="0%" stopColor="#E8D8C0" stopOpacity="0.3" />
            <stop offset="70%" stopColor="#C8B8A0" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#A89878" stopOpacity="0.2" />
          </radialGradient>
          <linearGradient id="tam-frame-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8B6914" stopOpacity="0.7" />
            <stop offset="50%" stopColor="#A0793C" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#6B4E0A" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        <g transform={`translate(${shakeX}, ${shakeY})`}>
          {/* Drum head (slightly deformable) */}
          <ellipse
            cx={tamCx}
            cy={tamCy}
            rx={frameRadius - frameWidth / 2}
            ry={(frameRadius - frameWidth / 2) * headScaleY}
            fill="url(#tam-head-grad)"
          />

          {/* Beat impact ripple on drum head */}
          {isBeat && (
            <circle
              cx={tamCx}
              cy={tamCy}
              r={frameRadius * 0.4 + onset * 20}
              fill="none"
              stroke="#D4C4A4"
              strokeWidth={1}
              opacity={0.2 + onset * 0.2}
            />
          )}

          {/* Wooden frame ring */}
          <circle
            cx={tamCx}
            cy={tamCy}
            r={frameRadius}
            fill="none"
            stroke="url(#tam-frame-grad)"
            strokeWidth={frameWidth}
          />

          {/* Frame inner highlight */}
          <circle
            cx={tamCx}
            cy={tamCy}
            r={frameRadius - frameWidth / 2 + 1}
            fill="none"
            stroke="#C4A860"
            strokeWidth={0.8}
            opacity={0.2}
          />
          {/* Frame outer highlight */}
          <circle
            cx={tamCx}
            cy={tamCy}
            r={frameRadius + frameWidth / 2 - 1}
            fill="none"
            stroke="#C4A860"
            strokeWidth={0.8}
            opacity={0.15}
          />

          {/* Jingle pairs */}
          {jingles.map((j, ji) => {
            // Jingles sit in slots on the frame
            const slotCx = tamCx + Math.cos(j.angle) * frameRadius;
            const slotCy = tamCy + Math.sin(j.angle) * frameRadius;

            // Swing outward on beats
            const swingAmount = isBeat
              ? Math.sin(frame * 1.5 + j.swingPhase) * 6 * (0.5 + onset)
              : Math.sin(frame * 0.3 + j.swingPhase) * 1.5 * energy;

            const outwardX = Math.cos(j.angle) * swingAmount;
            const outwardY = Math.sin(j.angle) * swingAmount;

            // Each jingle pair is two small discs side by side
            const perpAngle = j.angle + Math.PI / 2;
            const spacing = j.size * 0.8;
            const disc1x = slotCx + outwardX + Math.cos(perpAngle) * spacing;
            const disc1y = slotCy + outwardY + Math.sin(perpAngle) * spacing;
            const disc2x = slotCx + outwardX - Math.cos(perpAngle) * spacing;
            const disc2y = slotCy + outwardY - Math.sin(perpAngle) * spacing;

            const jingleBrightness = isBeat ? 0.7 + onset * 0.3 : 0.4 + energy * 0.2;

            return (
              <g key={`jingle-${ji}`}>
                {/* Jingle disc 1 */}
                <circle
                  cx={disc1x}
                  cy={disc1y}
                  r={j.size}
                  fill={`hsl(42, 70%, ${45 + jingleBrightness * 25}%)`}
                  opacity={jingleBrightness}
                  filter={isBeat ? "url(#tam-glow)" : undefined}
                />
                {/* Center dimple */}
                <circle
                  cx={disc1x}
                  cy={disc1y}
                  r={j.size * 0.3}
                  fill="none"
                  stroke="#FFD700"
                  strokeWidth={0.5}
                  opacity={jingleBrightness * 0.5}
                />
                {/* Jingle disc 2 */}
                <circle
                  cx={disc2x}
                  cy={disc2y}
                  r={j.size}
                  fill={`hsl(38, 65%, ${40 + jingleBrightness * 25}%)`}
                  opacity={jingleBrightness * 0.9}
                  filter={isBeat ? "url(#tam-glow)" : undefined}
                />
                <circle
                  cx={disc2x}
                  cy={disc2y}
                  r={j.size * 0.3}
                  fill="none"
                  stroke="#FFD700"
                  strokeWidth={0.5}
                  opacity={jingleBrightness * 0.4}
                />
              </g>
            );
          })}

          {/* Cross-bar detail on frame (holding rivets) */}
          {jingles.map((j, ji) => {
            const rx = tamCx + Math.cos(j.angle) * (frameRadius - frameWidth * 0.4);
            const ry = tamCy + Math.sin(j.angle) * (frameRadius - frameWidth * 0.4);
            const rx2 = tamCx + Math.cos(j.angle) * (frameRadius + frameWidth * 0.4);
            const ry2 = tamCy + Math.sin(j.angle) * (frameRadius + frameWidth * 0.4);
            return (
              <line
                key={`rivet-${ji}`}
                x1={rx}
                y1={ry}
                x2={rx2}
                y2={ry2}
                stroke="#8B6914"
                strokeWidth={2}
                opacity={0.3}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
