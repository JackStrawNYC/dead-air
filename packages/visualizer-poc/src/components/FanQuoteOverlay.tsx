/**
 * FanQuoteOverlay — frosted glass card showing archive.org fan reviews.
 *
 * Appears at frame 900 (30s in), holds 11s, spring slide-in from bottom.
 * Only shown every 3rd song (trackNumber % 3 === 0) to avoid fatigue.
 * Seed-based review selection for generative variation.
 */

import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";

export interface FanReview {
  text: string;
  reviewer: string;
  stars?: number;
}

interface Props {
  reviews: FanReview[];
  trackNumber: number;
  /** PRNG seed for review selection */
  seed?: number;
}

const APPEAR_FRAME = 1350; // 45 seconds in — breathe before showing
const SLIDE_IN_FRAMES = 30;
const HOLD_FRAMES = 330; // 11 seconds
const SLIDE_OUT_FRAMES = 30;
const TOTAL_FRAMES = SLIDE_IN_FRAMES + HOLD_FRAMES + SLIDE_OUT_FRAMES;

export const FanQuoteOverlay: React.FC<Props> = ({ reviews, trackNumber, seed = 0 }) => {
  const frame = useCurrentFrame();

  // Only show every 3rd song
  if (trackNumber % 3 !== 0) return null;
  if (reviews.length === 0) return null;

  const localFrame = frame - APPEAR_FRAME;
  if (localFrame < 0 || localFrame >= TOTAL_FRAMES) return null;

  // Seed-based review selection
  const reviewIndex = Math.abs((seed * 16807 + trackNumber * 7919) % 2147483647) % reviews.length;
  const review = reviews[reviewIndex];

  // Spring slide-in from bottom
  const slideY = interpolate(
    localFrame,
    [0, SLIDE_IN_FRAMES, SLIDE_IN_FRAMES + HOLD_FRAMES, TOTAL_FRAMES],
    [40, 0, 0, 40],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.back(1.4)),
    },
  );

  const opacity = interpolate(
    localFrame,
    [0, SLIDE_IN_FRAMES * 0.5, SLIDE_IN_FRAMES + HOLD_FRAMES, TOTAL_FRAMES],
    [0, 0.70, 0.70, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Truncate long reviews
  const displayText = review.text.length > 200
    ? review.text.slice(0, 197) + "..."
    : review.text;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: "50%",
        transform: `translateX(-50%) translateY(${slideY}px)`,
        opacity,
        pointerEvents: "none",
        zIndex: 90,
        maxWidth: 600,
      }}
    >
      <div
        style={{
          background: "rgba(0, 0, 0, 0.25)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderRadius: 12,
          padding: "20px 28px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
        }}
      >
        <div
          style={{
            color: "rgba(255, 255, 255, 0.85)",
            fontSize: 18,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontWeight: 400,
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          "{displayText}"
        </div>
        <div
          style={{
            color: "rgba(255, 255, 255, 0.5)",
            fontSize: 13,
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 400,
          }}
        >
          {review.stars ? "★".repeat(review.stars) + " " : ""}
          — {review.reviewer}, archive.org
        </div>
      </div>
    </div>
  );
};
