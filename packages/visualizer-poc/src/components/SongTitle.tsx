/**
 * SongTitle — DOM overlay that shows song title at the start of each track.
 * Fades in over 30 frames, holds for 120 frames, fades out over 30 frames.
 *
 * Era-aware typography: font family/weight/style varies per era.
 */

import React, { useMemo } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useShowContext } from "../data/ShowContext";

interface Props {
  title: string;
  setNumber: number;
  trackNumber: number;
  /** Segue mode: subtle lower-third title instead of center card */
  isSegue?: boolean;
}

const FADE_IN = 45;
const HOLD = 240;
const FADE_OUT = 45;
const TOTAL = FADE_IN + HOLD + FADE_OUT;

// Segue lower-third timing
const SEGUE_FADE_IN = 30;
const SEGUE_HOLD = 180; // 6 seconds
const SEGUE_FADE_OUT = 30;
const SEGUE_TOTAL = SEGUE_FADE_IN + SEGUE_HOLD + SEGUE_FADE_OUT;

type Era = "primal" | "classic" | "hiatus" | "touch_of_grey" | "revival";

interface EraTypography {
  titleFont: string;
  titleWeight: number;
  titleSize: number;
  labelFont: string;
  labelLetterSpacing: string;
}

/** Era-specific typography presets */
const ERA_TYPOGRAPHY: Record<Era, EraTypography> = {
  primal: {
    // Psychedelic flowing — handwritten feel
    titleFont: "'Playfair Display', Georgia, serif",
    titleWeight: 400,
    titleSize: 46,
    labelFont: "Georgia, serif",
    labelLetterSpacing: "0.15em",
  },
  classic: {
    // Clean serif — golden era elegance
    titleFont: "'Playfair Display', Georgia, serif",
    titleWeight: 600,
    titleSize: 42,
    labelFont: "Inter, system-ui, sans-serif",
    labelLetterSpacing: "0.2em",
  },
  hiatus: {
    // Muted, understated
    titleFont: "Inter, system-ui, sans-serif",
    titleWeight: 300,
    titleSize: 40,
    labelFont: "Inter, system-ui, sans-serif",
    labelLetterSpacing: "0.25em",
  },
  touch_of_grey: {
    // Bold display — stadium era punch
    titleFont: "Inter, system-ui, sans-serif",
    titleWeight: 700,
    titleSize: 48,
    labelFont: "Inter, system-ui, sans-serif",
    labelLetterSpacing: "0.3em",
  },
  revival: {
    // Clean, neutral
    titleFont: "'Playfair Display', Georgia, serif",
    titleWeight: 500,
    titleSize: 42,
    labelFont: "Inter, system-ui, sans-serif",
    labelLetterSpacing: "0.2em",
  },
};

const DEFAULT_TYPO: EraTypography = ERA_TYPOGRAPHY.classic;

export const SongTitle: React.FC<Props> = ({ title, setNumber, trackNumber, isSegue }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const ctx = useShowContext();

  // Resolution scaling (designed at 1080p)
  const s = height / 1080;

  const typo = useMemo((): EraTypography => {
    if (!ctx?.era || !(ctx.era in ERA_TYPOGRAPHY)) return DEFAULT_TYPO;
    return ERA_TYPOGRAPHY[ctx.era as Era];
  }, [ctx?.era]);

  // Segue lower-third mode: subtle bottom-left title
  if (isSegue) {
    if (frame >= SEGUE_TOTAL) return null;

    const segueOpacity = interpolate(
      frame,
      [0, SEGUE_FADE_IN, SEGUE_FADE_IN + SEGUE_HOLD, SEGUE_TOTAL],
      [0, 0.65, 0.65, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

    const slideX = interpolate(
      frame,
      [0, SEGUE_FADE_IN],
      [-20 * s, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

    return (
      <div
        style={{
          position: "absolute",
          bottom: 60 * s,
          left: 60 * s,
          opacity: segueOpacity,
          transform: `translateX(${slideX}px)`,
          pointerEvents: "none",
          zIndex: 100,
        }}
      >
        <div
          style={{
            color: "rgba(255, 255, 255, 0.85)",
            fontSize: 28 * s,
            fontFamily: typo.titleFont,
            fontWeight: typo.titleWeight,
            textShadow: `0 ${2 * s}px ${16 * s}px rgba(0,0,0,0.7)`,
          }}
        >
          {title}
        </div>
      </div>
    );
  }

  if (frame >= TOTAL) return null;

  const opacity = interpolate(
    frame,
    [0, FADE_IN, FADE_IN + HOLD, TOTAL],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const translateY = interpolate(
    frame,
    [0, FADE_IN],
    [10 * s, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 150 * s,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity,
        transform: `translateY(${translateY}px)`,
        pointerEvents: "none",
        zIndex: 100,
      }}
    >
      <div
        style={{
          color: "rgba(255, 255, 255, 0.4)",
          fontSize: 16 * s,
          fontFamily: typo.labelFont,
          fontWeight: 400,
          letterSpacing: typo.labelLetterSpacing,
          textTransform: "uppercase",
          marginBottom: 8 * s,
        }}
      >
        Set {setNumber} · Track {trackNumber}
      </div>
      <div
        style={{
          color: "rgba(255, 255, 255, 0.85)",
          fontSize: typo.titleSize * s,
          fontFamily: typo.titleFont,
          fontWeight: typo.titleWeight,
          textShadow: `0 ${2 * s}px ${20 * s}px rgba(0,0,0,0.8)`,
        }}
      >
        {title}
      </div>
    </div>
  );
};
