/**
 * SmokeHazeTexture — Generates a 1920x1080 transparent PNG that looks like
 * concert venue smoke/haze with colored stage lighting cutting through it.
 *
 * This is a key atmospheric texture — layered over any shader, it adds the
 * "you are in a smoky concert hall in 1977" feel.
 *
 * Technique: Multiple turbulence layers at different frequencies for smoke
 * density variation, colored radial gradients for stage lighting, gaussian
 * blur for soft atmospheric depth.
 */

import React from "react";
import { useVideoConfig } from "remotion";

interface Props {
  variant?: number;
}

export const SmokeHazeTexture: React.FC<Props> = ({ variant = 1 }) => {
  const { width, height } = useVideoConfig();

  const seed = variant * 37 + 13;

  // Lighting color palettes — stage gels through smoke
  const lightPalettes = [
    { main: [45, 80, 70], fill: [220, 50, 40], accent: [340, 70, 55] },  // warm amber / cool blue / pink
    { main: [20, 85, 65], fill: [180, 45, 35], accent: [280, 60, 50] },  // orange / teal / purple
    { main: [355, 75, 60], fill: [200, 55, 40], accent: [50, 80, 65] },  // red / blue / gold
    { main: [320, 70, 55], fill: [160, 45, 35], accent: [30, 80, 60] },  // magenta / green / amber
  ];
  const lights = lightPalettes[(variant - 1) % lightPalettes.length];

  return (
    <div style={{ position: "relative", width, height, background: "transparent" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          {/* === Smoke density layer 1: large billowing clouds === */}
          <filter id="smoke-cloud" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.002"
              numOctaves={5}
              seed={seed}
              result="smokeBase"
            />
            {/* Self-displacement for organic rolling motion */}
            <feDisplacementMap
              in="smokeBase"
              in2="smokeBase"
              scale={100}
              xChannelSelector="R"
              yChannelSelector="G"
              result="smokeWarped"
            />
            {/* Soften to look like real smoke */}
            <feGaussianBlur in="smokeWarped" stdDeviation="15" result="smokeSoft" />
            {/* Convert to grayscale smoke density */}
            <feColorMatrix
              in="smokeSoft"
              type="matrix"
              values="0.3 0.3 0.3 0 0  0.3 0.3 0.3 0 0  0.3 0.3 0.3 0 0  0 0 0 0.5 0"
            />
          </filter>

          {/* === Smoke layer 2: medium wispy tendrils === */}
          <filter id="smoke-wisps" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.006"
              numOctaves={4}
              seed={seed + 50}
              result="wispBase"
            />
            <feDisplacementMap
              in="wispBase"
              in2="wispBase"
              scale={50}
              xChannelSelector="G"
              yChannelSelector="B"
              result="wispWarped"
            />
            <feGaussianBlur in="wispWarped" stdDeviation="8" result="wispSoft" />
            <feColorMatrix
              in="wispSoft"
              type="matrix"
              values="0.25 0.25 0.25 0 0  0.25 0.25 0.25 0 0  0.25 0.25 0.25 0 0  0 0 0 0.3 0"
            />
          </filter>

          {/* === Stage lighting — colored spots cutting through smoke === */}
          {/* Main spot (top center, angled down) */}
          <radialGradient id="smoke-light-main" cx="50%" cy="5%" r="65%">
            <stop offset="0%" stopColor={`hsl(${lights.main[0]}, ${lights.main[1]}%, ${lights.main[2]}%)`} stopOpacity={0.35} />
            <stop offset="40%" stopColor={`hsl(${lights.main[0]}, ${lights.main[1]}%, ${lights.main[2] - 15}%)`} stopOpacity={0.12} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Fill light (left side) */}
          <radialGradient id="smoke-light-fill" cx="10%" cy="15%" r="55%">
            <stop offset="0%" stopColor={`hsl(${lights.fill[0]}, ${lights.fill[1]}%, ${lights.fill[2]}%)`} stopOpacity={0.22} />
            <stop offset="50%" stopColor={`hsl(${lights.fill[0]}, ${lights.fill[1]}%, ${lights.fill[2] - 10}%)`} stopOpacity={0.06} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Accent light (right side) */}
          <radialGradient id="smoke-light-accent" cx="85%" cy="20%" r="45%">
            <stop offset="0%" stopColor={`hsl(${lights.accent[0]}, ${lights.accent[1]}%, ${lights.accent[2]}%)`} stopOpacity={0.18} />
            <stop offset="45%" stopColor={`hsl(${lights.accent[0]}, ${lights.accent[1]}%, ${lights.accent[2] - 12}%)`} stopOpacity={0.05} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Bottom haze — thicker smoke settles low */}
          <linearGradient id="smoke-bottom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="60%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(180,170,160,0.25)" />
          </linearGradient>

          {/* Vignette */}
          <radialGradient id="smoke-vig" cx="50%" cy="50%">
            <stop offset="40%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.4)" />
          </radialGradient>
        </defs>

        {/* Base smoke clouds */}
        <rect width={width} height={height} filter="url(#smoke-cloud)" opacity={0.6} />

        {/* Stage lighting cutting through */}
        <rect width={width} height={height} fill="url(#smoke-light-main)"
          style={{ mixBlendMode: "screen" }} />
        <rect width={width} height={height} fill="url(#smoke-light-fill)"
          style={{ mixBlendMode: "screen" }} />
        <rect width={width} height={height} fill="url(#smoke-light-accent)"
          style={{ mixBlendMode: "screen" }} />

        {/* Wispy smoke tendrils — lighter, more transparent */}
        <rect width={width} height={height} filter="url(#smoke-wisps)" opacity={0.4}
          style={{ mixBlendMode: "screen" }} />

        {/* Light beams interacting with smoke — volumetric cones */}
        {[0.3, 0.5, 0.7].map((xPct, i) => {
          const beamHue = [lights.main[0], lights.fill[0], lights.accent[0]][i];
          const beamWidth = 60 + i * 20;
          return (
            <path key={`beam-${i}`}
              d={`M ${xPct * width} 0 L ${xPct * width - beamWidth} ${height} L ${xPct * width + beamWidth} ${height} Z`}
              fill={`hsl(${beamHue}, 60%, 55%)`}
              opacity={0.04 + i * 0.01}
              style={{ mixBlendMode: "screen" }}
            />
          );
        })}

        {/* Bottom haze */}
        <rect width={width} height={height} fill="url(#smoke-bottom)" />

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#smoke-vig)" />
      </svg>
    </div>
  );
};
