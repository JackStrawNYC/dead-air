import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { responsiveFontSize, responsiveSize } from "../utils/responsive-text";

interface Props {
  title: string;
  artist?: string;
  energy?: number;
  /** Sacred segue: delay appearance to 40s with gentler fade */
  isSacredSegue?: boolean;
}

export const NowPlaying: React.FC<Props> = ({ title, artist, energy = 0, isSacredSegue }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  // Sacred segues: delay to frame 1200 (40s) with 120-frame fade
  // Normal: appear at frame 300 with 90-frame fade
  const fadeStart = isSacredSegue ? 1200 : 300;
  const fadeDuration = isSacredSegue ? 120 : 90;

  const fadeIn = interpolate(frame, [fadeStart, fadeStart + fadeDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  if (fadeIn < 0.01) return null;

  // Base opacity — clearly readable against any shader
  const baseOpacity = 0.85;
  const energyPulse = energy * 0.05;
  const opacity = Math.min(0.95, (baseOpacity + energyPulse) * fadeIn);

  const titleSize = responsiveFontSize(38, height);
  const artistSize = responsiveFontSize(22, height);
  const padding = responsiveSize(3, height);

  return (
    <div
      style={{
        position: "absolute",
        bottom: `${padding}%`,
        left: `${padding}%`,
        opacity,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        gap: responsiveSize(4, height),
      }}
    >
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: titleSize,
          fontWeight: 600,
          color: "rgba(255, 255, 255, 0.95)",
          textShadow: "0 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)",
          letterSpacing: "0.02em",
        }}
      >
        {title}
      </div>
      {artist && (
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: artistSize,
            fontWeight: 400,
            color: "rgba(255, 255, 255, 0.75)",
            textShadow: "0 1px 3px rgba(0,0,0,0.5)",
            letterSpacing: "0.03em",
            fontStyle: "italic",
          }}
        >
          {artist}
        </div>
      )}
    </div>
  );
};
