/**
 * JerrySpotlight — Spotlight silhouette during guitar solos.
 * Layer 6, mid energy. Standing figure silhouette with guitar shape,
 * circular spotlight cone behind the figure with warm golden gradient glow.
 * Figure pulses/sways slightly to beat. Guitar neck angle follows spectral
 * centroid. Visibility gated on mid-high energy (centroid > 0.3 AND rms > 0.1).
 * Warm golden spotlight color. Positioned left-center of screen (x: 30-40%).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

const FADE_IN_FRAMES = 60;
const FADE_OUT_FRAMES = 45;

interface Props {
  frames: EnhancedFrameData[];
}

export const JerrySpotlight: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const fd = frames[idx];

  // Rolling energy over +/-75 frames for smoothed values
  let rmsSum = 0;
  let centroidSum = 0;
  let eCount = 0;
  for (
    let i = Math.max(0, idx - 75);
    i <= Math.min(frames.length - 1, idx + 75);
    i++
  ) {
    rmsSum += frames[i].rms;
    centroidSum += frames[i].centroid;
    eCount++;
  }
  const smoothRms = eCount > 0 ? rmsSum / eCount : 0;
  const smoothCentroid = eCount > 0 ? centroidSum / eCount : 0;

  // Seed for deterministic sway offset
  const rng = React.useMemo(
    () => seeded((ctx?.showSeed ?? 19770508) + 4201),
    [ctx?.showSeed],
  );
  const swayPhase = React.useMemo(() => rng() * Math.PI * 2, [rng]);
  const pulsePhase = React.useMemo(() => rng() * Math.PI * 2, [rng]);

  // Energy gate: centroid > 0.3 AND rms > 0.1
  const gateActive = smoothCentroid > 0.3 && smoothRms > 0.1;

  // Smooth gate transition — track how long gate has been active/inactive
  // Use interpolation on the raw values for smooth edges
  const centroidGate = interpolate(smoothCentroid, [0.25, 0.35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rmsGate = interpolate(smoothRms, [0.08, 0.15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const gateOpacity = centroidGate * rmsGate;

  if (gateOpacity < 0.01) return null;

  // Master fade in at start of composition
  const masterFade = interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const masterOpacity = gateOpacity * masterFade * 0.7;

  if (masterOpacity < 0.01) return null;

  // Figure position: left-center (30-40% of width)
  const figureX = width * 0.35;
  const figureBaseY = height * 0.55;

  // Sway: subtle horizontal oscillation driven by beat energy
  const swayAmount = interpolate(smoothRms, [0.1, 0.4], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sway = Math.sin(frame * 0.04 + swayPhase) * swayAmount;

  // Pulse: slight vertical scale driven by beat
  const beatPulse = fd.beat ? 1.03 : 1.0;
  const pulseBreath =
    1.0 + Math.sin(frame * 0.06 + pulsePhase) * 0.01 * beatPulse;

  // Guitar neck angle follows spectral centroid: low = angled down, high = angled up
  const neckAngle = interpolate(fd.centroid, [0.1, 0.8], [-15, 25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Spotlight cone radius driven by energy
  const spotlightRadius = interpolate(smoothRms, [0.1, 0.4], [80, 160], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Warm golden hue: 38-48 (gold range)
  const hue = interpolate(smoothCentroid, [0.3, 0.7], [42, 50], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Flicker for organic feel
  const flicker =
    0.85 +
    Math.sin(frame * 0.15 + 1.3) * 0.08 +
    Math.sin(frame * 0.27 + 3.1) * 0.04;

  // SVG figure dimensions
  const headR = 14;
  const shoulderW = 44;
  const torsoH = 60;
  const legH = 50;

  // Unique gradient IDs
  const spotGradId = `jerry-spot-${idx}`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        width={width}
        height={height}
        style={{ opacity: masterOpacity * flicker, mixBlendMode: "screen" }}
      >
        <defs>
          <radialGradient id={spotGradId} cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor={`hsla(${hue}, 85%, 75%, 0.5)`}
            />
            <stop
              offset="40%"
              stopColor={`hsla(${hue}, 80%, 60%, 0.2)`}
            />
            <stop
              offset="100%"
              stopColor={`hsla(${hue}, 70%, 50%, 0)`}
            />
          </radialGradient>
        </defs>

        {/* Spotlight cone / glow behind figure */}
        <ellipse
          cx={figureX + sway}
          cy={figureBaseY - 10}
          rx={spotlightRadius * 1.2}
          ry={spotlightRadius * 1.8}
          fill={`url(#${spotGradId})`}
          style={{ filter: `blur(20px)` }}
        />

        {/* Ground pool of light */}
        <ellipse
          cx={figureX + sway}
          cy={figureBaseY + torsoH + legH - 10}
          rx={spotlightRadius * 0.9}
          ry={spotlightRadius * 0.25}
          fill={`hsla(${hue}, 80%, 70%, 0.15)`}
          style={{ filter: `blur(12px)` }}
        />

        {/* Figure silhouette group */}
        <g
          transform={`translate(${figureX + sway}, ${figureBaseY}) scale(${pulseBreath})`}
        >
          {/* Head */}
          <circle
            cx={0}
            cy={-torsoH / 2 - headR - 4}
            r={headR}
            fill={`hsla(${hue}, 60%, 15%, 0.9)`}
            stroke={`hsla(${hue}, 80%, 55%, 0.3)`}
            strokeWidth={0.8}
          />

          {/* Hair suggestion — slight bump on top */}
          <ellipse
            cx={0}
            cy={-torsoH / 2 - headR - 14}
            rx={headR * 0.9}
            ry={6}
            fill={`hsla(${hue}, 60%, 12%, 0.8)`}
          />

          {/* Neck */}
          <rect
            x={-4}
            y={-torsoH / 2 - 4}
            width={8}
            height={8}
            fill={`hsla(${hue}, 60%, 15%, 0.9)`}
          />

          {/* Shoulders and torso */}
          <path
            d={`M ${-shoulderW / 2} ${-torsoH / 2 + 4}
                Q ${-shoulderW / 2 - 2} ${-torsoH / 2} ${-shoulderW / 2 + 4} ${-torsoH / 2}
                L ${shoulderW / 2 - 4} ${-torsoH / 2}
                Q ${shoulderW / 2 + 2} ${-torsoH / 2} ${shoulderW / 2} ${-torsoH / 2 + 4}
                L ${shoulderW * 0.35} ${torsoH / 2}
                L ${-shoulderW * 0.35} ${torsoH / 2} Z`}
            fill={`hsla(${hue}, 60%, 12%, 0.9)`}
            stroke={`hsla(${hue}, 80%, 55%, 0.2)`}
            strokeWidth={0.5}
          />

          {/* Left arm (holding guitar body) */}
          <path
            d={`M ${-shoulderW / 2} ${-torsoH / 2 + 6}
                L ${-shoulderW / 2 - 8} ${0}
                L ${-shoulderW / 2 - 4} ${15}
                L ${-shoulderW * 0.3} ${10}`}
            fill={`hsla(${hue}, 60%, 12%, 0.85)`}
            stroke={`hsla(${hue}, 80%, 55%, 0.15)`}
            strokeWidth={0.4}
          />

          {/* Right arm (on fretboard, angled with guitar) */}
          <g
            transform={`rotate(${neckAngle * 0.3}, ${shoulderW / 2}, ${-torsoH / 2 + 6})`}
          >
            <path
              d={`M ${shoulderW / 2} ${-torsoH / 2 + 6}
                  L ${shoulderW / 2 + 12} ${-5}
                  L ${shoulderW / 2 + 8} ${5}
                  L ${shoulderW * 0.3} ${5}`}
              fill={`hsla(${hue}, 60%, 12%, 0.85)`}
              stroke={`hsla(${hue}, 80%, 55%, 0.15)`}
              strokeWidth={0.4}
            />
          </g>

          {/* Guitar body (rough teardrop shape at hip level) */}
          <g transform={`rotate(${neckAngle * 0.2}, 0, 5)`}>
            <ellipse
              cx={-8}
              cy={8}
              rx={18}
              ry={14}
              fill={`hsla(${hue}, 60%, 10%, 0.9)`}
              stroke={`hsla(${hue}, 80%, 55%, 0.3)`}
              strokeWidth={0.6}
            />
            {/* Sound hole */}
            <circle
              cx={-8}
              cy={8}
              r={5}
              fill={`hsla(${hue}, 50%, 8%, 0.9)`}
              stroke={`hsla(${hue}, 80%, 55%, 0.15)`}
              strokeWidth={0.3}
            />
          </g>

          {/* Guitar neck — angle follows centroid */}
          <g transform={`rotate(${neckAngle}, ${-8}, ${8})`}>
            <rect
              x={-8 + 16}
              y={5}
              width={55}
              height={4}
              rx={1.5}
              fill={`hsla(${hue}, 60%, 10%, 0.9)`}
              stroke={`hsla(${hue}, 80%, 55%, 0.2)`}
              strokeWidth={0.4}
              transform={`rotate(-90, ${-8 + 16}, ${5})`}
            />
            {/* Headstock */}
            <rect
              x={4}
              y={5 - 59}
              width={8}
              height={8}
              rx={2}
              fill={`hsla(${hue}, 60%, 10%, 0.85)`}
              stroke={`hsla(${hue}, 80%, 55%, 0.15)`}
              strokeWidth={0.3}
            />
          </g>

          {/* Legs */}
          <path
            d={`M ${-shoulderW * 0.25} ${torsoH / 2}
                L ${-shoulderW * 0.2} ${torsoH / 2 + legH}
                L ${-shoulderW * 0.1} ${torsoH / 2 + legH}
                L ${-5} ${torsoH / 2}`}
            fill={`hsla(${hue}, 60%, 10%, 0.9)`}
          />
          <path
            d={`M ${5} ${torsoH / 2}
                L ${shoulderW * 0.1} ${torsoH / 2 + legH}
                L ${shoulderW * 0.2} ${torsoH / 2 + legH}
                L ${shoulderW * 0.25} ${torsoH / 2}`}
            fill={`hsla(${hue}, 60%, 10%, 0.9)`}
          />
        </g>

        {/* Rim light on figure edges — warm golden outline glow */}
        <g
          transform={`translate(${figureX + sway}, ${figureBaseY}) scale(${pulseBreath})`}
          style={{ filter: `blur(2px)` }}
        >
          <circle
            cx={0}
            cy={-torsoH / 2 - headR - 4}
            r={headR + 1.5}
            fill="none"
            stroke={`hsla(${hue}, 90%, 70%, 0.25)`}
            strokeWidth={1.5}
          />
          <path
            d={`M ${-shoulderW / 2 - 1} ${-torsoH / 2 + 4}
                L ${-shoulderW / 2 - 1} ${-torsoH / 2}
                L ${shoulderW / 2 + 1} ${-torsoH / 2}
                L ${shoulderW / 2 + 1} ${-torsoH / 2 + 4}`}
            fill="none"
            stroke={`hsla(${hue}, 90%, 70%, 0.2)`}
            strokeWidth={1.2}
          />
        </g>
      </svg>
    </div>
  );
};
