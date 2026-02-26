/**
 * OpArtPatterns — Bridget Riley style shifting concentric circles.
 * Creates optical illusion of depth/motion via per-ring sine-wave
 * strokeWidth oscillation with phase offsets between rings.
 * Neon rainbow stroke color cycling. Energy drives oscillation speed
 * and amplitude. Appears every 45 seconds for 14 seconds.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1350; // 45 seconds at 30fps
const DURATION = 420; // 14 seconds visible
const RING_COUNT = 25; // concentric circles

interface Props {
  frames: EnhancedFrameData[];
}

export const OpArtPatterns: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Clamp frame index to valid range
  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy: average RMS over a 151-frame window centered on current frame
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Cycle gating: only render during the visible window
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade in over first 10%, fade out over last 12%
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

  // Overall opacity: 0.2-0.5 range driven by energy
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.48;

  // Energy-driven oscillation speed and amplitude
  const oscSpeed = interpolate(energy, [0.03, 0.3], [0.04, 0.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const oscAmplitude = interpolate(energy, [0.03, 0.3], [1.0, 4.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Base hue cycling for neon rainbow
  const baseHue = (frame * 0.9) % 360;

  // Glow color from the dominant hue
  const glowHue1 = baseHue;
  const glowHue2 = (baseHue + 180) % 360;
  const glowColor1 = `hsl(${glowHue1}, 100%, 65%)`;
  const glowColor2 = `hsl(${glowHue2}, 100%, 65%)`;

  // Build rings
  const rings: Array<{
    r: number;
    strokeWidth: number;
    color: string;
    ringOpacity: number;
  }> = [];

  for (let ring = 0; ring < RING_COUNT; ring++) {
    const t = ring / (RING_COUNT - 1); // 0 to 1

    // Radius: evenly spaced from center outward
    const r = 20 + t * (maxRadius - 20);

    // Phase offset per ring creates the illusion of motion/depth
    const phaseOffset = ring * 0.45;
    const sineVal = Math.sin(frame * oscSpeed + phaseOffset);

    // strokeWidth oscillates via sine, different phase per ring
    const baseStroke = interpolate(t, [0, 1], [2.5, 1.2], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const strokeWidth = Math.max(0.3, baseStroke + sineVal * oscAmplitude);

    // Color: each ring gets a hue offset for rainbow effect
    const ringHue = (baseHue + ring * (360 / RING_COUNT)) % 360;
    const saturation = 100;
    const lightness = 55 + sineVal * 10;
    const color = `hsl(${ringHue}, ${saturation}%, ${lightness}%)`;

    // Per-ring opacity: slightly modulated by the sine wave
    const ringOpacity = 0.5 + sineVal * 0.2;

    rings.push({ r, strokeWidth, color, ringOpacity });
  }

  // Slow overall rotation driven by energy
  const rotation = frame * (0.15 + energy * 0.4);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 6px ${glowColor1}) drop-shadow(0 0 14px ${glowColor2})`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
          {rings.map((ring, i) => (
            <circle
              key={i}
              cx={0}
              cy={0}
              r={ring.r}
              stroke={ring.color}
              strokeWidth={ring.strokeWidth}
              fill="none"
              opacity={ring.ringOpacity}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};
