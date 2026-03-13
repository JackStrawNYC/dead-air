/**
 * DrumCircle — Dual drummer figures for Drums/Space segments.
 * Layer 6, reacts to stemDrumOnset. Two seated figure silhouettes
 * (simplified drummers) positioned left-center and right-center.
 * Arm/stick positions animate based on onset strength. Concentric circles
 * pulse outward from each figure on beat events. Color: warm orange/amber.
 * Gated on drum onset or general onset if stems unavailable.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

const FADE_IN_FRAMES = 75;
const MAX_RIPPLES = 8;
const RIPPLE_LIFESPAN = 60; // frames

interface DrummerData {
  /** X position as fraction of width */
  x: number;
  /** Slight vertical offset */
  yOffset: number;
  /** Arm swing phase offset */
  armPhase: number;
  /** Secondary arm phase for polyrhythmic feel */
  armPhase2: number;
  /** Scale variation */
  scale: number;
}

function generateDrummers(seed: number): DrummerData[] {
  const rng = seeded(seed);
  return [
    {
      x: 0.32 + rng() * 0.04,
      yOffset: rng() * 8,
      armPhase: rng() * Math.PI * 2,
      armPhase2: rng() * Math.PI * 2,
      scale: 0.95 + rng() * 0.1,
    },
    {
      x: 0.64 + rng() * 0.04,
      yOffset: rng() * 8,
      armPhase: rng() * Math.PI * 2,
      armPhase2: rng() * Math.PI * 2,
      scale: 0.95 + rng() * 0.1,
    },
  ];
}

interface Ripple {
  /** Frame when the ripple was spawned */
  birthFrame: number;
  /** Which drummer (0 or 1) spawned this ripple */
  drummer: number;
  /** Intensity of the onset that triggered it */
  intensity: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const DrumCircle: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const fd = frames[idx];

  // Get drum onset — prefer stemDrumOnset, fall back to general onset
  const drumOnset = fd.stemDrumOnset ?? fd.onset;
  const drumBeat = fd.stemDrumBeat ?? fd.beat;

  // Rolling onset energy over +/-60 frames
  let onsetSum = 0;
  let eCount = 0;
  for (
    let i = Math.max(0, idx - 60);
    i <= Math.min(frames.length - 1, idx + 60);
    i++
  ) {
    const f = frames[i];
    onsetSum += f.stemDrumOnset ?? f.onset;
    eCount++;
  }
  const smoothOnset = eCount > 0 ? onsetSum / eCount : 0;

  // Drummers seeded for determinism
  const drummers = React.useMemo(
    () => generateDrummers((ctx?.showSeed ?? 19770508) + 8823),
    [ctx?.showSeed],
  );

  // Collect ripple events from recent frames
  const ripples = React.useMemo(() => {
    const result: Ripple[] = [];
    const lookback = RIPPLE_LIFESPAN;
    const rng = seeded((ctx?.showSeed ?? 19770508) + 3317 + Math.floor(idx / lookback));

    for (let f = Math.max(0, idx - lookback); f <= idx; f++) {
      const fd2 = frames[f];
      const onset = fd2.stemDrumOnset ?? fd2.onset;
      const beat = fd2.stemDrumBeat ?? fd2.beat;
      if (beat && onset > 0.15) {
        // Alternate which drummer spawns the ripple (deterministic based on frame)
        const drummerIdx = f % 2;
        result.push({
          birthFrame: f,
          drummer: drummerIdx,
          intensity: onset,
        });
      }
    }
    // Keep only the most recent ripples
    return result.slice(-MAX_RIPPLES);
  }, [idx, frames, ctx?.showSeed]);

