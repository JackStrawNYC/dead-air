/**
 * NeonDeadSign — "GRATEFUL DEAD" in neon tube lettering.
 * Layer 7, tier B, tags: dead-culture, retro.
 * Two lines of text rendered as SVG text with neon glow.
 * Random letter flicker (some letters dim briefly).
 * Glow intensity from energy. Neon colors: chromaHue primary + complementary.
 * Drop shadow for tube depth. Position: top area, slight tilt.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/** Map 0-1 hue to an RGB hex string */
function hueToHex(h: number): string {
  const s = 0.85, l = 0.6;
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) { r = c; g = x; }
  else if (sector === 1) { r = x; g = c; }
  else if (sector === 2) { g = c; b = x; }
  else if (sector === 3) { g = x; b = c; }
  else if (sector === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Seeded pseudo-random for deterministic flicker per letter per frame */
function letterFlicker(frame: number, letterIndex: number): number {
  // Create a deterministic "random" value per letter per ~15-frame window
  const window = Math.floor(frame / 15);
  const seed = (window * 73 + letterIndex * 137) % 256;
  // Only some letters flicker: roughly 1 in 5 chance per window
  if (seed % 5 !== 0) return 1.0;
  // Flicker intensity varies
  const flickerPhase = (frame % 15) / 15;
  // Quick dim and recover
  if (flickerPhase < 0.3) return 0.3 + flickerPhase * 2;
  if (flickerPhase < 0.5) return 0.9;
  return 1.0;
}

/** Render a single neon letter with optional flicker */
const NeonLetter: React.FC<{
  char: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  frame: number;
  index: number;
  energy: number;
  beatDecay: number;
}> = ({ char, x, y, fontSize, color, frame, index, energy, beatDecay }) => {
  const flicker = letterFlicker(frame, index);
  const letterOpacity = flicker * (0.7 + energy * 0.3);
  // Slight per-letter vertical jitter on beat
  const jitterY = Math.sin(frame * 0.2 + index * 1.7) * beatDecay * 1.5;

  return (
    <text
      x={x}
      y={y + jitterY}
      fontSize={fontSize}
      fontFamily="'Arial Black', 'Impact', sans-serif"
      fontWeight="900"
      fill={color}
      opacity={letterOpacity}
      textAnchor="middle"
      style={{
        paintOrder: "stroke",
        stroke: color,
        strokeWidth: 1.5,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }}
    >
      {char}
    </text>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const NeonDeadSign: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Opacity: tier B, 0.15-0.35
  const opacity = interpolate(energy, [0.02, 0.3], [0.15, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Neon colors: primary from chromaHue, complementary offset
  const primaryColor = hueToHex(chromaHue);
  const complementColor = hueToHex(chromaHue + 0.5);

  // Glow from energy
  const glowRadius = interpolate(energy, [0.05, 0.4], [6, 22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slight tilt — oscillates gently
  const tilt = interpolate(
    Math.sin(frame * 0.02 * tempoFactor),
    [-1, 1],
    [-2, 2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Letter layout
  const line1 = "GRATEFUL";
  const line2 = "DEAD";

  const line1Spacing = 22;
  const line2Spacing = 30;
  const line1FontSize = 20;
  const line2FontSize = 28;
  const centerX = 150;
  const line1Y = 42;
  const line2Y = 72;

  // Render line 1: "GRATEFUL"
  const line1Letters: React.ReactNode[] = [];
  const line1Start = centerX - ((line1.length - 1) * line1Spacing) / 2;
  for (let i = 0; i < line1.length; i++) {
    line1Letters.push(
      <NeonLetter
        key={`l1-${i}`}
        char={line1[i]}
        x={line1Start + i * line1Spacing}
        y={line1Y}
        fontSize={line1FontSize}
        color={primaryColor}
        frame={frame}
        index={i}
        energy={energy}
        beatDecay={snap.beatDecay}
      />,
    );
  }

  // Render line 2: "DEAD"
  const line2Letters: React.ReactNode[] = [];
  const line2Start = centerX - ((line2.length - 1) * line2Spacing) / 2;
  for (let i = 0; i < line2.length; i++) {
    line2Letters.push(
      <NeonLetter
        key={`l2-${i}`}
        char={line2[i]}
        x={line2Start + i * line2Spacing}
        y={line2Y}
        fontSize={line2FontSize}
        color={complementColor}
        frame={frame}
        index={i + line1.length}
        energy={energy}
        beatDecay={snap.beatDecay}
      />,
    );
  }

  // Tube shadow offset
  const shadowColor = hueToHex(chromaHue + 0.05);

  const baseWidth = Math.min(width * 0.5, 600);
  const baseHeight = baseWidth * 0.35;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: height * 0.08,
      }}
    >
      <div
        style={{
          transform: `rotate(${tilt}deg)`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${primaryColor}) drop-shadow(0 0 ${glowRadius * 1.5}px ${complementColor}) drop-shadow(2px 3px 2px rgba(0,0,0,0.5))`,
          willChange: "transform, opacity, filter",
        }}
      >
        <svg
          width={baseWidth}
          height={baseHeight}
          viewBox="0 0 300 90"
          fill="none"
        >
          {/* Tube shadow duplicates — offset dark copies for depth */}
          <g opacity="0.15" transform="translate(2, 3)">
            {line1.split("").map((char, i) => (
              <text
                key={`s1-${i}`}
                x={line1Start + i * line1Spacing}
                y={line1Y}
                fontSize={line1FontSize}
                fontFamily="'Arial Black', 'Impact', sans-serif"
                fontWeight="900"
                fill="#000"
                textAnchor="middle"
              >
                {char}
              </text>
            ))}
            {line2.split("").map((char, i) => (
              <text
                key={`s2-${i}`}
                x={line2Start + i * line2Spacing}
                y={line2Y}
                fontSize={line2FontSize}
                fontFamily="'Arial Black', 'Impact', sans-serif"
                fontWeight="900"
                fill="#000"
                textAnchor="middle"
              >
                {char}
              </text>
            ))}
          </g>

          {/* Neon tube outline effect — slightly larger stroke behind */}
          <g opacity="0.3">
            {line1.split("").map((char, i) => (
              <text
                key={`o1-${i}`}
                x={line1Start + i * line1Spacing}
                y={line1Y}
                fontSize={line1FontSize}
                fontFamily="'Arial Black', 'Impact', sans-serif"
                fontWeight="900"
                fill="none"
                stroke={shadowColor}
                strokeWidth="4"
                textAnchor="middle"
              >
                {char}
              </text>
            ))}
            {line2.split("").map((char, i) => (
              <text
                key={`o2-${i}`}
                x={line2Start + i * line2Spacing}
                y={line2Y}
                fontSize={line2FontSize}
                fontFamily="'Arial Black', 'Impact', sans-serif"
                fontWeight="900"
                fill="none"
                stroke={shadowColor}
                strokeWidth="5"
                textAnchor="middle"
              >
                {char}
              </text>
            ))}
          </g>

          {/* Main neon letters */}
          {line1Letters}
          {line2Letters}

          {/* Decorative bracket lines */}
          <line
            x1={line1Start - 20} y1={line1Y - 12}
            x2={line1Start - 20} y2={line2Y + 8}
            stroke={primaryColor}
            strokeWidth="2"
            strokeLinecap="round"
            opacity={0.4 + energy * 0.3}
          />
          <line
            x1={line1Start + (line1.length - 1) * line1Spacing + 20} y1={line1Y - 12}
            x2={line1Start + (line1.length - 1) * line1Spacing + 20} y2={line2Y + 8}
            stroke={primaryColor}
            strokeWidth="2"
            strokeLinecap="round"
            opacity={0.4 + energy * 0.3}
          />
        </svg>
      </div>
    </div>
  );
};
