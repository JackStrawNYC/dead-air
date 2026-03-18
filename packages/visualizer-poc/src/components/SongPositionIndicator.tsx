/**
 * SongPositionIndicator — "Set II - Song 3 of 5"
 * Top-left, Cormorant Garamond, low opacity. Fades in at frame 180,
 * visible for 300 frames, then fades out.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { useShowContext } from "../data/ShowContext";
import { responsiveFontSize } from "../utils/responsive-text";

interface Props {
  setNumber: number;
  trackNumber: number;
  totalSongsInSet: number;
}

const SET_LABELS: Record<number, string> = {
  1: "Set I",
  2: "Set II",
  3: "Encore",
};

export const SongPositionIndicator: React.FC<Props> = ({
  setNumber,
  trackNumber,
  totalSongsInSet,
}) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  const FADE_IN_START = 180;   // 6s
  const FADE_IN_END = 210;     // 7s
  const VISIBLE_END = 480;     // 16s
  const FADE_OUT_END = 540;    // 18s

  const opacity = interpolate(
    frame,
    [FADE_IN_START, FADE_IN_END, VISIBLE_END, FADE_OUT_END],
    [0, 0.30, 0.30, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  if (opacity < 0.01) return null;

  const setLabel = SET_LABELS[setNumber] ?? `Set ${setNumber}`;
  const text = `${setLabel} \u2014 Song ${trackNumber} of ${totalSongsInSet}`;
  const fontSize = responsiveFontSize(16, height);

  return (
    <div
      style={{
        position: "absolute",
        top: responsiveFontSize(24, height),
        left: responsiveFontSize(28, height),
        opacity,
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize,
        color: "rgba(255, 255, 255, 0.85)",
        letterSpacing: "0.06em",
        textShadow: "0 1px 4px rgba(0,0,0,0.5)",
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
};
