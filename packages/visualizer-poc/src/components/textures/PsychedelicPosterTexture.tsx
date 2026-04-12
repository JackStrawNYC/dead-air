/**
 * PsychedelicPosterTexture — Generates a 1920x1080 transparent PNG that looks
 * like a vintage 1960s concert poster background — swirling lettering-style
 * distortion fields, saturated color bands, art nouveau curves.
 *
 * Think: Fillmore West / Avalon Ballroom poster backgrounds by Wes Wilson,
 * Victor Moscoso, Rick Griffin. Not the text — just the psychedelic color field
 * backgrounds those posters used.
 *
 * Technique: Multiple displaced turbulence layers with color banding (discrete
 * transfer functions) for that characteristic poster-print look.
 */

import React from "react";
import { useVideoConfig } from "remotion";

interface Props {
  variant?: number;
}

export const PsychedelicPosterTexture: React.FC<Props> = ({ variant = 1 }) => {
  const { width, height } = useVideoConfig();

  const seed = variant * 41 + 17;

  // Poster color palettes — high saturation, limited palette per variant
  const palettes = [
    { bg: "#1a0a2e", colors: ["#ff2d55", "#ff9500", "#ffcc00", "#4cd964"] },  // purple bg, warm rainbow
    { bg: "#0a1a2e", colors: ["#00d4ff", "#7b68ee", "#ff6b9d", "#ffd700"] },  // navy bg, electric
    { bg: "#2e0a1a", colors: ["#ff4500", "#ff8c00", "#ffd700", "#ff69b4"] },  // dark red bg, fire
    { bg: "#0a2e1a", colors: ["#00ff88", "#00d4ff", "#ff6b9d", "#ffd700"] },  // forest bg, neon
    { bg: "#1a1a2e", colors: ["#8b5cf6", "#ec4899", "#f59e0b", "#10b981"] },  // midnight, jewel tones
  ];
  const pal = palettes[(variant - 1) % palettes.length];

  return (
    <div style={{ position: "relative", width, height, background: "transparent" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          {/* === Swirling distortion field === */}
          <filter id="poster-swirl" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            {/* Low-frequency turbulence for large swirling forms */}
            <feTurbulence
              type="turbulence"
              baseFrequency="0.002"
              numOctaves={3}
              seed={seed}
              result="swirlBase"
            />
            {/* Heavy displacement creates the characteristic poster distortion */}
            <feDisplacementMap
              in="swirlBase"
              in2="swirlBase"
              scale={250}
              xChannelSelector="R"
              yChannelSelector="G"
              result="swirlWarped"
            />
            {/* Color banding — discrete steps for that print/screen look */}
            <feComponentTransfer in="swirlWarped" result="banded">
              <feFuncR type="discrete" tableValues="0.05 0.15 0.35 0.65 0.85 0.95 0.85 0.55 0.25 0.1" />
              <feFuncG type="discrete" tableValues="0.02 0.10 0.25 0.50 0.75 0.90 0.95 0.70 0.35 0.08" />
              <feFuncB type="discrete" tableValues="0.08 0.20 0.45 0.70 0.55 0.30 0.15 0.40 0.65 0.85" />
            </feComponentTransfer>
          </filter>

          {/* === Secondary flow layer — offset pattern === */}
          <filter id="poster-flow" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.004"
              numOctaves={4}
              seed={seed + 30}
              result="flowBase"
            />
            <feDisplacementMap
              in="flowBase"
              in2="flowBase"
              scale={150}
              xChannelSelector="G"
              yChannelSelector="B"
              result="flowWarped"
            />
            <feComponentTransfer in="flowWarped" result="flowBanded">
              <feFuncR type="discrete" tableValues="0.1 0.3 0.6 0.9 0.7 0.4 0.15" />
              <feFuncG type="discrete" tableValues="0.05 0.2 0.5 0.8 0.9 0.6 0.2" />
              <feFuncB type="discrete" tableValues="0.15 0.4 0.7 0.5 0.3 0.5 0.8" />
            </feComponentTransfer>
          </filter>

          {/* === Art nouveau curves — flowing lines === */}
          <filter id="poster-curves" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.006 0.002"
              numOctaves={5}
              seed={seed + 60}
              result="curveBase"
            />
            <feDisplacementMap
              in="curveBase"
              in2="curveBase"
              scale={80}
              xChannelSelector="R"
              yChannelSelector="G"
              result="curveWarped"
            />
            {/* Sharp threshold for thin contour lines */}
            <feComponentTransfer in="curveWarped" result="curveLines">
              <feFuncR type="discrete" tableValues="0 0 0 0.8 1 0.8 0 0 0 0" />
              <feFuncG type="discrete" tableValues="0 0 0 0.6 0.9 0.6 0 0 0 0" />
              <feFuncB type="discrete" tableValues="0 0 0 0.5 0.8 0.5 0 0 0 0" />
            </feComponentTransfer>
          </filter>

          {/* === Halftone / print screen texture === */}
          <filter id="poster-halftone" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="turbulence"
              baseFrequency="4"
              numOctaves={1}
              seed={0}
              result="dots"
            />
            <feColorMatrix in="dots" type="saturate" values="0" result="grayDots" />
            <feComponentTransfer in="grayDots" result="dotPattern">
              <feFuncR type="discrete" tableValues="0.92 0.95 1 1 0.97 0.94" />
              <feFuncG type="discrete" tableValues="0.92 0.95 1 1 0.97 0.94" />
              <feFuncB type="discrete" tableValues="0.92 0.95 1 1 0.97 0.94" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" in2="dotPattern" mode="multiply" />
          </filter>

          {/* Vignette */}
          <radialGradient id="poster-vig" cx="50%" cy="50%">
            <stop offset="35%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
        </defs>

        {/* Dark background */}
        <rect width={width} height={height} fill={pal.bg} />

        {/* Primary swirling color field */}
        <rect width={width} height={height} filter="url(#poster-swirl)" opacity={0.85} />

        {/* Secondary flow — screen blended for color mixing */}
        <rect width={width} height={height} filter="url(#poster-flow)" opacity={0.4}
          style={{ mixBlendMode: "screen" }} />

        {/* Art nouveau contour lines */}
        <rect width={width} height={height} filter="url(#poster-curves)" opacity={0.25}
          style={{ mixBlendMode: "screen" }} />

        {/* Colored accent spots from palette */}
        {pal.colors.map((color, i) => {
          const cx = width * (0.2 + i * 0.2 + ((seed * (i + 1)) % 10) * 0.01);
          const cy = height * (0.3 + ((seed * (i + 3)) % 10) * 0.04);
          const r = Math.min(width, height) * (0.15 + i * 0.03);
          return (
            <circle key={`accent-${i}`} cx={cx} cy={cy} r={r}
              fill={color} opacity={0.12}
              style={{ mixBlendMode: "color-dodge" }} />
          );
        })}

        {/* Halftone print texture */}
        <rect width={width} height={height} fill="white" filter="url(#poster-halftone)" opacity={0.06}
          style={{ mixBlendMode: "multiply" }} />

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#poster-vig)" />
      </svg>
    </div>
  );
};
