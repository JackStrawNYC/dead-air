/**
 * RainbowArc -- A+++ quality rainbow arc overlay.
 *
 * 7 concentric ROYGBIV arcs, each rendered as 3 layers (outer glow, main body,
 * inner bright edge). Secondary rainbow (fainter, reversed) outside main.
 * Rain streaks falling from the arc, pot-of-gold glow at each base,
 * atmospheric sparkles twinkling along the arc. Deep per-band audio reactivity.
 *
 * Renders continuously — the overlay rotation system controls visibility.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

// ROYGBIV — warm-to-cool gradient
const RAINBOW_COLORS = [
  { hex: "#FF1A1A", r: 255, g: 26, b: 26 }, // Red
  { hex: "#FF8800", r: 255, g: 136, b: 0 }, // Orange
  { hex: "#FFE600", r: 255, g: 230, b: 0 }, // Yellow
  { hex: "#22CC44", r: 34, g: 204, b: 68 }, // Green
  { hex: "#2266FF", r: 34, g: 102, b: 255 }, // Blue
  { hex: "#5500AA", r: 85, g: 0, b: 170 }, // Indigo
  { hex: "#9900FF", r: 153, g: 0, b: 255 }, // Violet
];

const SECONDARY_COLORS = [...RAINBOW_COLORS].reverse();

const BASE_BAND_WIDTH = 20;
const BAND_GAP = 4;
const SPARKLE_COUNT = 10;
const RAIN_STREAK_COUNT = 12;

interface Props {
  frames: EnhancedFrameData[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Deterministic pseudo-random from seed */
function seededRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Shift a hex color's hue by degrees (approximate via RGB rotation) */
function shiftHue(
  r: number,
  g: number,
  b: number,
  degrees: number,
): string {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Approximate hue rotation matrix
  const nr = r * (0.213 + cos * 0.787 - sin * 0.213) +
    g * (0.715 - cos * 0.715 - sin * 0.715) +
    b * (0.072 - cos * 0.072 + sin * 0.928);
  const ng = r * (0.213 - cos * 0.213 + sin * 0.143) +
    g * (0.715 + cos * 0.285 + sin * 0.14) +
    b * (0.072 - cos * 0.072 - sin * 0.283);
  const nb = r * (0.213 - cos * 0.213 - sin * 0.787) +
    g * (0.715 - cos * 0.715 + sin * 0.715) +
    b * (0.072 + cos * 0.928 + sin * 0.072);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(nr)},${clamp(ng)},${clamp(nb)})`;
}

/** Build semicircular arc path */
function arcPath(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
}

/** Point on arc at angle (0=left endpoint, PI=right endpoint) */
function arcPoint(
  cx: number,
  cy: number,
  r: number,
  angle: number,
): { x: number; y: number } {
  return {
    x: cx - r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const RainbowArc: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);

  const {
    energy,
    bass,
    mids,
    highs,
    beatDecay,
    onsetEnvelope,
    chromaHue,
    spectralFlux,
  } = snap;

  /* ---- Frequency-to-band mapping (bass=warm, mids=middle, highs=cool) ---- */
  const bandEnergies = [
    bass, // Red
    bass * 0.55 + mids * 0.45, // Orange
    mids * 0.65 + bass * 0.35, // Yellow
    mids, // Green
    mids * 0.45 + highs * 0.55, // Blue
    highs * 0.65 + mids * 0.35, // Indigo
    highs, // Violet
  ];

  /* ---- Arc geometry ---- */
  const centerX = width * 0.5;
  const centerY = height * 0.62;
  const baseRadius = width * 0.34;

  // Energy drives arc spread: wider at high energy, tighter at low
  const spreadFactor = interpolate(energy, [0.05, 0.5], [0.85, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Beat pulse on band width
  const beatPulse = 1 + beatDecay * 0.08;
  const bandWidth = BASE_BAND_WIDTH * spreadFactor * beatPulse;

  // ChromaHue shifts overall rainbow hue (+-15 degrees max)
  const hueShift = interpolate(chromaHue, [0, 360], [-15, 15]);

  // Master opacity: quiet = translucent, loud = vivid
  const masterOpacity = interpolate(energy, [0.03, 0.3], [0.3, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow shimmer
  const shimmer =
    1 +
    Math.sin(frame * 0.05) * 0.025 +
    Math.sin(frame * 0.11) * 0.015;

  /* ---- SVG defs ID (unique per frame scope) ---- */
  const defPrefix = `ra-${frame & 0xfff}`;

  /* ------------------------------------------------------------------ */
  /*  Render helpers for 3-layer arcs                                    */
  /* ------------------------------------------------------------------ */

  function renderArcBand(
    color: (typeof RAINBOW_COLORS)[number],
    index: number,
    radius: number,
    bandE: number,
    isSecondary: boolean,
  ) {
    const secMul = isSecondary ? 0.3 : 1.0;
    const shifted = shiftHue(color.r, color.g, color.b, hueShift);

    // Per-band opacity: quiet dims, active glows
    const baseOpacity =
      interpolate(bandE, [0.02, 0.35], [0.2, 0.9], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }) * secMul;

    // Onset flash adds brightness
    const flashBoost = onsetEnvelope * 0.12 * secMul;

    // Per-band width modulation
    const bw = bandWidth * (1 + bandE * 0.25);

    const d = arcPath(centerX, centerY, radius);
    const glowRadius = 6 + bandE * 18;
    const prefix = isSecondary ? "sec" : "main";
    const key = `${prefix}-${index}`;

    return (
      <g key={key}>
        {/* Layer 1: Outer soft glow — wide, atmospheric */}
        <path
          d={d}
          stroke={shifted}
          strokeWidth={bw * 2.2}
          fill="none"
          opacity={(baseOpacity * 0.25 + flashBoost * 0.3) * shimmer}
          style={{
            filter: `blur(${glowRadius}px)`,
          }}
          strokeLinecap="round"
        />

        {/* Layer 2: Main band body — gradient fill along the arc */}
        <path
          d={d}
          stroke={`url(#${defPrefix}-grad-${prefix}-${index})`}
          strokeWidth={bw}
          fill="none"
          opacity={(baseOpacity + flashBoost) * shimmer}
          strokeLinecap="round"
        />

        {/* Layer 3: Inner bright edge — thin highlight line */}
        <path
          d={d}
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={Math.max(1, bw * 0.12)}
          fill="none"
          opacity={
            (baseOpacity * 0.5 + flashBoost * 0.6 + beatDecay * 0.15) *
            shimmer *
            secMul
          }
          strokeLinecap="round"
        />
      </g>
    );
  }

  /* ---- Build gradient defs for each band ---- */
  function buildGradientDefs() {
    const defs: React.ReactNode[] = [];

    const buildForSet = (
      colors: (typeof RAINBOW_COLORS)[number][],
      prefix: string,
    ) => {
      colors.forEach((color, i) => {
        const shifted = shiftHue(color.r, color.g, color.b, hueShift);
        // Lighter at top of arc, richer at bottom
        const lighterR = Math.min(255, color.r + 80);
        const lighterG = Math.min(255, color.g + 80);
        const lighterB = Math.min(255, color.b + 80);
        const lighter = shiftHue(lighterR, lighterG, lighterB, hueShift);

        defs.push(
          <linearGradient
            key={`${defPrefix}-grad-${prefix}-${i}`}
            id={`${defPrefix}-grad-${prefix}-${i}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={lighter} stopOpacity={0.95} />
            <stop offset="55%" stopColor={shifted} stopOpacity={1} />
            <stop offset="100%" stopColor={shifted} stopOpacity={0.85} />
          </linearGradient>,
        );
      });
    };

    buildForSet(RAINBOW_COLORS, "main");
    // Secondary uses reversed colors
    buildForSet(SECONDARY_COLORS, "sec");

    // Pot-of-gold radial gradient
    defs.push(
      <radialGradient
        key={`${defPrefix}-gold`}
        id={`${defPrefix}-gold`}
        cx="50%"
        cy="50%"
        r="50%"
      >
        <stop offset="0%" stopColor="#FFD700" stopOpacity={0.7} />
        <stop offset="40%" stopColor="#FFA500" stopOpacity={0.4} />
        <stop offset="100%" stopColor="#FF8C00" stopOpacity={0} />
      </radialGradient>,
    );

    return defs;
  }

  /* ---- Rain streaks: vertical light lines falling from the arc ---- */
  function renderRainStreaks() {
    const streaks: React.ReactNode[] = [];
    const rainOpacity = interpolate(energy, [0.05, 0.4], [0.04, 0.22], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    for (let i = 0; i < RAIN_STREAK_COUNT; i++) {
      // Distribute along the arc
      const angle = (Math.PI * (i + 0.5)) / RAIN_STREAK_COUNT;
      const outerR =
        baseRadius +
        (RAINBOW_COLORS.length - 1) * (bandWidth + BAND_GAP) * spreadFactor;
      const pt = arcPoint(centerX, centerY, outerR * 0.95, angle);

      // Each streak has a random length and speed
      const seed = i * 73 + 17;
      const streakLen = 40 + seededRand(seed) * 80;
      const speed = 0.6 + seededRand(seed + 1) * 0.8;
      const phase = seededRand(seed + 2) * Math.PI * 2;

      // Animate: streak falls and fades
      const cycle = ((frame * speed * 0.03 + phase) % 1.0);
      const yOffset = cycle * streakLen * 2;
      const fadeOut = 1 - cycle;

      // Pick a rainbow color based on position
      const colorIdx = Math.floor(
        (i / RAIN_STREAK_COUNT) * RAINBOW_COLORS.length,
      );
      const c = RAINBOW_COLORS[Math.min(colorIdx, RAINBOW_COLORS.length - 1)];
      const shifted = shiftHue(c.r, c.g, c.b, hueShift);

      streaks.push(
        <line
          key={`rain-${i}`}
          x1={pt.x}
          y1={pt.y + yOffset}
          x2={pt.x + (seededRand(seed + 3) - 0.5) * 4}
          y2={pt.y + yOffset + streakLen * fadeOut}
          stroke={shifted}
          strokeWidth={1.2 + seededRand(seed + 4) * 0.8}
          opacity={rainOpacity * fadeOut * shimmer}
          strokeLinecap="round"
        />,
      );
    }
    return streaks;
  }

  /* ---- Atmospheric sparkles: twinkling dots along the arc ---- */
  function renderSparkles() {
    const sparkles: React.ReactNode[] = [];

    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const seed = i * 53 + 7;
      // Distribute along arc at varying radii
      const angle = Math.PI * (0.08 + seededRand(seed) * 0.84);
      const bandIdx = Math.floor(seededRand(seed + 1) * RAINBOW_COLORS.length);
      const r =
        baseRadius +
        bandIdx * (bandWidth + BAND_GAP) * spreadFactor;
      const pt = arcPoint(centerX, centerY, r, angle);

      // Twinkle: oscillating opacity driven by beatDecay + unique phase
      const phase = seededRand(seed + 2) * Math.PI * 2;
      const twinkleSpeed = 0.08 + seededRand(seed + 3) * 0.12;
      const twinkle =
        0.3 +
        0.7 *
          Math.max(
            0,
            Math.sin(frame * twinkleSpeed + phase) * 0.5 + 0.5,
          );

      // Onset flash makes sparkles pop
      const onsetBoost = 1 + onsetEnvelope * 2;
      const sparkleSize = (1.5 + seededRand(seed + 4) * 2) * onsetBoost;

      const sparkleOpacity = interpolate(
        twinkle * (0.4 + energy * 0.6),
        [0, 1],
        [0.1, 0.8],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      ) + beatDecay * 0.2;

      sparkles.push(
        <g key={`sparkle-${i}`}>
          {/* Soft glow behind sparkle */}
          <circle
            cx={pt.x}
            cy={pt.y}
            r={sparkleSize * 3}
            fill="white"
            opacity={sparkleOpacity * 0.15}
            style={{ filter: "blur(3px)" }}
          />
          {/* Sparkle cross */}
          <line
            x1={pt.x - sparkleSize}
            y1={pt.y}
            x2={pt.x + sparkleSize}
            y2={pt.y}
            stroke="white"
            strokeWidth={0.8}
            opacity={sparkleOpacity}
            strokeLinecap="round"
          />
          <line
            x1={pt.x}
            y1={pt.y - sparkleSize}
            x2={pt.x}
            y2={pt.y + sparkleSize}
            stroke="white"
            strokeWidth={0.8}
            opacity={sparkleOpacity}
            strokeLinecap="round"
          />
          {/* Center dot */}
          <circle
            cx={pt.x}
            cy={pt.y}
            r={sparkleSize * 0.4}
            fill="white"
            opacity={Math.min(1, sparkleOpacity * 1.3)}
          />
        </g>,
      );
    }
    return sparkles;
  }

  /* ---- Pot-of-gold glow at arc base endpoints ---- */
  function renderPotOfGold() {
    const innerR = baseRadius * spreadFactor;
    const outerR =
      baseRadius +
      (RAINBOW_COLORS.length - 1) * (bandWidth + BAND_GAP) * spreadFactor;
    const midR = (innerR + outerR) * 0.5;
    const goldSize = 50 + energy * 40 + beatDecay * 15;
    const goldOpacity = interpolate(energy, [0.05, 0.3], [0.15, 0.45], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    // Left base
    const leftX = centerX - midR;
    const leftY = centerY;
    // Right base
    const rightX = centerX + midR;
    const rightY = centerY;

    return (
      <g>
        <ellipse
          cx={leftX}
          cy={leftY + 10}
          rx={goldSize}
          ry={goldSize * 0.7}
          fill={`url(#${defPrefix}-gold)`}
          opacity={goldOpacity * shimmer}
          style={{ filter: "blur(8px)" }}
        />
        <ellipse
          cx={rightX}
          cy={rightY + 10}
          rx={goldSize}
          ry={goldSize * 0.7}
          fill={`url(#${defPrefix}-gold)`}
          opacity={goldOpacity * shimmer}
          style={{ filter: "blur(8px)" }}
        />
      </g>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Compose                                                            */
  /* ------------------------------------------------------------------ */

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          mixBlendMode: "screen",
        }}
      >
        <defs>{buildGradientDefs()}</defs>

        {/* Pot-of-gold glow (behind everything) */}
        {renderPotOfGold()}

        {/* Secondary rainbow — fainter, reversed, outside main */}
        {SECONDARY_COLORS.map((color, ci) => {
          const r =
            baseRadius +
            (RAINBOW_COLORS.length + 2.5 + ci) *
              (bandWidth + BAND_GAP) *
              spreadFactor;
          const bandE = bandEnergies[RAINBOW_COLORS.length - 1 - ci] ?? energy;
          return renderArcBand(color, ci, r, bandE, true);
        })}

        {/* Main rainbow — 7 concentric 3-layer arcs */}
        {RAINBOW_COLORS.map((color, ci) => {
          const r =
            baseRadius +
            (RAINBOW_COLORS.length - 1 - ci) *
              (bandWidth + BAND_GAP) *
              spreadFactor;
          const bandE = bandEnergies[ci] ?? energy;
          return renderArcBand(color, ci, r, bandE, false);
        })}

        {/* Rain streaks falling from the arc */}
        <g style={{ filter: "blur(0.5px)" }}>{renderRainStreaks()}</g>

        {/* Atmospheric sparkles twinkling along the arc */}
        {renderSparkles()}
      </svg>
    </div>
  );
};
