/**
 * SpiritWisps — 8-12 ghostly ethereal wisps that float and drift slowly.
 * Each wisp is a small glowing orb with a trailing tail (fading opacity gradient).
 * Colors shift through pale blues, greens, purples.
 * Wisps move in gentle figure-8 or lissajous paths.
 * More visible during quiet passages.
 * Always visible at very low opacity (0.05-0.15).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface WispData {
  /** Center x as fraction of width */
  cx: number;
  /** Center y as fraction of height */
  cy: number;
  /** Lissajous A frequency */
  freqA: number;
  /** Lissajous B frequency */
  freqB: number;
  /** Lissajous phase offset */
  phaseOffset: number;
  /** X amplitude as fraction of width */
  ampX: number;
  /** Y amplitude as fraction of height */
  ampY: number;
  /** Base hue (180=blue-ish, 260=purple-ish, 140=green-ish) */
  hue: number;
  /** Hue drift speed */
  hueDrift: number;
  /** Orb radius */
  orbRadius: number;
  /** Tail length in sample points */
  tailLength: number;
  /** Brightness multiplier */
  brightness: number;
  /** Pulse frequency */
  pulseFreq: number;
  /** Pulse phase */
  pulsePhase: number;
}

const NUM_WISPS = 10;
const TAIL_SAMPLES = 8;

function generateWisps(seed: number): WispData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_WISPS }, () => {
    // Choose from pale blue/green/purple palette
    const hueOptions = [180, 200, 220, 260, 280, 140, 160];
    const hue = hueOptions[Math.floor(rng() * hueOptions.length)];
    return {
      cx: 0.15 + rng() * 0.7,
      cy: 0.15 + rng() * 0.7,
      freqA: 0.003 + rng() * 0.006,
      freqB: 0.004 + rng() * 0.008,
      phaseOffset: rng() * Math.PI * 2,
      ampX: 0.08 + rng() * 0.15,
      ampY: 0.06 + rng() * 0.12,
      hue,
      hueDrift: 0.1 + rng() * 0.3,
      orbRadius: 4 + rng() * 8,
      tailLength: 5 + Math.floor(rng() * 4),
      brightness: 0.6 + rng() * 0.4,
      pulseFreq: 0.02 + rng() * 0.04,
      pulsePhase: rng() * Math.PI * 2,
    };
  });
}

const STAGGER_START = 150;

interface Props {
  frames: EnhancedFrameData[];
}

export const SpiritWisps: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const wisps = React.useMemo(() => generateWisps(77050819), []);

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 180], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // More visible during quiet passages, always at 0.05-0.15
  const quietness = 1 - interpolate(energy, [0.04, 0.25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = interpolate(quietness, [0, 1], [0.05, 0.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * masterFade;

  if (masterOpacity < 0.005) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `blur(2px) drop-shadow(0 0 15px rgba(150, 200, 255, 0.4))`,
        }}
      >
        {wisps.map((wisp, wi) => {
          // Stagger entrance
          const wispFade = interpolate(
            frame,
            [STAGGER_START + wi * 25, STAGGER_START + wi * 25 + 120],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          );
          if (wispFade < 0.01) return null;

          // Current hue (drifts over time)
          const currentHue = (wisp.hue + frame * wisp.hueDrift) % 360;

          // Pulsing brightness
          const pulse =
            0.7 + Math.sin(frame * wisp.pulseFreq + wisp.pulsePhase) * 0.3;

          // Lissajous position for current frame
          const getPos = (f: number) => {
            const lx = wisp.cx * width + Math.sin(f * wisp.freqA + wisp.phaseOffset) * wisp.ampX * width;
            const ly = wisp.cy * height + Math.sin(f * wisp.freqB + wisp.phaseOffset * 1.3) * wisp.ampY * height;
            return { x: lx, y: ly };
          };

          const pos = getPos(frame);

          // Trail: sample past positions
          const tailPts: { x: number; y: number; alpha: number }[] = [];
          for (let t = 1; t <= wisp.tailLength; t++) {
            const pastFrame = frame - t * 4;
            const pastPos = getPos(pastFrame);
            tailPts.push({
              x: pastPos.x,
              y: pastPos.y,
              alpha: (1 - t / wisp.tailLength) * 0.4,
            });
          }

          return (
            <g key={wi} opacity={wispFade}>
              {/* Tail segments (fading trailing circles) */}
              {tailPts.map((tp, ti) => (
                <circle
                  key={`t-${ti}`}
                  cx={tp.x}
                  cy={tp.y}
                  r={wisp.orbRadius * (0.4 + (1 - ti / wisp.tailLength) * 0.3)}
                  fill={`hsla(${currentHue}, 50%, 80%, ${tp.alpha * pulse * wisp.brightness})`}
                />
              ))}
              {/* Outer glow */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={wisp.orbRadius * 3}
                fill={`hsla(${currentHue}, 40%, 85%, ${0.1 * pulse * wisp.brightness})`}
              />
              {/* Mid glow */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={wisp.orbRadius * 1.8}
                fill={`hsla(${currentHue}, 50%, 85%, ${0.25 * pulse * wisp.brightness})`}
              />
              {/* Core orb */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={wisp.orbRadius}
                fill={`hsla(${currentHue}, 60%, 90%, ${0.7 * pulse * wisp.brightness})`}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
