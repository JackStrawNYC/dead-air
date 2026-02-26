/**
 * TourPosterGallery -- vintage Fillmore/Avalon Ballroom poster art frames.
 * Ornate psychedelic borders with stylized text compositions.
 * 4 poster designs in carousel rotation (one at a time).
 * Appears every 75 seconds for 12 seconds. Upper-left, 250x350px.
 * Deterministic via mulberry32 PRNG.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

// -- Timing -----------------------------------------------------------------

const REAPPEAR_INTERVAL = 2250; // every 75 seconds at 30 fps
const SHOW_DURATION = 360; // 12 seconds
const FADE_IN_FRAMES = 60;
const FADE_OUT_FRAMES = 60;

// -- Poster data ------------------------------------------------------------

interface PosterDesign {
  bandLine: string;
  venueLine: string;
  dateLine: string;
  extraLine: string;
  colorScheme: {
    bg: string;
    border: string;
    primary: string;
    secondary: string;
    accent: string;
    glow: string;
  };
}

/** Poster 0 is a placeholder — replaced at runtime with show context data */
const POSTER_0_COLORS = {
  bg: "rgba(20, 5, 35, 0.85)",
  border: "#FF00FF",
  primary: "#FF1493",
  secondary: "#FFD700",
  accent: "#00FFFF",
  glow: "#FF00FF",
};

const STATIC_POSTERS: PosterDesign[] = [
  {
    bandLine: "THE GRATEFUL DEAD",
    venueLine: "Fillmore West",
    dateLine: "San Francisco",
    extraLine: "An Evening of Musical Exploration",
    colorScheme: {
      bg: "rgba(5, 15, 35, 0.85)",
      border: "#00FFFF",
      primary: "#00FF7F",
      secondary: "#FF6347",
      accent: "#7B68EE",
      glow: "#00FFFF",
    },
  },
  {
    bandLine: "GRATEFUL DEAD",
    venueLine: "Avalon Ballroom",
    dateLine: "Haight-Ashbury, 1967",
    extraLine: "with Quicksilver Messenger Service",
    colorScheme: {
      bg: "rgba(30, 8, 8, 0.85)",
      border: "#FF4500",
      primary: "#FFD700",
      secondary: "#FF1744",
      accent: "#ADFF2F",
      glow: "#FF4500",
    },
  },
  {
    bandLine: "JERRY GARCIA & THE DEAD",
    venueLine: "Winterland Arena",
    dateLine: "New Year's Eve",
    extraLine: "One Night Only",
    colorScheme: {
      bg: "rgba(8, 20, 10, 0.85)",
      border: "#76FF03",
      primary: "#FFEA00",
      secondary: "#DA70D6",
      accent: "#00E5FF",
      glow: "#76FF03",
    },
  },
];

// -- Ornate SVG border (shared) ---------------------------------------------

