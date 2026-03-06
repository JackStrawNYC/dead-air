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
}

const APPEAR_FRAME = 600;  // 20s — after SongDNA fades out (19s)
const HOLD_END = 780;       // 26s — holds for 6 seconds
const FADE_DURATION = 30;   // 1s fade out

export const ListenFor: React.FC<ListenForProps> = ({ items, context }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palette = useSongPalette();

  if (items.length === 0) return null;

  // Cap at 2 items for readability
  const displayItems = items.slice(0, 2);

  const accent = `hsl(${palette.primary}, 55%, 65%)`;

  // Spring slide-in from right (matching SongDNA pattern)
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

  if (frame < APPEAR_FRAME - 5 || fadeOut <= 0) return null;

  const opacity = slideProgress * fadeOut;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 140,
        right: 80,
        opacity,
        transform: `translateX(${translateX}px)`,
        pointerEvents: "none",
        zIndex: 90,
      }}
    >
      <div
        style={{
          minWidth: 240,
          maxWidth: 380,
          padding: "16px 22px",
          background: "rgba(10, 10, 10, 0.5)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderLeft: `3px solid ${accent}`,
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
          Listen For
        </div>

        {/* Bullet items */}
        {displayItems.map((item, i) => (
          <div
            key={i}
            style={{
              fontFamily: `${cormorant}, Georgia, serif`,
              fontSize: 16,
              fontWeight: 300,
              color: "rgba(240, 235, 225, 0.9)",
              textShadow: "0 2px 6px rgba(0,0,0,0.5)",
              lineHeight: 1.45,
              marginBottom: i < displayItems.length - 1 ? 8 : 0,
              paddingLeft: 14,
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
              fontSize: 14,
              fontWeight: 300,
              fontStyle: "italic",
              color: accent,
              marginTop: 12,
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
