/**
 * BobWeir — Rhythm guitar figure silhouette.
 * Layer 6, mid energy. Similar silhouette approach to JerrySpotlight but
 * positioned right-center (x: 60-70%). Blue/white spotlight tint.
 * Sways to beat but with wider stance. Visibility gated on mid energy range.
 * Reacts to mid-frequency band.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

const FADE_IN_FRAMES = 60;

interface Props {
  frames: EnhancedFrameData[];
}

export const BobWeir: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const fd = frames[idx];

  // Rolling energy over +/-75 frames for smoothed values
  let rmsSum = 0;
  let midSum = 0;
  let eCount = 0;
  for (
    let i = Math.max(0, idx - 75);
    i <= Math.min(frames.length - 1, idx + 75);
    i++
  ) {
    rmsSum += frames[i].rms;
    midSum += frames[i].mid;
    eCount++;
  }
  const smoothRms = eCount > 0 ? rmsSum / eCount : 0;
  const smoothMid = eCount > 0 ? midSum / eCount : 0;

  // Seed for deterministic sway/phase offsets
  const rng = React.useMemo(
    () => seeded((ctx?.showSeed ?? 19770508) + 7203),
    [ctx?.showSeed],
  );
  const swayPhase = React.useMemo(() => rng() * Math.PI * 2, [rng]);
  const pulsePhase = React.useMemo(() => rng() * Math.PI * 2, [rng]);
  const breathPhase = React.useMemo(() => rng() * Math.PI * 2, [rng]);

  // Energy gate: mid energy range — rms 0.08-0.45, mid > 0.15
  const rmsGate = interpolate(smoothRms, [0.06, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const midGate = interpolate(smoothMid, [0.1, 0.2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Fade out at very high energy (this is rhythm guitar, not lead)
  const highFade = interpolate(smoothRms, [0.4, 0.55], [1, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const gateOpacity = rmsGate * midGate * highFade;

  if (gateOpacity < 0.01) return null;

  // Master fade in
  const masterFade = interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const masterOpacity = gateOpacity * masterFade * 0.65;

  if (masterOpacity < 0.01) return null;

  // Figure position: right-center (60-70% of width)
  const figureX = width * 0.65;
  const figureBaseY = height * 0.55;

  // Sway: wider, more rhythmic movement driven by mid band
  const swayAmount = interpolate(smoothMid, [0.1, 0.4], [5, 18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sway =
    Math.sin(frame * 0.035 + swayPhase) * swayAmount +
    Math.sin(frame * 0.07 + swayPhase * 1.3) * swayAmount * 0.3;

  // Beat pulse
  const beatPulse = fd.beat ? 1.04 : 1.0;
  const pulseBreath =
    1.0 +
    Math.sin(frame * 0.05 + pulsePhase) * 0.012 * beatPulse;

  // Strumming arm motion driven by mid-band energy
  const strumAngle = interpolate(fd.mid, [0.05, 0.6], [-8, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) + Math.sin(frame * 0.09 + breathPhase) * 5;

  // Spotlight color: blue/white
  const hue = interpolate(smoothMid, [0.1, 0.5], [210, 225], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lightness = interpolate(smoothRms, [0.1, 0.4], [65, 85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Spotlight radius
  const spotlightRadius = interpolate(smoothRms, [0.1, 0.4], [70, 140], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Flicker
  const flicker =
    0.87 +
    Math.sin(frame * 0.13 + 2.1) * 0.07 +
    Math.sin(frame * 0.31 + 0.9) * 0.04;

  // Figure dimensions — wider stance than Jerry
  const headR = 13;
  const shoulderW = 48;
  const torsoH = 55;
  const legH = 52;
  const stanceW = shoulderW * 0.4; // wider leg spread

  const spotGradId = `bob-spot-${idx}`;

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
              stopColor={`hsla(${hue}, 60%, ${lightness}%, 0.45)`}
            />
            <stop
              offset="35%"
              stopColor={`hsla(${hue}, 55%, ${lightness - 15}%, 0.18)`}
            />
            <stop
              offset="100%"
              stopColor={`hsla(${hue}, 50%, ${lightness - 25}%, 0)`}
            />
          </radialGradient>
        </defs>

        {/* Spotlight cone / glow behind figure */}
        <ellipse
          cx={figureX + sway}
          cy={figureBaseY - 10}
          rx={spotlightRadius * 1.1}
          ry={spotlightRadius * 1.7}
          fill={`url(#${spotGradId})`}
          style={{ filter: `blur(18px)` }}
        />

        {/* Ground pool of light */}
        <ellipse
          cx={figureX + sway}
          cy={figureBaseY + torsoH / 2 + legH - 5}
          rx={spotlightRadius * 0.85}
          ry={spotlightRadius * 0.22}
          fill={`hsla(${hue}, 55%, ${lightness - 10}%, 0.12)`}
          style={{ filter: `blur(10px)` }}
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
            fill={`hsla(${hue}, 40%, 12%, 0.9)`}
            stroke={`hsla(${hue}, 70%, 60%, 0.25)`}
            strokeWidth={0.7}
          />

          {/* Hair/beard suggestion — slightly wider */}
          <ellipse
            cx={0}
            cy={-torsoH / 2 - headR - 2}
            rx={headR * 1.1}
            ry={headR * 1.1}
            fill={`hsla(${hue}, 40%, 10%, 0.5)`}
          />

          {/* Neck */}
          <rect
            x={-4.5}
            y={-torsoH / 2 - 4}
            width={9}
            height={8}
            fill={`hsla(${hue}, 40%, 12%, 0.9)`}
          />

          {/* Shoulders and torso — slightly broader */}
          <path
            d={`M ${-shoulderW / 2} ${-torsoH / 2 + 5}
                Q ${-shoulderW / 2 - 3} ${-torsoH / 2} ${-shoulderW / 2 + 5} ${-torsoH / 2}
                L ${shoulderW / 2 - 5} ${-torsoH / 2}
                Q ${shoulderW / 2 + 3} ${-torsoH / 2} ${shoulderW / 2} ${-torsoH / 2 + 5}
                L ${shoulderW * 0.32} ${torsoH / 2}
                L ${-shoulderW * 0.32} ${torsoH / 2} Z`}
            fill={`hsla(${hue}, 40%, 10%, 0.9)`}
            stroke={`hsla(${hue}, 70%, 60%, 0.18)`}
            strokeWidth={0.5}
          />

          {/* Left arm (fretboard hand) */}
          <path
            d={`M ${-shoulderW / 2} ${-torsoH / 2 + 7}
                L ${-shoulderW / 2 - 14} ${-8}
                L ${-shoulderW / 2 - 10} ${2}
                L ${-shoulderW * 0.3} ${8}`}
            fill={`hsla(${hue}, 40%, 10%, 0.85)`}
            stroke={`hsla(${hue}, 70%, 60%, 0.12)`}
            strokeWidth={0.4}
          />

          {/* Right arm (strumming) — animated angle */}
          <g
            transform={`rotate(${strumAngle}, ${shoulderW / 2}, ${-torsoH / 2 + 7})`}
          >
            <path
              d={`M ${shoulderW / 2} ${-torsoH / 2 + 7}
                  L ${shoulderW / 2 + 10} ${5}
                  L ${shoulderW / 2 + 5} ${15}
                  L ${shoulderW * 0.25} ${12}`}
              fill={`hsla(${hue}, 40%, 10%, 0.85)`}
              stroke={`hsla(${hue}, 70%, 60%, 0.12)`}
              strokeWidth={0.4}
            />
          </g>

          {/* Guitar body — rhythm guitar, slightly larger body */}
          <ellipse
            cx={5}
            cy={10}
            rx={20}
            ry={15}
            fill={`hsla(${hue}, 40%, 8%, 0.9)`}
            stroke={`hsla(${hue}, 70%, 60%, 0.25)`}
            strokeWidth={0.5}
          />
          {/* Sound hole */}
          <circle
            cx={5}
            cy={10}
            r={6}
            fill={`hsla(${hue}, 35%, 6%, 0.9)`}
            stroke={`hsla(${hue}, 70%, 60%, 0.12)`}
            strokeWidth={0.3}
          />

          {/* Guitar neck — angled up-left */}
          <rect
            x={-35}
            y={-5}
            width={40}
            height={4}
            rx={1.5}
            fill={`hsla(${hue}, 40%, 8%, 0.9)`}
            stroke={`hsla(${hue}, 70%, 60%, 0.15)`}
            strokeWidth={0.4}
            transform="rotate(-35, -15, -3)"
          />

          {/* Legs — wider stance */}
          <path
            d={`M ${-shoulderW * 0.2} ${torsoH / 2}
                L ${-stanceW} ${torsoH / 2 + legH}
                L ${-stanceW + 10} ${torsoH / 2 + legH}
                L ${-5} ${torsoH / 2}`}
            fill={`hsla(${hue}, 40%, 8%, 0.9)`}
          />
          <path
            d={`M ${5} ${torsoH / 2}
                L ${stanceW - 10} ${torsoH / 2 + legH}
                L ${stanceW} ${torsoH / 2 + legH}
                L ${shoulderW * 0.2} ${torsoH / 2}`}
            fill={`hsla(${hue}, 40%, 8%, 0.9)`}
          />
        </g>

        {/* Rim light — blue/white edge glow */}
        <g
          transform={`translate(${figureX + sway}, ${figureBaseY}) scale(${pulseBreath})`}
          style={{ filter: `blur(2px)` }}
        >
          <circle
            cx={0}
            cy={-torsoH / 2 - headR - 4}
            r={headR + 1.5}
            fill="none"
            stroke={`hsla(${hue}, 80%, 75%, 0.22)`}
            strokeWidth={1.3}
          />
          <path
            d={`M ${-shoulderW / 2 - 1} ${-torsoH / 2 + 5}
                L ${-shoulderW / 2 - 1} ${-torsoH / 2}
                L ${shoulderW / 2 + 1} ${-torsoH / 2}
                L ${shoulderW / 2 + 1} ${-torsoH / 2 + 5}`}
            fill="none"
            stroke={`hsla(${hue}, 80%, 75%, 0.18)`}
            strokeWidth={1.1}
          />
        </g>
      </svg>
    </div>
  );
};
