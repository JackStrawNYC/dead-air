/**
 * SetBreakCard — Cinematic interstitial between sets.
 * Elegant text on black with venue context. Feels like a chapter break
 * in a documentary, not just dead air.
 *
 * Duration: 10 seconds (300 frames at 30fps)
 *   - 60 frames fade in (2s)
 *   - 180 frames hold (6s)
 *   - 60 frames fade out (2s)
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/CormorantGaramond";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily: cormorant } = loadFont("normal", {
  weights: ["300", "400", "600"],
  subsets: ["latin"],
});

const { fontFamily: mono } = loadMono("normal", {
  weights: ["300"],
  subsets: ["latin"],
});

const FADE_IN = 60;    // 2s
const HOLD = 180;      // 6s
const FADE_OUT = 60;   // 2s

export interface SetBreakCardProps {
  /** Venue name */
  venue?: string;
  /** Show date string */
  date?: string;
  /** Set number just completed */
  setNumber?: number;
}

export const SetBreakCard: React.FC<SetBreakCardProps> = ({
  venue,
  date,
  setNumber = 1,
}) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  const total = FADE_IN + HOLD + FADE_OUT;

  // Main opacity envelope
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

  // "SET BREAK" text fades in first
  const titleOpacity = interpolate(
    frame,
    [0, FADE_IN * 0.6],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Venue/date text fades in slightly after
  const detailOpacity = interpolate(
    frame,
    [FADE_IN * 0.4, FADE_IN * 1.2],
    [0, 0.7],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Decorative rule width animates
  const ruleWidth = interpolate(
    frame,
    [FADE_IN * 0.5, FADE_IN + 30],
    [0, 80],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  // Subtle vertical drift
  const translateY = interpolate(
    frame,
    [0, total],
    [8, -8],
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
          gap: 20,
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
      >
        {/* SET BREAK header */}
        <div
          style={{
            fontFamily: `${mono}, monospace`,
            fontSize: 14,
            fontWeight: 300,
            color: "rgba(255, 200, 140, 0.5)",
            letterSpacing: 8,
            textTransform: "uppercase",
            opacity: titleOpacity,
          }}
        >
          Set {setNumber} Complete
        </div>

        {/* Decorative rule */}
        <div
          style={{
            width: ruleWidth,
            height: 1,
            backgroundColor: "rgba(255, 200, 140, 0.3)",
          }}
        />

        {/* INTERMISSION */}
        <div
          style={{
            fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
            fontSize: 42,
            fontWeight: 300,
            color: "rgba(255, 248, 240, 0.85)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            opacity: titleOpacity,
          }}
        >
          Intermission
        </div>

        {/* Decorative rule */}
        <div
          style={{
            width: ruleWidth,
            height: 1,
            backgroundColor: "rgba(255, 200, 140, 0.3)",
          }}
        />

        {/* Venue + date */}
        {(venue || date) && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
              opacity: detailOpacity,
            }}
          >
            {venue && (
              <div
                style={{
                  fontFamily: `${cormorant}, Georgia, serif`,
                  fontSize: 20,
                  fontWeight: 400,
                  color: "rgba(255, 248, 240, 0.6)",
                  letterSpacing: 3,
                  textAlign: "center",
                }}
              >
                {venue}
              </div>
            )}
            {date && (
              <div
                style={{
                  fontFamily: `${mono}, monospace`,
                  fontSize: 13,
                  fontWeight: 300,
                  color: "rgba(255, 248, 240, 0.4)",
                  letterSpacing: 4,
                  textAlign: "center",
                }}
              >
                {date}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
