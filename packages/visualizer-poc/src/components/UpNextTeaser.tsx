/**
 * UpNextTeaser — "Up Next: Scarlet Begonias"
 * Shown in last 15s of song, bottom-center.
 * Suppressed during segues and on last song of set.
 * Italic Cormorant Garamond, max opacity 0.30.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { responsiveFontSize } from "../utils/responsive-text";

interface Props {
  /** Title of the next song */
  nextSongTitle: string;
  /** Whether current song segues into next */
  isSegue: boolean;
  /** Whether this is the last song in the set */
  isLastInSet: boolean;
}

const TEASER_DURATION = 450; // 15 seconds at 30fps
const FADE_FRAMES = 60;     // 2 second fade

export const UpNextTeaser: React.FC<Props> = ({
  nextSongTitle,
  isSegue,
  isLastInSet,
}) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  // Suppress during segues and on last song of set
  if (isSegue || isLastInSet) return null;

  const teaserStart = durationInFrames - TEASER_DURATION;

  if (frame < teaserStart) return null;

  const relFrame = frame - teaserStart;

  const opacity = interpolate(
    relFrame,
    [0, FADE_FRAMES, TEASER_DURATION - FADE_FRAMES, TEASER_DURATION],
    [0, 0.30, 0.30, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  if (opacity < 0.01) return null;

  const fontSize = responsiveFontSize(18, height);

  return (
    <div
      style={{
        position: "absolute",
        bottom: responsiveFontSize(48, height),
        left: 0,
        right: 0,
        textAlign: "center",
        opacity,
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontStyle: "italic",
        fontSize,
        color: "rgba(255, 255, 255, 0.85)",
        letterSpacing: "0.05em",
        textShadow: "0 1px 4px rgba(0,0,0,0.5)",
        pointerEvents: "none",
      }}
    >
      Up Next: {nextSongTitle}
    </div>
  );
};
