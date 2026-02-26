/**
 * ChapterCard — Documentary-style title card between songs.
 * Elegant serif typography on black. Fades in, holds, fades out.
 * Feels like a chapter header in a book about the night.
 *
 * Duration: 6 seconds (180 frames at 30fps)
 *   - 45 frames fade in (1.5s)
 *   - 90 frames hold (3s)
 *   - 45 frames fade out (1.5s)
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/CormorantGaramond";

const { fontFamily: cormorant } = loadFont("normal", {
  weights: ["300", "400"],
  subsets: ["latin"],
});

const FADE_IN = 45;    // 1.5s
const HOLD = 90;       // 3s
const FADE_OUT = 45;   // 1.5s

export interface ChapterCardProps {
  /** The chapter text — one or two sentences max */
  text: string;
}

export const ChapterCard: React.FC<ChapterCardProps> = ({ text }) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  const total = FADE_IN + HOLD + FADE_OUT;

  // Opacity: fade in → hold → fade out
  const opacity = interpolate(
    frame,
    [0, FADE_IN, FADE_IN + HOLD, total],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    },
  );

  // Subtle vertical drift upward (barely perceptible)
  const translateY = interpolate(
    frame,
    [0, total],
    [6, -6],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Thin decorative rule fades in slightly after text
  const ruleOpacity = interpolate(
    frame,
    [FADE_IN * 0.6, FADE_IN * 1.2, FADE_IN + HOLD, total],
    [0, 0.3, 0.3, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: width * 0.65,
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
      >
        {/* Decorative rule above */}
        <div
          style={{
            width: 60,
            height: 1,
            backgroundColor: "rgba(255, 200, 140, 0.4)",
            marginBottom: 32,
            opacity: ruleOpacity,
          }}
        />

        {/* Chapter text */}
        <div
          style={{
            color: "rgba(255, 248, 240, 0.88)",
            fontSize: 36,
            fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
            fontWeight: 300,
            lineHeight: 1.7,
            textAlign: "center",
            letterSpacing: "0.02em",
          }}
        >
          {text}
        </div>

        {/* Decorative rule below */}
        <div
          style={{
            width: 60,
            height: 1,
            backgroundColor: "rgba(255, 200, 140, 0.4)",
            marginTop: 32,
            opacity: ruleOpacity,
          }}
        />
      </div>
    </div>
  );
};
