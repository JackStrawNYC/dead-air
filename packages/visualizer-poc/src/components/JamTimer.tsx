/**
 * JamTimer — MM:SS elapsed since jam/solo section start.
 * Only displayed when section exceeds 3 minutes.
 * Bottom-right, low opacity, gentle energy pulse. Taper's timestamp feel.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { responsiveFontSize } from "../utils/responsive-text";

interface Props {
  /** Frame where the current jam/solo section started */
  sectionStartFrame: number;
  /** Total duration of this section in frames */
  sectionDurationFrames: number;
  /** Current energy level for subtle pulse */
  energy: number;
}

const MIN_SECTION_FRAMES = 30 * 60 * 3; // 3 minutes at 30fps

export const JamTimer: React.FC<Props> = ({
  sectionStartFrame,
  sectionDurationFrames,
  energy,
}) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  // Only show for sections longer than 3 minutes
  if (sectionDurationFrames < MIN_SECTION_FRAMES) return null;

  const elapsedFrames = frame - sectionStartFrame;
  if (elapsedFrames < 0) return null;

  const elapsedSeconds = Math.floor(elapsedFrames / 30);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeStr = `${minutes}:${String(seconds).padStart(2, "0")}`;

  // Subtle opacity pulse with energy
  const baseOpacity = 0.22;
  const energyPulse = energy * 0.08;
  const opacity = baseOpacity + energyPulse;

  const fontSize = responsiveFontSize(14, height);

  return (
    <div
      style={{
        position: "absolute",
        bottom: responsiveFontSize(28, height),
        right: responsiveFontSize(28, height),
        opacity,
        fontFamily: "'Courier New', Courier, monospace",
        fontSize,
        color: "rgba(255, 255, 255, 0.9)",
        letterSpacing: "0.08em",
        textShadow: "0 1px 3px rgba(0,0,0,0.6)",
        pointerEvents: "none",
      }}
    >
      {timeStr}
    </div>
  );
};
