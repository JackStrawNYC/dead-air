/**
 * SongTitle — DOM overlay that shows song title at the start of each track.
 * Fades in over 30 frames, holds for 120 frames, fades out over 30 frames.
 */

import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

interface Props {
  title: string;
  setNumber: number;
  trackNumber: number;
}

const FADE_IN = 30;
const HOLD = 120;
const FADE_OUT = 30;
const TOTAL = FADE_IN + HOLD + FADE_OUT;

export const SongTitle: React.FC<Props> = ({ title, setNumber, trackNumber }) => {
  const frame = useCurrentFrame();

  if (frame >= TOTAL) return null;

  const opacity = interpolate(
    frame,
    [0, FADE_IN, FADE_IN + HOLD, TOTAL],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const translateY = interpolate(
    frame,
    [0, FADE_IN],
    [10, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 150,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity,
        transform: `translateY(${translateY}px)`,
        pointerEvents: "none",
        zIndex: 100,
      }}
    >
      <div
        style={{
          color: "rgba(255, 255, 255, 0.4)",
          fontSize: 16,
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 400,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Set {setNumber} · Track {trackNumber}
      </div>
      <div
        style={{
          color: "rgba(255, 255, 255, 0.85)",
          fontSize: 42,
          fontFamily: "'Playfair Display', Georgia, serif",
          fontWeight: 600,
          textShadow: "0 2px 20px rgba(0,0,0,0.8)",
        }}
      >
        {title}
      </div>
    </div>
  );
};
