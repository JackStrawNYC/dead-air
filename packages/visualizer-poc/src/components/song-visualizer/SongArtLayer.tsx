/**
 * SongArtLayer — per-song poster art with Ken Burns zoom.
 *
 * Visual foundation: intro full-opacity title card (4s), then settles
 * to energy-reactive background wash. Quiet passages: art rises.
 * Peak energy: art fades, shader visuals dominate.
 */

import React from "react";
import { Img, useCurrentFrame, interpolate, Easing } from "remotion";

const ART_FULL_END = 120;      // 4s at 30fps — full opacity title card
const ART_FADE_END = 300;      // 10s — fade to background wash level

interface SongArtProps {
  src: string;
  /** Smooth 0-1 suppression factor: 1 = full art, 0.45 = dimmed for curated media */
  suppressionFactor: number;
  /** Hue rotation in degrees (palette consistency with overlays/scene) */
  hueRotation?: number;
  /** Rolling energy (0-1) for breath modulation */
  energy?: number;
  /** Climax intensity (0-1) — art suppresses further during climax/sustain */
  climaxIntensity?: number;
}

export const SongArtLayer: React.FC<SongArtProps> = ({ src, suppressionFactor, hueRotation = 0, energy = 0, climaxIntensity = 0 }) => {
  const frame = useCurrentFrame();

  // Energy-reactive wash: quiet → 0.35, peak → 0.05
  // Art should vanish during loud passages so shaders dominate
  const energyWash = interpolate(
    energy,
    [0.03, 0.20, 0.40],
    [0.35, 0.12, 0.05],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Base target: full during intro, then settle to energy-reactive wash
  const baseOpacity = interpolate(
    frame,
    [0, ART_FULL_END, ART_FADE_END],
    [1, 1, energyWash],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  // Climax suppression: during climax/sustain, further suppress art
  const climaxSuppression = 1 - climaxIntensity * 0.7;
  const artOpacity = baseOpacity * suppressionFactor * climaxSuppression;

  if (artOpacity < 0.01) return null;

  // Slow Ken Burns zoom + drift throughout
  const scale = interpolate(
    frame,
    [0, ART_FADE_END, ART_FADE_END + 9000],
    [1.0, 1.04, 1.10],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const translateX = interpolate(
    frame,
    [0, ART_FADE_END + 9000],
    [0, -10],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: artOpacity,
        overflow: "hidden",
        filter: hueRotation !== 0 ? `hue-rotate(${hueRotation.toFixed(1)}deg)` : undefined,
      }}
    >
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 55%",
          transform: `scale(${scale}) translateX(${translateX}px)`,
          willChange: "transform",
        }}
      />
      {/* Bottom vignette for text legibility during intro */}
      {frame < ART_FADE_END && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "40%",
            background: "linear-gradient(transparent, rgba(0,0,0,0.6))",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};
