/**
 * EndCard — End-of-show card.
 * Dead Air branding + show details + subscribe CTA on black.
 * Fades in from black, holds, fades out.
 *
 * Duration: 12 seconds (360 frames at 30fps)
 *   - 90 frames fade in (3s)
 *   - 180 frames hold (6s)
 *   - 90 frames fade out (3s)
 */

import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/CormorantGaramond";
import { useShowContext } from "../data/ShowContext";

const { fontFamily: cormorant } = loadFont("normal", {
  weights: ["300", "400", "600"],
  subsets: ["latin"],
});

const FADE_IN = 90;
const HOLD = 180;
const FADE_OUT = 90;

export interface EndCardProps {
  /** Path to Dead Air branding art (relative to public/) */
  brandSrc: string;
  /** Path to show poster art (relative to public/) — unused, kept for compat */
  posterSrc?: string;
  /** Show date */
  date: string;
  /** Venue */
  venue: string;
}

export const EndCard: React.FC<EndCardProps> = ({ brandSrc, date, venue }) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const ctx = useShowContext();

  const total = FADE_IN + HOLD + FADE_OUT;

  // Staggered element fade-ins
  const brandOpacity = interpolate(frame, [0, FADE_IN], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const textOpacity = interpolate(frame, [FADE_IN * 0.4, FADE_IN * 1.2], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const ctaOpacity = interpolate(frame, [FADE_IN * 0.8, FADE_IN * 1.6], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Fade everything out together
  const fadeOut = interpolate(
    frame,
    [FADE_IN + HOLD, total],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Subtle brand zoom
  const brandScale = interpolate(frame, [0, total], [1.0, 1.03], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Thin rule animation
  const ruleWidth = interpolate(frame, [FADE_IN * 0.5, FADE_IN * 1.3], [0, 120], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Brand image */}
      <div
        style={{
          opacity: Math.min(brandOpacity, fadeOut),
          transform: `scale(${brandScale})`,
          marginBottom: 40,
        }}
      >
        <Img
          src={staticFile(brandSrc)}
          style={{
            width: 320,
            height: 320,
            objectFit: "contain",
          }}
        />
      </div>

      {/* Decorative rule */}
      <div
        style={{
          width: ruleWidth,
          height: 1,
          backgroundColor: "rgba(255, 200, 140, 0.35)",
          marginBottom: 32,
          opacity: fadeOut,
        }}
      />

      {/* Show details */}
      <div
        style={{
          opacity: Math.min(textOpacity, fadeOut),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
            fontSize: 30,
            fontWeight: 300,
            color: "rgba(255, 248, 240, 0.85)",
            letterSpacing: "0.05em",
          }}
        >
          {venue}
        </div>
        <div
          style={{
            fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
            fontSize: 24,
            fontWeight: 300,
            color: "rgba(255, 248, 240, 0.6)",
            letterSpacing: "0.08em",
          }}
        >
          {date}
        </div>
      </div>

      {/* CTA */}
      <div
        style={{
          opacity: Math.min(ctaOpacity, fadeOut),
          marginTop: 48,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div
          style={{
            fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
            fontSize: 18,
            fontWeight: 400,
            color: "rgba(255, 200, 140, 0.6)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          Subscribe for more full concerts
        </div>
        <div
          style={{
            fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
            fontSize: 15,
            fontWeight: 300,
            color: "rgba(255, 248, 240, 0.35)",
            letterSpacing: "0.1em",
          }}
        >
          Dead Air — Full {ctx?.bandName ?? "Grateful Dead"} Concerts
        </div>
      </div>
    </div>
  );
};
