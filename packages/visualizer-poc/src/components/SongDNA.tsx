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
  gapShows?: number;
  lastPlayedDate?: string;
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
  const { fps, height } = useVideoConfig();

  // Resolution scaling (designed at 1080p)
  const s = height / 1080;

  if (!stats || stats.timesPlayed === null) return null;

  // Spring slide-in from right
  const slideProgress = spring({
    frame: Math.max(0, frame - APPEAR_FRAME),
    fps,
    config: { damping: 18, mass: 0.6, stiffness: 100 },
  });

  const translateX = interpolate(slideProgress, [0, 1], [40 * s, 0]);

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
        top: 100 * s,
        right: 80 * s,
        opacity,
        transform: `translateX(${translateX}px)`,
        pointerEvents: "none",
        zIndex: 90,
      }}
    >
      <div
        style={{
          minWidth: 200 * s,
          maxWidth: 320 * s,
          padding: `${16 * s}px ${22 * s}px`,
          background: "rgba(10, 10, 10, 0.25)",
          backdropFilter: `blur(${8 * s}px)`,
          WebkitBackdropFilter: `blur(${8 * s}px)`,
          borderLeft: `${2 * s}px solid ${colorAccent}`,
          borderRadius: 2 * s,
        }}
      >
        {/* Label */}
        <div
          style={{
            fontFamily: `${mono}, monospace`,
            fontSize: 11 * s,
            fontWeight: 400,
            letterSpacing: 4 * s,
            textTransform: "uppercase",
            color: "rgba(160, 152, 136, 0.8)",
            marginBottom: 10 * s,
          }}
        >
          Song DNA
        </div>

        {/* Times played */}
        <div
          style={{
            fontFamily: `${cormorant}, Georgia, serif`,
            fontSize: 26 * s,
            fontWeight: 600,
            color: "rgba(245, 240, 232, 0.95)",
            textShadow: `0 ${2 * s}px ${8 * s}px rgba(0,0,0,0.6)`,
            lineHeight: 1.2,
          }}
        >
          Played {stats.timesPlayed} times
        </div>

        {/* Date range */}
        <div
          style={{
            fontFamily: `${mono}, monospace`,
            fontSize: 14 * s,
            fontWeight: 300,
            color: "rgba(160, 152, 136, 0.7)",
            marginTop: 6 * s,
            letterSpacing: 1 * s,
          }}
        >
          {stats.firstPlayed} — {stats.lastPlayed}
        </div>

        {/* Gap count / Bustout badge */}
        {stats.gapShows != null && stats.gapShows > 0 && (
          <div
            style={{
              fontFamily: `${mono}, monospace`,
              fontSize: (stats.gapShows >= 50 ? 13 : 12) * s,
              fontWeight: stats.gapShows >= 50 ? 400 : 300,
              color: stats.gapShows >= 50
                ? "#f5c842"
                : "rgba(200, 190, 170, 0.8)",
              marginTop: 8 * s,
              letterSpacing: (stats.gapShows >= 50 ? 3 : 1) * s,
              textTransform: "uppercase",
              ...(stats.gapShows >= 50 ? {
                padding: `${4 * s}px ${10 * s}px`,
                border: `${1 * s}px solid rgba(245, 200, 66, 0.6)`,
                borderRadius: 2 * s,
                boxShadow: `0 0 ${(8 + Math.sin(frame * 0.08) * 4) * s}px rgba(245, 200, 66, ${0.25 + Math.sin(frame * 0.08) * 0.15})`,
                textShadow: `0 0 ${8 * s}px rgba(245, 200, 66, 0.5)`,
                display: "inline-block",
              } : {}),
            }}
          >
            {stats.gapShows >= 50
              ? `BUSTOUT — ${stats.gapShows} show gap`
              : `${stats.gapShows} show gap`}
          </div>
        )}

        {/* Notable fact */}
        {stats.notable && (
          <div
            style={{
              fontFamily: `${cormorant}, Georgia, serif`,
              fontSize: 15 * s,
              fontWeight: 300,
              fontStyle: "italic",
              color: colorAccent,
              marginTop: 10 * s,
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
