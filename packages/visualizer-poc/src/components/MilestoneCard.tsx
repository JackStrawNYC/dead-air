/**
 * MilestoneCard — Cinematic lower-third for historically significant moments.
 * Announces debuts, revivals, rare performances, and returns.
 *
 * Appears at frame 450 (15s), holds until 690 (23s), fades out over 45 frames.
 * Spring slide-in from the left (mirrors SongDNA's right slide-in).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/CormorantGaramond";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily: cormorant } = loadFont("normal", {
  weights: ["300", "600"],
  subsets: ["latin"],
});

const { fontFamily: mono } = loadMono("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

export interface MilestoneCardProps {
  milestone: {
    type: "debut" | "revival" | "rare" | "return";
    headline: string;
    subtext: string;
  };
  colorAccent?: string;
}

const APPEAR_FRAME = 450;  // 15s — after SongTitle + SongDNA are gone
const HOLD_END = 690;       // 23s — 8 seconds of display
const FADE_DURATION = 45;   // 1.5s fade out

/** Accent color per milestone type */
const TYPE_ACCENT: Record<string, string> = {
  debut: "#d4a853",    // gold
  revival: "#c4763a",  // warm amber
  return: "#c4763a",   // warm amber
  rare: "#a0a0a0",     // silver
};

/** Label text per milestone type */
const TYPE_LABEL: Record<string, string> = {
  debut: "HISTORIC DEBUT",
  revival: "REVIVAL",
  return: "THE RETURN",
  rare: "RARE PERFORMANCE",
};

export const MilestoneCard: React.FC<MilestoneCardProps> = ({
  milestone,
  colorAccent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const accent = colorAccent ?? TYPE_ACCENT[milestone.type] ?? "#d4a853";
  const label = TYPE_LABEL[milestone.type] ?? "MILESTONE";

  // Spring slide-in from left
  const slideProgress = spring({
    frame: Math.max(0, frame - APPEAR_FRAME),
    fps,
    config: { damping: 18, mass: 0.6, stiffness: 100 },
  });

  const translateX = interpolate(slideProgress, [0, 1], [-40, 0]);

  // Fade out
  const fadeOut = interpolate(
    frame,
    [HOLD_END, HOLD_END + FADE_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Don't render before appearance or after full fade
  if (frame < APPEAR_FRAME - 5 || fadeOut <= 0) return null;

  const opacity = slideProgress * fadeOut;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 180,
        left: 80,
        opacity,
        transform: `translateX(${translateX}px)`,
        pointerEvents: "none",
        zIndex: 90,
      }}
    >
      <div
        style={{
          minWidth: 240,
          maxWidth: 420,
          padding: "16px 24px",
          background: "rgba(10, 10, 10, 0.5)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderTop: `3px solid ${accent}`,
          borderRadius: 2,
        }}
      >
        {/* Type label */}
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
          {label}
        </div>

        {/* Headline */}
        <div
          style={{
            fontFamily: `${cormorant}, Georgia, serif`,
            fontSize: 28,
            fontWeight: 600,
            color: "rgba(245, 240, 232, 0.95)",
            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
            lineHeight: 1.2,
          }}
        >
          {milestone.headline}
        </div>

        {/* Subtext */}
        <div
          style={{
            fontFamily: `${cormorant}, Georgia, serif`,
            fontSize: 15,
            fontWeight: 300,
            fontStyle: "italic",
            color: accent,
            marginTop: 10,
            lineHeight: 1.4,
            opacity: 0.85,
          }}
        >
          {milestone.subtext}
        </div>
      </div>
    </div>
  );
};
