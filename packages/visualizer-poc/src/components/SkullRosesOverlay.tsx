/**
 * SkullRosesOverlay — Skull & Roses album art homage.
 * A skull silhouette wreathed in roses, gentle breathing animation.
 * Contemplative presence for mid/low energy passages.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useSongPalette } from "../data/SongPaletteContext";

interface Props {
  frames: EnhancedFrameData[];
}

export const SkullRosesOverlay: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const palette = useSongPalette();

  const baseSize = Math.min(width, height) * 0.22;

  // Gentle breathing scale
  const breathe = 1 + Math.sin(frame / 30 * 0.5) * 0.02 + snap.energy * 0.03;

  // Opacity — subtle presence
  const opacity = interpolate(snap.energy, [0.02, 0.25], [0.12, 0.28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const skullColor = `hsl(${palette.primary}, 20%, 70%)`;
  const roseColor = `hsl(${(palette.primary + 180) % 360}, 60%, 45%)`;
  const glowColor = `hsl(${palette.primary}, 40%, 50%)`;

  // Very slow rotation
  const rotation = Math.sin(frame / 30 * 0.3) * 3;

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
          transform: `rotate(${rotation}deg) scale(${breathe})`,
          opacity,
          filter: `drop-shadow(0 0 20px ${glowColor})`,
          willChange: "transform, opacity",
        }}
      >
        <svg width={baseSize} height={baseSize} viewBox="0 0 200 200" fill="none">
          {/* Skull outline */}
          <ellipse cx="100" cy="85" rx="50" ry="55" stroke={skullColor} strokeWidth="2.5" fill="none" />
          {/* Jaw */}
          <path
            d="M 60 100 Q 60 140, 100 145 Q 140 140, 140 100"
            stroke={skullColor}
            strokeWidth="2"
            fill="none"
          />
          {/* Eye sockets */}
          <ellipse cx="80" cy="75" rx="14" ry="16" fill={skullColor} opacity="0.2" />
          <ellipse cx="120" cy="75" rx="14" ry="16" fill={skullColor} opacity="0.2" />
          {/* Nose */}
          <path d="M 97 90 L 100 100 L 103 90" stroke={skullColor} strokeWidth="1.5" fill="none" />
          {/* Teeth */}
          {[80, 90, 100, 110, 120].map((x) => (
            <line key={x} x1={x} y1="115" x2={x} y2="125" stroke={skullColor} strokeWidth="1.5" />
          ))}
          {/* Rose wreath — scattered around skull */}
          {[
            { cx: 40, cy: 70, r: 12 },
            { cx: 35, cy: 100, r: 10 },
            { cx: 50, cy: 130, r: 11 },
            { cx: 160, cy: 70, r: 12 },
            { cx: 165, cy: 100, r: 10 },
            { cx: 150, cy: 130, r: 11 },
            { cx: 75, cy: 155, r: 9 },
            { cx: 125, cy: 155, r: 9 },
            { cx: 100, cy: 160, r: 10 },
          ].map((rose, i) => (
            <g key={i}>
              <circle cx={rose.cx} cy={rose.cy} r={rose.r} fill={roseColor} opacity="0.6" />
              <circle cx={rose.cx} cy={rose.cy} r={rose.r * 0.5} fill={roseColor} opacity="0.8" />
            </g>
          ))}
          {/* Vine connections */}
          <path
            d="M 40 82 Q 35 95, 35 100 Q 35 115, 50 130 Q 60 142, 75 155 Q 88 162, 100 160 Q 112 162, 125 155 Q 140 142, 150 130 Q 165 115, 165 100 Q 165 95, 160 82"
            stroke={roseColor}
            strokeWidth="1.5"
            fill="none"
            opacity="0.4"
          />
        </svg>
      </div>
    </div>
  );
};
