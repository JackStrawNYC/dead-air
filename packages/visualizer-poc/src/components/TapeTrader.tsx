/**
 * TapeTrader — Bootleg tape exchange graphic.
 * Cassette tape icon (simplified SVG: rectangle with two circles for reels
 * + label area). Text: "NOT FOR SALE" or "FREELY TRADED" (alternating based
 * on seed). Small format, positioned bottom-right corner. Distressed/worn
 * aesthetic (slight opacity variation simulating wear). Very low opacity
 * (5-8%). 10% duty cycle: brief appearance every ~90 seconds (~270 frames on
 * per 2700 frame cycle). Warm sepia/brown coloring. Tape reels animate
 * (rotating circles) when visible.
 * Layer 7, retro tag.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

// Duty cycle: 10% visible. ~9 seconds on, ~81 seconds off (90s total = 2700 frames)
const CYCLE_FRAMES = 2700;
const ON_FRAMES = 270; // ~9 seconds at 30fps
const FADE_FRAMES = 30; // 1 second fade in/out
const STAGGER_START = 240; // 8 seconds initial delay

const LABELS = ["NOT FOR SALE", "FREELY TRADED"];

interface Props {
  frames: EnhancedFrameData[];
}

export const TapeTrader: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const showCtx = useShowContext();
  const ctx = showCtx;
  const showVenueShort = (showCtx?.venueShort ?? "Concert").toUpperCase();
  const showDateShort = showCtx?.dateShort ?? "";

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Duty cycle: 10% on-time
  const delayedFrame = frame - STAGGER_START;
  if (delayedFrame < 0) return null;

  const cycleIndex = Math.floor(delayedFrame / CYCLE_FRAMES);
  const cycleFrame = delayedFrame % CYCLE_FRAMES;
  if (cycleFrame >= ON_FRAMES) return null;

  // Fade in/out within the visible window
  const fadeIn = interpolate(cycleFrame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cycleFrame, [ON_FRAMES - FADE_FRAMES, ON_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const windowFade = Math.min(fadeIn, fadeOut);

  // Distressed wear: subtle opacity variation
  const rng = seeded((ctx?.showSeed ?? 19770508) + cycleIndex * 31);
  const wearFactor = 0.85 + rng() * 0.15; // 85-100% — simulates aged tape

  // Base opacity: very low (5-8%)
  const baseOpacity = 0.06;
  const masterOpacity = baseOpacity * masterFade * windowFade * wearFactor;

  if (masterOpacity < 0.005) return null;

  // Select label text based on seed + cycle
  const labelRng = seeded((ctx?.showSeed ?? 19770508) + cycleIndex * 17);
  const labelIdx = Math.floor(labelRng() * LABELS.length);
  const labelText = LABELS[labelIdx];

  // Tape reel rotation — continuous while visible
  const reelSpeed = 3; // degrees per frame
  const energyBoost = energy * 2;
  const reelRotation = cycleFrame * (reelSpeed + energyBoost);

  // Sepia/brown color palette
  const casingColor = "hsla(30, 35%, 25%, 0.8)";
  const reelColor = "hsla(35, 30%, 45%, 0.7)";
  const hubColor = "hsla(35, 25%, 55%, 0.6)";
  const labelBg = "hsla(40, 40%, 75%, 0.25)";
  const textColor = "hsla(25, 50%, 40%, 0.85)";
  const windowColor = "hsla(30, 20%, 15%, 0.6)";

  // Cassette dimensions
  const casW = 120;
  const casH = 76;
  const reelR = 14;
  const hubR = 5;
  const spokeCount = 6;

  // Position: bottom-right corner
  const posX = width - casW - 24;
  const posY = height - casH - 32;

  // Distress: slight jitter for worn look
  const distressX = Math.sin(frame * 0.07 + rng() * 100) * 0.3;
  const distressY = Math.cos(frame * 0.05 + rng() * 50) * 0.2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity: masterOpacity, mixBlendMode: "screen" }}
      >
        <g transform={`translate(${posX + distressX}, ${posY + distressY})`}>
          {/* Cassette casing — outer rectangle */}
          <rect
            x={0}
            y={0}
            width={casW}
            height={casH}
            rx={4}
            ry={4}
            fill={casingColor}
            stroke="hsla(30, 30%, 35%, 0.5)"
            strokeWidth={1}
          />

          {/* Tape window (darker rectangle in upper portion) */}
          <rect
            x={12}
            y={8}
            width={casW - 24}
            height={casH * 0.42}
            rx={2}
            fill={windowColor}
          />

          {/* Left reel */}
          <g transform={`translate(${casW * 0.3}, ${casH * 0.3})`}>
            <circle cx={0} cy={0} r={reelR} fill={reelColor} />
            <circle cx={0} cy={0} r={hubR} fill={hubColor} />
            {/* Spokes — rotate */}
            {Array.from({ length: spokeCount }).map((_, si) => {
              const angle = (reelRotation + (si * 360) / spokeCount) * (Math.PI / 180);
              return (
                <line
                  key={`ls-${si}`}
                  x1={Math.cos(angle) * hubR}
                  y1={Math.sin(angle) * hubR}
                  x2={Math.cos(angle) * (reelR - 2)}
                  y2={Math.sin(angle) * (reelR - 2)}
                  stroke={hubColor}
                  strokeWidth={1}
                  opacity={0.5}
                />
              );
            })}
          </g>

          {/* Right reel */}
          <g transform={`translate(${casW * 0.7}, ${casH * 0.3})`}>
            <circle cx={0} cy={0} r={reelR} fill={reelColor} />
            <circle cx={0} cy={0} r={hubR} fill={hubColor} />
            {/* Spokes — rotate (slightly different speed) */}
            {Array.from({ length: spokeCount }).map((_, si) => {
              const angle =
                (reelRotation * 1.05 + (si * 360) / spokeCount) * (Math.PI / 180);
              return (
                <line
                  key={`rs-${si}`}
                  x1={Math.cos(angle) * hubR}
                  y1={Math.sin(angle) * hubR}
                  x2={Math.cos(angle) * (reelR - 2)}
                  y2={Math.sin(angle) * (reelR - 2)}
                  stroke={hubColor}
                  strokeWidth={1}
                  opacity={0.5}
                />
              );
            })}
          </g>

          {/* Tape path between reels */}
          <line
            x1={casW * 0.3 + reelR}
            y1={casH * 0.3 + reelR - 2}
            x2={casW * 0.7 - reelR}
            y2={casH * 0.3 + reelR - 2}
            stroke="hsla(30, 20%, 20%, 0.4)"
            strokeWidth={1.5}
          />

          {/* Label area (lower portion of cassette) */}
          <rect
            x={10}
            y={casH * 0.55}
            width={casW - 20}
            height={casH * 0.35}
            rx={2}
            fill={labelBg}
          />

          {/* Label text */}
          <text
            x={casW / 2}
            y={casH * 0.72}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="'Courier New', monospace"
            fontSize={9}
            fontWeight="bold"
            letterSpacing={1.5}
            fill={textColor}
          >
            {labelText}
          </text>

          {/* Taper info line (smaller, below main label) */}
          <text
            x={casW / 2}
            y={casH * 0.84}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="'Courier New', monospace"
            fontSize={6}
            letterSpacing={0.5}
            fill={`hsla(25, 40%, 45%, 0.6)`}
          >
            {showDateShort} {showVenueShort}
          </text>

          {/* Wear marks — subtle horizontal lines across label */}
          {[0.60, 0.67, 0.78].map((yFrac, wi) => {
            const wearRng = seeded((ctx?.showSeed ?? 0) + wi * 97);
            return (
              <line
                key={`w-${wi}`}
                x1={14 + wearRng() * 20}
                y1={casH * yFrac}
                x2={casW - 14 - wearRng() * 20}
                y2={casH * yFrac}
                stroke="hsla(30, 15%, 50%, 0.12)"
                strokeWidth={0.5}
              />
            );
          })}

          {/* Corner screw holes */}
          {[
            [6, 6],
            [casW - 6, 6],
            [6, casH - 6],
            [casW - 6, casH - 6],
          ].map(([sx, sy], si) => (
            <circle
              key={`screw-${si}`}
              cx={sx}
              cy={sy}
              r={2}
              fill="hsla(30, 20%, 35%, 0.4)"
              stroke="hsla(30, 20%, 40%, 0.3)"
              strokeWidth={0.5}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};
