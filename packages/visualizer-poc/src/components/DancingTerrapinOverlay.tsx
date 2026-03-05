/**
 * DancingTerrapinOverlay — Terrapin Station turtle, gentle rotation.
 * A turtle silhouette that slowly spins and bobs with the music.
 * Contemplative, cosmic presence — perfect for quieter passages.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useSongPalette } from "../data/SongPaletteContext";
import { useTempoFactor } from "../data/TempoContext";

interface Props {
  frames: EnhancedFrameData[];
}

export const DancingTerrapinOverlay: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const palette = useSongPalette();
  const tempoFactor = useTempoFactor();

  const baseSize = Math.min(width, height) * 0.16;
  const t = frame / 30;

  // Gentle rotation — tempo-scaled
  const rotation = t * 4 * tempoFactor;

  // Bobbing motion — up and down with bass
  const bob = Math.sin(t * 1.5 * tempoFactor) * 8 + snap.bass * 5;

  // Scale breathing
  const scale = interpolate(snap.energy, [0.03, 0.3], [0.9, 1.05], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Opacity — quiet atmospheric presence
  const opacity = interpolate(snap.energy, [0.02, 0.2], [0.12, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const shellColor = `hsl(${palette.primary}, 45%, 55%)`;
  const bodyColor = `hsl(${palette.secondary}, 35%, 45%)`;
  const glowColor = `hsl(${palette.primary}, 50%, 40%)`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transform: `rotate(${rotation}deg) scale(${scale}) translateY(${bob}px)`,
          opacity,
          filter: `drop-shadow(0 0 20px ${glowColor})`,
          willChange: "transform, opacity",
        }}
      >
        <svg width={baseSize} height={baseSize} viewBox="0 0 200 200" fill="none">
          {/* Shell — domed hexagonal pattern */}
          <ellipse cx="100" cy="95" rx="55" ry="45" fill={shellColor} opacity="0.4" />
          <ellipse cx="100" cy="95" rx="55" ry="45" stroke={shellColor} strokeWidth="2.5" />
          {/* Shell pattern — hexagonal segments */}
          <path d="M 55 95 L 100 60 L 145 95" stroke={shellColor} strokeWidth="1.5" opacity="0.5" />
          <path d="M 65 115 L 100 95 L 135 115" stroke={shellColor} strokeWidth="1.5" opacity="0.5" />
          <line x1="100" y1="60" x2="100" y2="130" stroke={shellColor} strokeWidth="1" opacity="0.3" />
          <line x1="70" y1="75" x2="70" y2="115" stroke={shellColor} strokeWidth="1" opacity="0.3" />
          <line x1="130" y1="75" x2="130" y2="115" stroke={shellColor} strokeWidth="1" opacity="0.3" />
          {/* Head */}
          <ellipse cx="100" cy="48" rx="12" ry="10" fill={bodyColor} opacity="0.5" />
          <circle cx="95" cy="45" r="2" fill={bodyColor} opacity="0.7" />
          <circle cx="105" cy="45" r="2" fill={bodyColor} opacity="0.7" />
          {/* Flippers */}
          <ellipse cx="50" cy="85" rx="18" ry="8" fill={bodyColor} opacity="0.4" transform="rotate(-25 50 85)" />
          <ellipse cx="150" cy="85" rx="18" ry="8" fill={bodyColor} opacity="0.4" transform="rotate(25 150 85)" />
          <ellipse cx="55" cy="120" rx="15" ry="7" fill={bodyColor} opacity="0.4" transform="rotate(15 55 120)" />
          <ellipse cx="145" cy="120" rx="15" ry="7" fill={bodyColor} opacity="0.4" transform="rotate(-15 145 120)" />
          {/* Tail */}
          <path d="M 100 140 Q 105 155, 100 160" stroke={bodyColor} strokeWidth="2" opacity="0.4" />
        </svg>
      </div>
    </div>
  );
};
