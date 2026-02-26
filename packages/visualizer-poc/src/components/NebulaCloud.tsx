/**
 * NebulaCloud — Colorful gas cloud pulsing.
 * 8-12 large overlapping ellipses with heavy blur (filter: blur(20px)).
 * Each ellipse drifts slowly. Colors from chroma data (dominant pitch -> hue).
 * Opacity modulates with energy. Screen blend mode. Very diffuse and
 * atmospheric. Always visible at 8-18% opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const NUM_BLOBS = 10;

// Map 12 chroma pitch classes to hues (C=0, C#=30, D=60, ... B=330)
const CHROMA_HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

interface NebulaBlobData {
  /** Center x normalized 0-1 */
  cx: number;
  /** Center y normalized 0-1 */
  cy: number;
  /** Radius x multiplier */
  rx: number;
  /** Radius y multiplier */
  ry: number;
  /** Drift speed x */
  driftSpeedX: number;
  /** Drift speed y */
  driftSpeedY: number;
  /** Drift amplitude x */
  driftAmpX: number;
  /** Drift amplitude y */
  driftAmpY: number;
  /** Phase offset for drift sine */
  driftPhase: number;
  /** Base opacity */
  baseAlpha: number;
  /** Which chroma bin this blob follows (0-11) */
  chromaBin: number;
  /** Base hue offset */
  hueOffset: number;
}

function generateBlobs(seed: number): NebulaBlobData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_BLOBS }, () => ({
    cx: 0.15 + rng() * 0.7,
    cy: 0.15 + rng() * 0.7,
    rx: 0.12 + rng() * 0.18,
    ry: 0.1 + rng() * 0.15,
    driftSpeedX: 0.002 + rng() * 0.006,
    driftSpeedY: 0.002 + rng() * 0.005,
    driftAmpX: 0.03 + rng() * 0.06,
    driftAmpY: 0.02 + rng() * 0.05,
    driftPhase: rng() * Math.PI * 2,
    baseAlpha: 0.3 + rng() * 0.4,
    chromaBin: Math.floor(rng() * 12),
    hueOffset: (rng() - 0.5) * 40,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const NebulaCloud: React.FC<Props> = ({ frames }) => {
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

  const blobs = React.useMemo(() => generateBlobs(42424242), []);

  // Current chroma data
  const chroma = frames[idx].chroma;

  // Find dominant pitch for overall hue influence
  let dominantBin = 0;
  let maxChroma = 0;
  for (let c = 0; c < 12; c++) {
    if (chroma[c] > maxChroma) {
      maxChroma = chroma[c];
      dominantBin = c;
    }
  }
  const dominantHue = CHROMA_HUES[dominantBin];

  // Master opacity: always visible at 8-18%
  const masterOpacity = interpolate(energy, [0.02, 0.25], [0.08, 0.18], {
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
        mixBlendMode: "screen",
        opacity: masterOpacity,
      }}
    >
      {blobs.map((blob, i) => {
        // Drift position
        const driftX = Math.sin(frame * blob.driftSpeedX + blob.driftPhase) * blob.driftAmpX;
        const driftY = Math.cos(frame * blob.driftSpeedY + blob.driftPhase * 1.3) * blob.driftAmpY;
        const bx = (blob.cx + driftX) * width;
        const by = (blob.cy + driftY) * height;
        const brx = blob.rx * width;
        const bry = blob.ry * height;

        // Color: blend between the blob's chroma-bin hue and the dominant hue
        const chromaStrength = chroma[blob.chromaBin];
        const blobHue = CHROMA_HUES[blob.chromaBin] + blob.hueOffset;
        const hue = blobHue + (dominantHue - blobHue) * 0.3;

        // Opacity modulates with the chroma strength of this blob's bin + energy
        const blobOpacity = blob.baseAlpha * (0.4 + chromaStrength * 0.4 + energy * 0.2);

        // Slight size pulsing with energy
        const sizePulse = 1 + energy * 0.15 + Math.sin(frame * 0.02 + i) * 0.05;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: bx - brx * sizePulse,
              top: by - bry * sizePulse,
              width: brx * 2 * sizePulse,
              height: bry * 2 * sizePulse,
              borderRadius: "50%",
              background: `radial-gradient(ellipse at center, hsla(${hue}, 70%, 55%, ${blobOpacity}) 0%, hsla(${hue}, 60%, 40%, ${blobOpacity * 0.4}) 50%, transparent 100%)`,
              filter: "blur(20px)",
            }}
          />
        );
      })}
    </div>
  );
};