const OrnateFrame: React.FC<{
  width: number;
  height: number;
  borderColor: string;
  glowColor: string;
  frame: number;
}> = ({ width: w, height: h, borderColor, glowColor, frame: f }) => {
  // Slow rotation of the border pattern
  const dashOffset = f * 0.3;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ position: "absolute", top: 0, left: 0 }}
      fill="none"
    >
      {/* Outer frame */}
      <rect
        x="2"
        y="2"
        width={w - 4}
        height={h - 4}
        rx="6"
        stroke={borderColor}
        strokeWidth="2.5"
        opacity="0.9"
      />

      {/* Inner frame with dashed pattern */}
      <rect
        x="10"
        y="10"
        width={w - 20}
        height={h - 20}
        rx="4"
        stroke={borderColor}
        strokeWidth="1"
        strokeDasharray="8 4 2 4"
        strokeDashoffset={dashOffset}
        opacity="0.6"
      />

      {/* Corner ornaments (Art Nouveau style) */}
      {/* Top-left */}
      <path
        d={`M 6 30 Q 6 6, 30 6`}
        stroke={borderColor}
        strokeWidth="2"
        opacity="0.7"
      />
      <circle cx="6" cy="6" r="3" fill={borderColor} opacity="0.5" />

      {/* Top-right */}
      <path
        d={`M ${w - 6} 30 Q ${w - 6} 6, ${w - 30} 6`}
        stroke={borderColor}
        strokeWidth="2"
        opacity="0.7"
      />
      <circle cx={w - 6} cy="6" r="3" fill={borderColor} opacity="0.5" />

      {/* Bottom-left */}
      <path
        d={`M 6 ${h - 30} Q 6 ${h - 6}, 30 ${h - 6}`}
        stroke={borderColor}
        strokeWidth="2"
        opacity="0.7"
      />
      <circle cx="6" cy={h - 6} r="3" fill={borderColor} opacity="0.5" />

      {/* Bottom-right */}
      <path
        d={`M ${w - 6} ${h - 30} Q ${w - 6} ${h - 6}, ${w - 30} ${h - 6}`}
        stroke={borderColor}
        strokeWidth="2"
        opacity="0.7"
      />
      <circle cx={w - 6} cy={h - 6} r="3" fill={borderColor} opacity="0.5" />

      {/* Center decorative elements - top */}
      <path
        d={`M ${w / 2 - 30} 4 Q ${w / 2} -4, ${w / 2 + 30} 4`}
        stroke={borderColor}
        strokeWidth="1.5"
        opacity="0.5"
      />

      {/* Center decorative elements - bottom */}
      <path
        d={`M ${w / 2 - 30} ${h - 4} Q ${w / 2} ${h + 4}, ${w / 2 + 30} ${h - 4}`}
        stroke={borderColor}
        strokeWidth="1.5"
        opacity="0.5"
      />

      {/* Side filigree - left */}
      <path
        d={`M 4 ${h / 2 - 20} C -4 ${h / 2}, -4 ${h / 2}, 4 ${h / 2 + 20}`}
        stroke={borderColor}
        strokeWidth="1.5"
        opacity="0.4"
      />

      {/* Side filigree - right */}
      <path
        d={`M ${w - 4} ${h / 2 - 20} C ${w + 4} ${h / 2}, ${w + 4} ${h / 2}, ${w - 4} ${h / 2 + 20}`}
        stroke={borderColor}
        strokeWidth="1.5"
        opacity="0.4"
      />
    </svg>
  );
};

// -- Wavy text effect (CSS transform per character) -------------------------

