/**
 * LiquidLightTexture — Generates a 1920x1080 transparent PNG that looks like
 * a 1960s liquid light show projection (oil and water on heated glass with
 * colored light behind it).
 *
 * Technique: Layered SVG feTurbulence patterns with feDisplacementMap,
 * feColorMatrix color tinting, and feComposite blending. No raster images.
 *
 * Render to PNG via:
 *   npx remotion still src/overlay-entry.ts TexturePreview --frame 0 \
 *     --output public/assets/textures/liquid-light-1.png --image-format png \
 *     --props '{"textureName":"LiquidLightTexture","variant":1}'
 */

import React from "react";
import { useVideoConfig } from "remotion";

interface Props {
  variant?: number;
}

export const LiquidLightTexture: React.FC<Props> = ({ variant = 1 }) => {
  const { width, height } = useVideoConfig();

  // Variant controls seed and color palette
  const seed1 = variant * 17 + 3;
  const seed2 = variant * 31 + 7;
  const seed3 = variant * 53 + 11;

  // Color palettes per variant — all psychedelic, all gorgeous
  const palettes: Array<{ h1: number; h2: number; h3: number; sat: number }> = [
    { h1: 320, h2: 40, h3: 180, sat: 85 },   // magenta / gold / cyan
    { h1: 280, h2: 20, h3: 160, sat: 80 },    // purple / orange / teal
    { h1: 0, h2: 60, h3: 220, sat: 90 },      // red / yellow / blue
    { h1: 340, h2: 80, h3: 200, sat: 85 },    // crimson / chartreuse / sky
    { h1: 300, h2: 45, h3: 140, sat: 88 },    // violet / amber / emerald
  ];
  const pal = palettes[(variant - 1) % palettes.length];

  return (
    <div style={{ position: "relative", width, height, background: "transparent" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          {/* === Primary oil/water turbulence layer === */}
          <filter id="ll-tex-primary" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            {/* Large-scale turbulence — the main oil/water pattern */}
            <feTurbulence
              type="turbulence"
              baseFrequency="0.003"
              numOctaves={4}
              seed={seed1}
              result="turb1"
            />
            {/* Warp the turbulence through itself for organic flow */}
            <feDisplacementMap
              in="turb1"
              in2="turb1"
              scale={180}
              xChannelSelector="R"
              yChannelSelector="G"
              result="warped1"
            />
            {/* Color it with palette hue 1 */}
            <feColorMatrix
              in="warped1"
              type="matrix"
              values={`
                ${Math.cos(pal.h1 * Math.PI / 180) * 0.8 + 0.5} 0.1 0 0 0
                0 ${Math.cos((pal.h1 + 120) * Math.PI / 180) * 0.6 + 0.4} 0.1 0 0
                0.1 0 ${Math.cos((pal.h1 + 240) * Math.PI / 180) * 0.7 + 0.5} 0 0
                0 0 0 0.85 0
              `}
            />
          </filter>

          {/* === Secondary flowing layer === */}
          <filter id="ll-tex-secondary" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.005"
              numOctaves={3}
              seed={seed2}
              result="turb2"
            />
            <feDisplacementMap
              in="turb2"
              in2="turb2"
              scale={120}
              xChannelSelector="G"
              yChannelSelector="B"
              result="warped2"
            />
            <feColorMatrix
              in="warped2"
              type="matrix"
              values={`
                ${Math.cos(pal.h2 * Math.PI / 180) * 0.7 + 0.5} 0 0.15 0 0
                0.1 ${Math.cos((pal.h2 + 120) * Math.PI / 180) * 0.7 + 0.5} 0 0 0
                0 0.1 ${Math.cos((pal.h2 + 240) * Math.PI / 180) * 0.6 + 0.4} 0 0
                0 0 0 0.7 0
              `}
            />
          </filter>

          {/* === Fine detail vein layer === */}
          <filter id="ll-tex-veins" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.008"
              numOctaves={5}
              seed={seed3}
              result="turb3"
            />
            <feDisplacementMap
              in="turb3"
              in2="turb3"
              scale={60}
              xChannelSelector="R"
              yChannelSelector="B"
              result="warped3"
            />
            {/* High contrast threshold to create vein-like lines */}
            <feComponentTransfer in="warped3" result="veins">
              <feFuncR type="discrete" tableValues="0 0 0.3 0.8 1 0.8 0.3 0 0" />
              <feFuncG type="discrete" tableValues="0 0 0.2 0.6 0.9 0.6 0.2 0 0" />
              <feFuncB type="discrete" tableValues="0 0 0.4 0.9 1 0.9 0.4 0 0" />
            </feComponentTransfer>
            <feColorMatrix
              in="veins"
              type="matrix"
              values={`
                ${Math.cos(pal.h3 * Math.PI / 180) * 0.5 + 0.5} 0 0 0 0
                0 ${Math.cos((pal.h3 + 120) * Math.PI / 180) * 0.5 + 0.5} 0 0 0
                0 0 ${Math.cos((pal.h3 + 240) * Math.PI / 180) * 0.5 + 0.5} 0 0
                0 0 0 0.55 0
              `}
            />
          </filter>

          {/* === Edge glow / bloom === */}
          <filter id="ll-tex-bloom" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="25" />
            <feColorMatrix
              type="matrix"
              values="1.2 0 0 0 0.05  0 1.2 0 0 0.03  0 0 1.2 0 0.02  0 0 0 0.5 0"
            />
          </filter>

          {/* Vignette gradient */}
          <radialGradient id="ll-tex-vig" cx="50%" cy="50%">
            <stop offset="30%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.5)" />
          </radialGradient>
        </defs>

        {/* Layer 1: Primary oil/water flow */}
        <rect width={width} height={height} filter="url(#ll-tex-primary)" />

        {/* Layer 2: Secondary color flow — screen blended */}
        <rect width={width} height={height} filter="url(#ll-tex-secondary)"
          style={{ mixBlendMode: "screen" }} opacity={0.7} />

        {/* Layer 3: Fine vein detail — screen blended */}
        <rect width={width} height={height} filter="url(#ll-tex-veins)"
          style={{ mixBlendMode: "screen" }} opacity={0.5} />

        {/* Layer 4: Bloom / glow pass — soft light */}
        <rect width={width} height={height} filter="url(#ll-tex-primary)" opacity={0.3}
          style={{ mixBlendMode: "soft-light" }} />
        <rect width={width} height={height} filter="url(#ll-tex-bloom)" opacity={0.25}
          style={{ mixBlendMode: "screen" }} />

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#ll-tex-vig)" />
      </svg>
    </div>
  );
};
