/**
 * SongDNA — Frosted glass stats card displayed at song start.
 * Shows times played, date range, and notable facts.
 *
 * Appears at frame 30, holds until frame 240, then fades out.
 * Spring-animated slide-in from the right.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/CormorantGaramond";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily: cormorant } = loadFont("normal", {
  weights: ["300", "400", "600"],
  subsets: ["latin"],
});

const { fontFamily: mono } = loadMono("normal", {
  weights: ["300", "400"],
  subsets: ["latin"],
});

export interface SongStats {
  title: string;
  timesPlayed: number | null;
  firstPlayed: string;
  lastPlayed: string;
  notable?: string;
}

export interface SongDNAProps {
  stats: SongStats | null;
  colorAccent?: string;
}

const APPEAR_FRAME = 540;  // 18s — spaced from ConcertInfo (gone by 12s) and title
const HOLD_END = 720;       // 24s — holds for 6 seconds
const FADE_DURATION = 30;   // 1s fade out

export const SongDNA: React.FC<SongDNAProps> = ({
  stats,
  colorAccent = "#d4a853",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!stats || stats.timesPlayed === null) return null;

  // Spring slide-in from right
  const slideProgress = spring({
    frame: Math.max(0, frame - APPEAR_FRAME),
    fps,
    config: { damping: 18, mass: 0.6, stiffness: 100 },
  });

  const translateX = interpolate(slideProgress, [0, 1], [40, 0]);

  // Fade out
  const fadeOut = interpolate(
    frame,
    [HOLD_END, HOLD_END + FADE_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Don't render before appearance or after full fade
  if (frame < APPEAR_FRAME - 5 || fadeOut <= 0) return null;

  const opacity = slideProgress * fadeOut * 0.70;

  return (
    <div
      style={{
        position: "absolute",
        top: 100,
        right: 80,
        opacity,
        transform: `translateX(${translateX}px)`,
        pointerEvents: "none",
        zIndex: 90,
      }}
    >
      <div
        style={{
          minWidth: 200,
          maxWidth: 320,
          padding: "16px 22px",
          background: "rgba(10, 10, 10, 0.25)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderLeft: `2px solid ${colorAccent}`,
          borderRadius: 2,
        }}
      >
        {/* Label */}
        <div
          style={{
            fontFamily: `${mono}, monospace`,
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "rgba(160, 152, 136, 0.8)",
            marginBottom: 10,
          }}
        >
          Song DNA
        </div>

        {/* Times played */}
        <div
          style={{
            fontFamily: `${cormorant}, Georgia, serif`,
            fontSize: 26,
            fontWeight: 600,
            color: "rgba(245, 240, 232, 0.95)",
            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
            lineHeight: 1.2,
          }}
        >
          Played {stats.timesPlayed} times
        </div>

        {/* Date range */}
        <div
          style={{
            fontFamily: `${mono}, monospace`,
            fontSize: 14,
            fontWeight: 300,
            color: "rgba(160, 152, 136, 0.7)",
            marginTop: 6,
            letterSpacing: 1,
          }}
        >
          {stats.firstPlayed} — {stats.lastPlayed}
        </div>

        {/* Notable fact */}
        {stats.notable && (
          <div
            style={{
              fontFamily: `${cormorant}, Georgia, serif`,
              fontSize: 15,
              fontWeight: 300,
              fontStyle: "italic",
              color: colorAccent,
              marginTop: 10,
              lineHeight: 1.4,
              opacity: 0.85,
            }}
          >
            {stats.notable}
          </div>
        )}
      </div>
    </div>
  );
};