const WavyText: React.FC<{
  text: string;
  fontSize: number;
  color: string;
  glowColor: string;
  frame: number;
  waveSpeed: number;
  waveAmount: number;
  letterSpacing: number;
  fontWeight: number | string;
}> = ({
  text,
  fontSize,
  color,
  glowColor,
  frame: f,
  waveSpeed,
  waveAmount,
  letterSpacing,
  fontWeight,
}) => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: `0 ${letterSpacing}px`,
      }}
    >
      {text.split("").map((char, i) => {
        const yOff = Math.sin(f * waveSpeed * 0.02 + i * 0.4) * waveAmount;
        const rotOff = Math.sin(f * waveSpeed * 0.015 + i * 0.5) * 3;
        const scaleOff = 1 + Math.sin(f * waveSpeed * 0.01 + i * 0.3) * 0.05;

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize,
              fontWeight,
              color,
              textShadow: `0 0 8px ${glowColor}, 0 0 16px ${glowColor}, 0 0 32px ${glowColor}`,
              transform: `translateY(${yOff}px) rotate(${rotOff}deg) scale(${scaleOff})`,
              minWidth: char === " " ? fontSize * 0.3 : undefined,
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
};

// -- Component --------------------------------------------------------------

interface Props {
  frames: EnhancedFrameData[];
}

export const TourPosterGallery: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ctx = useShowContext();

  // Build poster list: poster 0 = actual show, 1-3 = decorative
  const posters = useMemo<PosterDesign[]>(() => {
    const showPoster: PosterDesign = {
      bandLine: (ctx?.bandName ?? "GRATEFUL DEAD").toUpperCase(),
      venueLine: ctx?.venueShort ?? "Barton Hall",
      dateLine: ctx?.date ?? "May 8, 1977",
      extraLine: ctx ? `${ctx.venueLocation}` : "Cornell University - Ithaca, NY",
      colorScheme: POSTER_0_COLORS,
    };
    return [showPoster, ...STATIC_POSTERS];
  }, [ctx]);

  // Rolling energy (75-frame window each side)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let energySum = 0;
  let energyCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    energySum += frames[i].rms;
    energyCount++;
  }
  const energy = energyCount > 0 ? energySum / energyCount : 0;

  // Cycle timing
  const cycleFrame = frame % REAPPEAR_INTERVAL;
  const inWindow = cycleFrame < SHOW_DURATION;

  if (!inWindow) return null;

  // Fade in/out
  const fadeIn = interpolate(cycleFrame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(
    cycleFrame,
    [SHOW_DURATION - FADE_OUT_FRAMES, SHOW_DURATION],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  if (opacity < 0.01) return null;

  // Which poster to show (cycle through based on appearance count)
  const cycleIndex = Math.floor(frame / REAPPEAR_INTERVAL);
  const posterIdx = cycleIndex % posters.length;
  const poster = posters[posterIdx];

  // Slide in from top
  const slideY = interpolate(cycleFrame, [0, FADE_IN_FRAMES], [-30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Energy-driven scale breathing
  const breathScale = 1 + interpolate(energy, [0.05, 0.35], [0, 0.04], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Energy-driven glow intensity
  const glowIntensity = interpolate(energy, [0.05, 0.3], [6, 18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slight rotation wobble
  const wobbleAngle = Math.sin(frame * 0.02) * 1.5;

  const { colorScheme } = poster;
  const POSTER_W = 250;
  const POSTER_H = 350;

  // Decorative line separator width animation
  const lineWidth = interpolate(cycleFrame, [FADE_IN_FRAMES * 0.5, FADE_IN_FRAMES * 1.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: 30,
          left: 30,
          width: POSTER_W,
          height: POSTER_H,
          opacity,
          transform: `translateY(${slideY}px) rotate(${wobbleAngle}deg) scale(${breathScale})`,
          filter: `drop-shadow(0 0 ${glowIntensity}px ${colorScheme.glow})`,
          willChange: "transform, opacity, filter",
        }}
      >
        {/* Poster background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: colorScheme.bg,
            borderRadius: 6,
          }}
        />

        {/* Ornate frame border */}
        <OrnateFrame
          width={POSTER_W}
          height={POSTER_H}
          borderColor={colorScheme.border}
          glowColor={colorScheme.glow}
          frame={frame}
        />

        {/* Poster content */}
        <div
          style={{
            position: "absolute",
            inset: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {/* Decorative top element */}
          <div
            style={{
              width: 40,
              height: 1.5,
              background: `linear-gradient(90deg, transparent, ${colorScheme.accent}, transparent)`,
              opacity: 0.6,
            }}
          />

          {/* "presents" small text */}
          <div
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: 10,
              fontStyle: "italic",
              color: colorScheme.accent,
              letterSpacing: 4,
              textTransform: "uppercase",
              opacity: 0.7,
              textShadow: `0 0 6px ${colorScheme.accent}`,
            }}
          >
            Bill Graham Presents
          </div>

          {/* Band name (wavy) */}
          <WavyText
            text={poster.bandLine}
            fontSize={22}
            color={colorScheme.primary}
            glowColor={colorScheme.glow}
            frame={frame}
            waveSpeed={1.2}
            waveAmount={3}
            letterSpacing={2}
            fontWeight={900}
          />

          {/* Decorative separator */}
          <div
            style={{
              width: POSTER_W * 0.6 * lineWidth,
              height: 1,
              background: `linear-gradient(90deg, transparent, ${colorScheme.secondary}, transparent)`,
              opacity: 0.5,
            }}
          />

          {/* Venue */}
          <div
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: 16,
              fontWeight: 600,
              color: colorScheme.secondary,
              textShadow: `0 0 10px ${colorScheme.secondary}`,
              letterSpacing: 2,
              textAlign: "center",
            }}
          >
            {poster.venueLine}
          </div>

          {/* Date */}
          <div
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: 13,
              color: colorScheme.accent,
              textShadow: `0 0 8px ${colorScheme.accent}`,
              letterSpacing: 3,
              textAlign: "center",
            }}
          >
            {poster.dateLine}
          </div>

          {/* Extra line */}
          <div
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: 10,
              fontStyle: "italic",
              color: colorScheme.secondary,
              opacity: 0.65,
              textShadow: `0 0 6px ${colorScheme.secondary}`,
              textAlign: "center",
              letterSpacing: 1,
              maxWidth: POSTER_W * 0.75,
            }}
          >
            {poster.extraLine}
          </div>

          {/* Bottom decorative element */}
          <div
            style={{
              marginTop: 6,
              width: 50,
              height: 1.5,
              background: `linear-gradient(90deg, transparent, ${colorScheme.accent}, transparent)`,
              opacity: 0.5,
            }}
          />

          {/* Small Steal Your Face icon */}
          <svg width="30" height="30" viewBox="0 0 100 100" fill="none" style={{ opacity: 0.5 }}>
            <circle cx="50" cy="50" r="44" stroke={colorScheme.border} strokeWidth="3" />
            <line x1="6" y1="50" x2="94" y2="50" stroke={colorScheme.border} strokeWidth="2" />
            <polygon
              points="50,10 44,42 56,42 42,90 58,52 46,52 56,10"
              fill={colorScheme.primary}
              opacity="0.6"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
