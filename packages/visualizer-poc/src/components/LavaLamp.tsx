/**
 * LavaLamp — Classic 60s lava lamp effect.
 * 6-8 large colored blobs that slowly morph and float using sine/cosine motion.
 * Each blob is a CSS div with large border-radius and blur filter.
 * Colors cycle through psychedelic palette.
 * Blobs move slower during quiet, faster during loud.
 * Always visible at 10-25% base opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface BlobData {
  /** Normalized center x 0-1 */
  cx: number;
  /** Normalized center y 0-1 */
  cy: number;
  /** Base radius as fraction of min(width,height) */
  radius: number;
  /** Sine frequency multiplier for x drift */
  freqX: number;
  /** Sine frequency multiplier for y drift */
  freqY: number;
  /** Amplitude of x drift in px */
  ampX: number;
  /** Amplitude of y drift in px */
  ampY: number;
  /** Phase offset for sine */
  phase: number;
  /** Base hue (degrees) */
  hue: number;
  /** Border radius distortion factor */
  morphSpeed: number;
}

const NUM_BLOBS = 7;
const PSYCHEDELIC_HUES = [320, 280, 180, 50, 130, 0, 210]; // magenta, purple, cyan, gold, green, red, blue

function generateBlobs(seed: number): BlobData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_BLOBS }, (_, i) => ({
    cx: 0.15 + rng() * 0.7,
    cy: 0.15 + rng() * 0.7,
    radius: 0.08 + rng() * 0.1,
    freqX: 0.005 + rng() * 0.015,
    freqY: 0.004 + rng() * 0.012,
    ampX: 80 + rng() * 160,
    ampY: 60 + rng() * 140,
    phase: rng() * Math.PI * 2,
    hue: PSYCHEDELIC_HUES[i % PSYCHEDELIC_HUES.length],
    morphSpeed: 0.02 + rng() * 0.04,
  }));
}

// Timing: stagger start — visible starting at frame 60, always present after
const STAGGER_START = 60;

interface Props {
  frames: EnhancedFrameData[];
}

export const LavaLamp: React.FC<Props> = ({ frames }) => {
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

  const blobs = React.useMemo(() => generateBlobs(19670114), []);

  // Fade in at start
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Overall opacity: always visible 10-25%, energy pushes it higher
  const baseOpacity = interpolate(energy, [0.02, 0.3], [0.10, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = baseOpacity * masterFade;

  if (opacity < 0.01) return null;

  // Speed multiplier: blobs drift faster when loud
  const speedMult = interpolate(energy, [0.03, 0.35], [0.4, 1.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Color hue shift over time
  const hueShift = frame * 0.15;

  const minDim = Math.min(width, height);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        opacity,
        mixBlendMode: "screen",
      }}
    >
      {blobs.map((blob, i) => {
        // Stagger each blob's entrance by 15 frames
        const blobFade = interpolate(
          frame,
          [STAGGER_START + i * 15, STAGGER_START + i * 15 + 60],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
        );

        if (blobFade < 0.01) return null;

        const t = frame * speedMult;
        const x = blob.cx * width + Math.sin(t * blob.freqX + blob.phase) * blob.ampX;
        const y = blob.cy * height + Math.cos(t * blob.freqY + blob.phase * 1.3) * blob.ampY;

        const r = blob.radius * minDim * (0.9 + energy * 0.4);

        // Morphing border-radius via sine to create organic blob shape
        const morph1 = 40 + Math.sin(frame * blob.morphSpeed + blob.phase) * 15;
        const morph2 = 50 + Math.cos(frame * blob.morphSpeed * 0.7 + blob.phase * 2) * 15;
        const morph3 = 45 + Math.sin(frame * blob.morphSpeed * 1.3 + blob.phase * 0.5) * 18;
        const morph4 = 55 + Math.cos(frame * blob.morphSpeed * 0.9 + blob.phase * 1.7) * 12;
        const borderRadius = `${morph1}% ${100 - morph1}% ${morph2}% ${100 - morph2}% / ${morph3}% ${morph4}% ${100 - morph4}% ${100 - morph3}%`;

        const hue = (blob.hue + hueShift) % 360;
        const saturation = 85 + energy * 15;
        const lightness = 50 + energy * 15;
        const bgColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        const glowColor = `hsla(${hue}, 100%, 60%, 0.6)`;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - r,
              top: y - r,
              width: r * 2,
              height: r * 2,
              borderRadius,
              background: `radial-gradient(ellipse at 40% 35%, ${bgColor}, hsla(${(hue + 40) % 360}, ${saturation}%, ${lightness - 15}%, 0.8))`,
              filter: `blur(${20 + energy * 15}px) drop-shadow(0 0 ${20 + energy * 25}px ${glowColor})`,
              opacity: blobFade * (0.6 + energy * 0.4),
              willChange: "transform, border-radius",
            }}
          />
        );
      })}
    </div>
  );
};
