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

  const backdropPad = responsiveSize(12, height);

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
        gap: responsiveSize(2, height),
        background: "linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 100%)",
        padding: `${backdropPad}px ${backdropPad * 1.5}px`,
        borderRadius: responsiveSize(4, height),
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
          fontSize: titleSize,
          fontWeight: 700,
          color: "rgba(255, 255, 255, 1.0)",
          textShadow: "0 2px 4px rgba(0,0,0,0.6)",
          letterSpacing: "0.01em",
        }}
      >
        {title}
      </div>
      {artist && (
        <div
          style={{
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
            fontSize: artistSize,
            fontWeight: 400,
            color: "rgba(255, 255, 255, 0.85)",
            letterSpacing: "0.02em",
          }}
        >
          {artist}
        </div>
      )}
    </div>
  );
};
