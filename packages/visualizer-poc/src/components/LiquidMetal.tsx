/**
 * LiquidMetal — Chrome mercury blobs that morph with bass.
 * 6-8 large SVG ellipses with metallic gradients (silver/chrome highlights).
 * Blobs move slowly, merge/split based on sub-bass energy.
 * Always visible at 10-25% opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

// ── BLOB DATA ────────────────────────────────────────────────────

interface BlobData {
  baseX: number;
  baseY: number;
  baseRx: number;
  baseRy: number;
  freqX: number;
  freqY: number;
  freqRx: number;
  freqRy: number;
  phaseX: number;
  phaseY: number;
  phaseRx: number;
  phaseRy: number;
  ampX: number;
  ampY: number;
}

const NUM_BLOBS = 7;

function generateBlobs(seed: number): BlobData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_BLOBS }, () => ({
    baseX: 0.15 + rng() * 0.7,
    baseY: 0.2 + rng() * 0.6,
    baseRx: 60 + rng() * 100,
    baseRy: 40 + rng() * 80,
    freqX: 0.003 + rng() * 0.006,
    freqY: 0.004 + rng() * 0.005,
    freqRx: 0.005 + rng() * 0.008,
    freqRy: 0.006 + rng() * 0.007,
    phaseX: rng() * Math.PI * 2,
    phaseY: rng() * Math.PI * 2,
    phaseRx: rng() * Math.PI * 2,
    phaseRy: rng() * Math.PI * 2,
    ampX: 40 + rng() * 80,
    ampY: 30 + rng() * 60,
  }));
}

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const LiquidMetal: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Rolling energy (151-frame window)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const currentFrame = frames[idx];
  const subBass = currentFrame ? currentFrame.sub : 0;

  const blobs = React.useMemo(() => generateBlobs(8675309), []);

  // Always visible, 10-25% opacity based on energy
  const opacity = interpolate(energy, [0, 0.3], [0.1, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sub-bass drives blob size expansion
  const bassScale = 1 + subBass * 0.6;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity }}>
        <defs>
          {blobs.map((_, i) => (
            <linearGradient key={`grad-${i}`} id={`metal-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c0c0c0" stopOpacity="0.6" />
              <stop offset="25%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#a8a8a8" stopOpacity="0.7" />
              <stop offset="75%" stopColor="#e8e8e8" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#909090" stopOpacity="0.5" />
            </linearGradient>
          ))}
          <filter id="metal-blur">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id="metal-glow">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        {blobs.map((b, i) => {
          const cx = b.baseX * width + Math.sin(frame * b.freqX + b.phaseX) * b.ampX
            + Math.sin(frame * b.freqX * 0.7 + b.phaseY) * b.ampX * 0.3;
          const cy = b.baseY * height + Math.sin(frame * b.freqY + b.phaseY) * b.ampY
            + Math.cos(frame * b.freqY * 0.6 + b.phaseX) * b.ampY * 0.4;
          const rx = b.baseRx * bassScale + Math.sin(frame * b.freqRx + b.phaseRx) * 20;
          const ry = b.baseRy * bassScale + Math.cos(frame * b.freqRy + b.phaseRy) * 15;

          // Highlight band position shifts with frame
          const highlightOffset = 30 + Math.sin(frame * 0.02 + i * 1.5) * 20;

          return (
            <g key={i}>
              {/* Shadow blob */}
              <ellipse
                cx={cx + 4}
                cy={cy + 4}
                rx={rx * 1.05}
                ry={ry * 1.05}
                fill="rgba(40,40,50,0.3)"
                filter="url(#metal-blur)"
              />
              {/* Main chrome blob */}
              <ellipse
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                fill={`url(#metal-grad-${i})`}
                filter="url(#metal-glow)"
              />
              {/* Specular highlight band */}
              <ellipse
                cx={cx - rx * 0.15}
                cy={cy - ry * 0.25}
                rx={rx * 0.6}
                ry={ry * 0.15}
                fill="white"
                opacity={0.3 + Math.sin(frame * 0.04 + i) * 0.1}
                transform={`rotate(${highlightOffset - 30}, ${cx}, ${cy})`}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
