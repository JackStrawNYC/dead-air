/**
 * TourIntroCard — Remotion composition for tour highlight reel intro.
 * Shows tour name, date range, and show count.
 * Follows ChapterCard aesthetic: elegant serif on black.
 *
 * Duration: 8 seconds (240 frames at 30fps)
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

const FADE_IN = 60;    // 2s
const HOLD = 120;      // 4s
const FADE_OUT = 60;   // 2s

export interface TourIntroCardProps {
  /** Tour name (e.g., "Spring 1977") */
  tourName: string;
  /** Date range (e.g., "April 22 - May 28, 1977") */
  dateRange: string;
  /** Number of shows in the tour */
  showCount: number;
  /** Band name (default: "Grateful Dead") */
  bandName?: string;
}

export const TourIntroCard: React.FC<TourIntroCardProps> = ({
  tourName,
  dateRange,
  showCount,
  bandName = "Grateful Dead",
}) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const total = FADE_IN + HOLD + FADE_OUT;

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

  const scale = interpolate(
    frame,
    [0, FADE_IN],
    [0.95, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
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
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
      }}
    >
      {/* Band name */}
      <div
        style={{
          color: "rgba(255, 255, 255, 0.4)",
          fontSize: 18,
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 400,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          marginBottom: 24,
        }}
      >
        {bandName}
      </div>

      {/* Tour name */}
      <div
        style={{
          color: "rgba(255, 255, 255, 0.9)",
          fontSize: 56,
          fontFamily: "'Playfair Display', Georgia, serif",
          fontWeight: 600,
          textShadow: "0 2px 30px rgba(0,0,0,0.5)",
          marginBottom: 16,
        }}
      >
        {tourName}
      </div>

      {/* Date range */}
      <div
        style={{
          color: "rgba(255, 255, 255, 0.55)",
          fontSize: 22,
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 300,
          fontStyle: "italic",
          marginBottom: 32,
        }}
      >
        {dateRange}
      </div>

      {/* Show count */}
      <div
        style={{
          color: "rgba(255, 255, 255, 0.3)",
          fontSize: 15,
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 400,
          letterSpacing: "0.15em",
        }}
      >
        {showCount} show{showCount !== 1 ? "s" : ""} · highlights
      </div>
    </div>
  );
};
