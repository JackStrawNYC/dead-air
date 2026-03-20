/**
 * ListenFor — Frosted glass card showing "listen for" moments.
 * Appears at ~20s into each song (after SongDNA fades out at 19s).
 * Bottom-right positioning, similar style to SongDNA.
 *
 * Shows up to 2 bullet points: "Listen for the key change at 3:42"
 * Fades in over 1s, holds 6s, fades out over 1s.
 * Uses useSongPalette() for accent color.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/CormorantGaramond";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { useSongPalette } from "../data/SongPaletteContext";

const { fontFamily: cormorant } = loadFont("normal", {
  weights: ["300", "400"],
  subsets: ["latin"],
});

const { fontFamily: mono } = loadMono("normal", {
  weights: ["300", "400"],
  subsets: ["latin"],
});

export interface ListenForProps {
  /** 2-3 moments to listen for */
  items: string[];
  /** Optional context line (e.g., song history) */
  context?: string;
  /** Track number within the set — only show for first song per set */
  trackNumberInSet?: number;
}

const APPEAR_FRAME = 600;  // 20s — after SongDNA fades out (19s)
const HOLD_END = 780;       // 26s — holds for 6 seconds
const FADE_DURATION = 30;   // 1s fade out

export const ListenFor: React.FC<ListenForProps> = ({ items, context, trackNumberInSet }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  // Resolution scaling (designed at 1080p)
  const s = height / 1080;
  const palette = useSongPalette();

  if (items.length === 0) return null;

  // Only show for the first song in each set — don't break immersion every song
  if (trackNumberInSet !== undefined && trackNumberInSet > 1) return null;

  // Cap at 2 items for readability
  const displayItems = items.slice(0, 2);

  const accent = `hsl(${palette.primary}, 55%, 65%)`;

  // Spring slide-in from right (matching SongDNA pattern)
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

  if (frame < APPEAR_FRAME - 5 || fadeOut <= 0) return null;

  const opacity = slideProgress * fadeOut;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 140 * s,
        right: 80 * s,
        opacity,
        transform: `translateX(${translateX}px)`,
        pointerEvents: "none",
        zIndex: 90,
      }}
    >
      <div
        style={{
          minWidth: 240 * s,
          maxWidth: 380 * s,
          padding: `${16 * s}px ${22 * s}px`,
          background: "rgba(10, 10, 10, 0.25)",
          backdropFilter: `blur(${12 * s}px)`,
          WebkitBackdropFilter: `blur(${12 * s}px)`,
          borderLeft: `${3 * s}px solid ${accent}`,
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
          Listen For
        </div>

        {/* Bullet items */}
        {displayItems.map((item, i) => (
          <div
            key={i}
            style={{
              fontFamily: `${cormorant}, Georgia, serif`,
              fontSize: 16 * s,
              fontWeight: 300,
              color: "rgba(240, 235, 225, 0.9)",
              textShadow: `0 ${2 * s}px ${6 * s}px rgba(0,0,0,0.5)`,
              lineHeight: 1.45,
              marginBottom: i < displayItems.length - 1 ? 8 * s : 0,
              paddingLeft: 14 * s,
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                color: accent,
                opacity: 0.7,
              }}
            >
              ›
            </span>
            {item}
          </div>
        ))}

        {/* Optional context */}
        {context && (
          <div
            style={{
              fontFamily: `${cormorant}, Georgia, serif`,
              fontSize: 14 * s,
              fontWeight: 300,
              fontStyle: "italic",
              color: accent,
              marginTop: 12 * s,
              lineHeight: 1.4,
              opacity: 0.75,
            }}
          >
            {context}
          </div>
        )}
      </div>
    </div>
  );
};
