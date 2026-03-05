/**
 * StealieFade — Steal Your Face logo, breathing opacity synced to beat.
 * A subtler, more atmospheric version of BreathingStealie.
 * Appears as a faint watermark that pulses gently with the rhythm.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useSongPalette } from "../data/SongPaletteContext";

function hslString(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const StealieFade: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const palette = useSongPalette();

  const baseSize = Math.min(width, height) * 0.25;

  // Beat-synced breathing — opacity pulses on beat
  const beatOpacity = interpolate(snap.beatDecay, [0, 1], [0.08, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Energy modulates base presence
  const energyOpacity = interpolate(snap.energy, [0.05, 0.3], [0.05, 0.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = Math.max(beatOpacity, energyOpacity);

  // Very slow rotation
  const rotation = (frame / 30) * 1.5;

  // Scale breathes with energy
  const scale = interpolate(snap.energy, [0.03, 0.4], [0.95, 1.05], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const color = hslString(palette.primary, 50, 60);
  const boltColor = hslString(palette.secondary, 60, 55);

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
          transform: `rotate(${rotation}deg) scale(${scale})`,
          opacity,
          filter: `drop-shadow(0 0 30px ${color})`,
          willChange: "transform, opacity",
        }}
      >
        <svg width={baseSize} height={baseSize} viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="94" stroke={color} strokeWidth="4" />
          <path d="M 12 100 A 88 88 0 0 1 188 100" fill={color} opacity="0.1" />
          <line x1="6" y1="100" x2="194" y2="100" stroke={color} strokeWidth="2.5" />
          <polygon
            points="100,12 88,82 108,82 78,188 118,105 96,105 116,12"
            fill={boltColor}
          />
          <circle cx="68" cy="76" r="18" stroke={color} strokeWidth="2.5" />
          <circle cx="132" cy="76" r="18" stroke={color} strokeWidth="2.5" />
        </svg>
      </div>
    </div>
  );
};