  // Energy gate: need drum activity
  const gateOpacity = interpolate(smoothOnset, [0.04, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (gateOpacity < 0.01) return null;

  // Master fade in
  const masterFade = interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Overall opacity
  const baseOpacity = interpolate(smoothOnset, [0.05, 0.35], [0.2, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = baseOpacity * gateOpacity * masterFade;

  if (masterOpacity < 0.01) return null;

  // Colors: warm orange/amber
  const hue = interpolate(smoothOnset, [0.05, 0.4], [25, 38], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const saturation = 80;
  const lightness = interpolate(smoothOnset, [0.05, 0.4], [40, 60], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Flicker
  const flicker =
    0.88 +
    Math.sin(frame * 0.11 + 1.7) * 0.06 +
    Math.sin(frame * 0.29 + 3.5) * 0.04;

  // Figure base Y: seated figures, roughly center-low
  const figureBaseY = height * 0.58;

  // Arm/stick animation driven by onset
  const stickAngle = interpolate(drumOnset, [0, 0.6], [15, -45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
        {/* Render concentric ripple circles */}
        {ripples.map((ripple, ri) => {
          const age = idx - ripple.birthFrame;
          if (age < 0 || age > RIPPLE_LIFESPAN) return null;

          const progress = age / RIPPLE_LIFESPAN;
          const drummer = drummers[ripple.drummer];
          const cx = drummer.x * width;
          const cy = figureBaseY + drummer.yOffset;

          // Ripple expands outward
          const maxRadius = 80 + ripple.intensity * 120;
          const radius = progress * maxRadius;

          // Fade out as it expands
          const rippleAlpha = interpolate(
            progress,
            [0, 0.15, 0.7, 1],
            [0, 0.5, 0.2, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          ) * ripple.intensity;

          if (rippleAlpha < 0.01) return null;

          return (
            <g key={`ripple-${ri}-${ripple.birthFrame}`}>
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={`hsla(${hue}, ${saturation}%, ${lightness + 10}%, ${rippleAlpha})`}
                strokeWidth={2.5 * (1 - progress * 0.6)}
                style={{ filter: `blur(${1 + progress * 3}px)` }}
              />
              {/* Inner ripple ring */}
              <circle
                cx={cx}
                cy={cy}
                r={radius * 0.6}
                fill="none"
                stroke={`hsla(${hue}, ${saturation}%, ${lightness + 20}%, ${rippleAlpha * 0.5})`}
                strokeWidth={1.5 * (1 - progress * 0.5)}
                style={{ filter: `blur(${0.5 + progress * 2}px)` }}
              />
            </g>
          );
        })}

        {/* Render two drummer figures */}
        {drummers.map((drummer, di) => {
          const cx = drummer.x * width;
          const cy = figureBaseY + drummer.yOffset;
          const s = drummer.scale;

          // Each drummer has slightly different arm timing
          const armOffset = di === 0 ? 0 : Math.PI * 0.5;
          const thisStickAngle =
            stickAngle +
            Math.sin(frame * 0.08 + drummer.armPhase + armOffset) * 10;
          const otherStickAngle =
            stickAngle +
            Math.sin(frame * 0.08 + drummer.armPhase2 + armOffset + Math.PI * 0.7) * 10;

          // Seated figure dimensions
          const headR = 11 * s;
          const torsoW = 36 * s;
          const torsoH = 40 * s;
          const seatY = cy + torsoH * 0.3;

          // Glow behind drummer
          const glowRadius = interpolate(
            drumOnset,
            [0, 0.5],
            [50, 100],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          ) * s;

          return (
            <g key={`drummer-${di}`}>
              {/* Background glow */}
              <circle
                cx={cx}
                cy={cy - 10 * s}
                r={glowRadius}
                fill={`hsla(${hue}, ${saturation}%, ${lightness - 10}%, 0.08)`}
                style={{ filter: `blur(15px)` }}
              />

              {/* Head */}
              <circle
                cx={cx}
                cy={cy - torsoH / 2 - headR - 3 * s}
                r={headR}
                fill={`hsla(${hue}, 50%, 12%, 0.9)`}
                stroke={`hsla(${hue}, ${saturation}%, ${lightness}%, 0.25)`}
                strokeWidth={0.7}
              />

              {/* Neck */}
              <rect
                x={cx - 3.5 * s}
                y={cy - torsoH / 2 - 3 * s}
                width={7 * s}
                height={6 * s}
                fill={`hsla(${hue}, 50%, 12%, 0.9)`}
              />

              {/* Torso — seated, slightly hunched */}
              <path
                d={`M ${cx - torsoW / 2} ${cy - torsoH / 2 + 3 * s}
                    Q ${cx - torsoW / 2 - 2 * s} ${cy - torsoH / 2} ${cx - torsoW / 2 + 4 * s} ${cy - torsoH / 2}
                    L ${cx + torsoW / 2 - 4 * s} ${cy - torsoH / 2}
                    Q ${cx + torsoW / 2 + 2 * s} ${cy - torsoH / 2} ${cx + torsoW / 2} ${cy - torsoH / 2 + 3 * s}
                    L ${cx + torsoW * 0.35} ${seatY}
                    L ${cx - torsoW * 0.35} ${seatY} Z`}
                fill={`hsla(${hue}, 50%, 10%, 0.9)`}
                stroke={`hsla(${hue}, ${saturation}%, ${lightness}%, 0.15)`}
                strokeWidth={0.5}
              />

              {/* Left arm + stick */}
              <g
                transform={`rotate(${thisStickAngle}, ${cx - torsoW / 2 + 2 * s}, ${cy - torsoH / 2 + 8 * s})`}
              >
                {/* Upper arm */}
                <rect
                  x={cx - torsoW / 2 - 3 * s}
                  y={cy - torsoH / 2 + 5 * s}
                  width={5 * s}
                  height={25 * s}
                  rx={2.5 * s}
                  fill={`hsla(${hue}, 50%, 10%, 0.85)`}
                  stroke={`hsla(${hue}, ${saturation}%, ${lightness}%, 0.1)`}
                  strokeWidth={0.3}
                />
                {/* Drumstick */}
                <rect
                  x={cx - torsoW / 2 - 1.5 * s}
                  y={cy - torsoH / 2 + 28 * s}
                  width={2 * s}
                  height={22 * s}
                  rx={1 * s}
                  fill={`hsla(${hue}, 40%, 25%, 0.8)`}
                  stroke={`hsla(${hue}, ${saturation}%, ${lightness + 10}%, 0.2)`}
                  strokeWidth={0.3}
                />
              </g>

              {/* Right arm + stick */}
              <g
                transform={`rotate(${otherStickAngle}, ${cx + torsoW / 2 - 2 * s}, ${cy - torsoH / 2 + 8 * s})`}
              >
                {/* Upper arm */}
                <rect
                  x={cx + torsoW / 2 - 2 * s}
                  y={cy - torsoH / 2 + 5 * s}
                  width={5 * s}
                  height={25 * s}
                  rx={2.5 * s}
                  fill={`hsla(${hue}, 50%, 10%, 0.85)`}
                  stroke={`hsla(${hue}, ${saturation}%, ${lightness}%, 0.1)`}
                  strokeWidth={0.3}
                />
                {/* Drumstick */}
                <rect
                  x={cx + torsoW / 2 - 0.5 * s}
                  y={cy - torsoH / 2 + 28 * s}
                  width={2 * s}
                  height={22 * s}
                  rx={1 * s}
                  fill={`hsla(${hue}, 40%, 25%, 0.8)`}
                  stroke={`hsla(${hue}, ${saturation}%, ${lightness + 10}%, 0.2)`}
                  strokeWidth={0.3}
                />
              </g>

              {/* Seated legs — thighs visible, bent at knee */}
              {/* Left thigh */}
              <path
                d={`M ${cx - torsoW * 0.3} ${seatY}
                    L ${cx - torsoW * 0.5} ${seatY + 18 * s}
                    L ${cx - torsoW * 0.55} ${seatY + 30 * s}
                    L ${cx - torsoW * 0.4} ${seatY + 30 * s}
                    L ${cx - torsoW * 0.15} ${seatY}`}
                fill={`hsla(${hue}, 50%, 8%, 0.9)`}
              />
              {/* Right thigh */}
              <path
                d={`M ${cx + torsoW * 0.15} ${seatY}
                    L ${cx + torsoW * 0.4} ${seatY + 18 * s}
                    L ${cx + torsoW * 0.55} ${seatY + 30 * s}
                    L ${cx + torsoW * 0.5} ${seatY + 30 * s}
                    L ${cx + torsoW * 0.3} ${seatY}`}
                fill={`hsla(${hue}, 50%, 8%, 0.9)`}
              />

              {/* Drum kit suggestion — simplified kit shapes */}
              {/* Snare/hi-hat in front */}
              <ellipse
                cx={cx - 12 * s}
                cy={seatY + 8 * s}
                rx={14 * s}
                ry={4 * s}
                fill={`hsla(${hue}, 40%, 15%, 0.6)`}
                stroke={`hsla(${hue}, ${saturation}%, ${lightness}%, 0.2)`}
                strokeWidth={0.5}
              />
              <ellipse
                cx={cx + 12 * s}
                cy={seatY + 5 * s}
                rx={12 * s}
                ry={3.5 * s}
                fill={`hsla(${hue}, 40%, 15%, 0.6)`}
                stroke={`hsla(${hue}, ${saturation}%, ${lightness}%, 0.2)`}
                strokeWidth={0.5}
              />
              {/* Cymbal suggestion above/behind */}
              <ellipse
                cx={cx - 22 * s}
                cy={cy - torsoH / 2 + 2 * s}
                rx={16 * s}
                ry={3 * s}
                fill="none"
                stroke={`hsla(${hue}, ${saturation}%, ${lightness + 15}%, 0.15)`}
                strokeWidth={0.8}
                transform={`rotate(-8, ${cx - 22 * s}, ${cy - torsoH / 2 + 2 * s})`}
              />
              <ellipse
                cx={cx + 22 * s}
                cy={cy - torsoH / 2 - 2 * s}
                rx={14 * s}
                ry={3 * s}
                fill="none"
                stroke={`hsla(${hue}, ${saturation}%, ${lightness + 15}%, 0.15)`}
                strokeWidth={0.8}
                transform={`rotate(8, ${cx + 22 * s}, ${cy - torsoH / 2 - 2 * s})`}
              />

              {/* Rim light glow on figure */}
              <circle
                cx={cx}
                cy={cy - torsoH / 2 - headR - 3 * s}
                r={headR + 1.5}
                fill="none"
                stroke={`hsla(${hue}, ${saturation}%, ${lightness + 10}%, 0.2)`}
                strokeWidth={1.2}
                style={{ filter: `blur(1.5px)` }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
