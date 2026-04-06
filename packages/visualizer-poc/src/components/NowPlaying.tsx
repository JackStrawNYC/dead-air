import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/CormorantGaramond";
import { responsiveFontSize, responsiveSize } from "../utils/responsive-text";
import { useSongPalette } from "../data/SongPaletteContext";

const { fontFamily: cormorant } = loadFont("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin"],
});

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
  const palette = useSongPalette();

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

  // Subtle palette accent — thin left border in palette primary color
  const accentColor = `hsla(${palette.primary}, 60%, 55%, ${0.5 * fadeIn})`;

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
        background: "rgba(0, 0, 0, 0.65)",
        padding: `${backdropPad}px ${backdropPad * 1.8}px`,
        borderLeft: `${Math.round(3 * (height / 1080))}px solid ${accentColor}`,
        maxWidth: `${94 - padding}%`,
      }}
    >
      <div
        style={{
          fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
          fontSize: titleSize,
          fontWeight: 600,
          color: "rgba(255, 255, 255, 0.95)",
          textShadow: "0 1px 3px rgba(0,0,0,0.5)",
          letterSpacing: "0.02em",
        }}
      >
        {title}
      </div>
      {artist && (
        <div
          style={{
            fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
            fontSize: artistSize,
            fontWeight: 400,
            color: "rgba(255, 255, 255, 0.6)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {artist}
        </div>
      )}
    </div>
  );
};
