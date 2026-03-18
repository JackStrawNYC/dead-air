/**
 * StealYourFaceKaleidoscope — SYF skull + lightning bolt with 6-fold
 * rotational CSS symmetry. Rotation rate tied to musicalTime, segments
 * pulse with spectralFlux, colors shift with chromaHue.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

interface Props {
  frames: EnhancedFrameData[];
}

/** Minimal SYF SVG for kaleidoscope repetition */
const SyfSegment: React.FC<{ size: number; color: string; boltColor: string; opacity: number }> = ({
  size,
  color,
  boltColor,
  opacity,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" opacity={opacity}>
    {/* Half circle (upper dome) */}
    <path d="M 5 50 A 45 45 0 0 1 95 50" stroke={color} strokeWidth="2.5" fill="none" />
    {/* Horizontal line */}
    <line x1="5" y1="50" x2="95" y2="50" stroke={color} strokeWidth="1.5" />
    {/* Lightning bolt */}
    <polygon
      points="50,8 44,42 54,42 38,92 60,52 48,52 58,8"
      fill={boltColor}
      opacity="0.8"
    />
    {/* Eye socket hint */}
    <circle cx="35" cy="38" r="8" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
    <circle cx="65" cy="38" r="8" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
  </svg>
);

export const StealYourFaceKaleidoscope: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const chromaHue = snap.chromaHue;
  const spectralFlux = snap.spectralFlux;
  const beatDecay = snap.beatDecay;

  const segmentCount = 6;
  const segmentAngle = 360 / segmentCount;

  // Rotation: tied to musical time for beat-locked spinning
  const baseRotation = (frame / 30) * 12 * tempoFactor;

  // Segment size: pulses with spectral flux
  const baseSize = Math.min(width, height) * 0.22;
  const pulseSize = baseSize * (1 + spectralFlux * 0.15 + beatDecay * 0.08);

  // Colors from chroma
  const hue = chromaHue;
  const mainColor = `hsl(${hue}, 70%, 60%)`;
  const boltColor = `hsl(${(hue + 30) % 360}, 80%, 55%)`;

  // Overall opacity
  const opacity = 0.15 + energy * 0.3;

  // Glow intensity
  const glowRadius = 6 + energy * 18 + beatDecay * 8;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          position: "relative",
          width: pulseSize,
          height: pulseSize,
          transform: `rotate(${baseRotation}deg)`,
          filter: `drop-shadow(0 0 ${glowRadius}px ${mainColor})`,
          willChange: "transform, filter",
        }}
      >
        {Array.from({ length: segmentCount }).map((_, i) => {
          const angle = i * segmentAngle;
          const segmentPulse = 1 + Math.sin(frame * 0.1 + i * 1.05) * spectralFlux * 0.1;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: `translate(-50%, -50%) rotate(${angle}deg) scale(${segmentPulse})`,
                transformOrigin: "center center",
              }}
            >
              <SyfSegment
                size={pulseSize * 0.45}
                color={mainColor}
                boltColor={boltColor}
                opacity={0.7 + (i % 2) * 0.15}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
