/**
 * TieDyeFabricTexture — Generates a 1920x1080 transparent PNG that looks like
 * real tie-dyed fabric with spiral fold patterns, dye bleeding, and cloth texture.
 *
 * Key difference from v1: all color wedges are grouped and distorted TOGETHER
 * so colors bleed into each other at boundaries (not individually filtered).
 * Added: white undyed patches, splotchy saturation, off-center messy spiral.
 */

import React from "react";
import { useVideoConfig } from "remotion";

interface Props {
  variant?: number;
}

export const TieDyeFabricTexture: React.FC<Props> = ({ variant = 1 }) => {
  const { width, height } = useVideoConfig();

  const seed = variant * 23 + 5;

  // Tie-dye color palettes — authentic Dead-era rainbow spirals
  const palettes = [
    [355, 30, 60, 120, 195, 270, 310],
    [340, 15, 45, 55, 280, 310, 340],
    [180, 210, 240, 270, 300, 320, 340],
    [0, 35, 60, 120, 200, 280, 330],
    [280, 300, 320, 340, 10, 30, 50],
  ];
  const hues = palettes[(variant - 1) % palettes.length];

  // Off-center spiral point — real tie-dye is never perfectly centered
  const cx = width * (0.45 + ((seed * 7) % 10) * 0.01);
  const cy = height * (0.43 + ((seed * 13) % 10) * 0.014);
  const r = Math.max(width, height) * 0.85;

  return (
    <div style={{ position: "relative", width, height, background: "transparent", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          {/* === MASTER BLEED FILTER — applied to entire spiral group ===
              This is the key: all colors are distorted together so they
              bleed INTO each other at boundaries, like real dye on fabric */}
          <filter id="td-master-bleed" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            {/* Pass 1: Large-scale warp — big organic distortion */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.003"
              numOctaves={5}
              seed={seed}
              result="bigWarp"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="bigWarp"
              scale={200}
              xChannelSelector="R"
              yChannelSelector="G"
              result="pass1"
            />
            {/* Pass 2: Medium distortion — breaks up the wedge geometry */}
            <feTurbulence
              type="turbulence"
              baseFrequency="0.008"
              numOctaves={4}
              seed={seed + 17}
              result="medWarp"
            />
            <feDisplacementMap
              in="pass1"
              in2="medWarp"
              scale={80}
              xChannelSelector="G"
              yChannelSelector="B"
              result="pass2"
            />
            {/* Pass 3: Fine feathering at color boundaries */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.02"
              numOctaves={3}
              seed={seed + 31}
              result="fineWarp"
            />
            <feDisplacementMap
              in="pass2"
              in2="fineWarp"
              scale={25}
              xChannelSelector="R"
              yChannelSelector="B"
              result="pass3"
            />
            {/* Slight blur to simulate dye diffusion in fabric */}
            <feGaussianBlur in="pass3" stdDeviation="4" />
          </filter>

          {/* === WHITE PATCH MASK — undyed areas where rubber bands were tight === */}
          <filter id="td-white-patches" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.006"
              numOctaves={4}
              seed={seed + 50}
              result="patchNoise"
            />
            <feColorMatrix in="patchNoise" type="saturate" values="0" result="grayPatch" />
            {/* Threshold: only narrow band becomes "white" (undyed) */}
            <feComponentTransfer in="grayPatch" result="patchMask">
              <feFuncR type="discrete" tableValues="0 0 0 0 0 0.6 0.9 1 0.9 0.6 0 0 0 0 0" />
              <feFuncG type="discrete" tableValues="0 0 0 0 0 0.6 0.9 1 0.9 0.6 0 0 0 0 0" />
              <feFuncB type="discrete" tableValues="0 0 0 0 0 0.6 0.9 1 0.9 0.6 0 0 0 0 0" />
              <feFuncA type="discrete" tableValues="0 0 0 0 0 0.3 0.5 0.6 0.5 0.3 0 0 0 0 0" />
            </feComponentTransfer>
          </filter>

          {/* === SPLOTCHY SATURATION — uneven dye absorption === */}
          <filter id="td-splotch" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.01"
              numOctaves={3}
              seed={seed + 80}
              result="splotchNoise"
            />
            <feColorMatrix in="splotchNoise" type="saturate" values="0" result="graySplotch" />
            <feComponentTransfer in="graySplotch" result="splotchPattern">
              <feFuncR type="linear" slope="0.35" intercept="0.70" />
              <feFuncG type="linear" slope="0.35" intercept="0.70" />
              <feFuncB type="linear" slope="0.35" intercept="0.70" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" in2="splotchPattern" mode="multiply" />
          </filter>

          {/* === FABRIC WEAVE — cotton texture === */}
          <filter id="td-weave" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="turbulence"
              baseFrequency="1.5 0.8"
              numOctaves={2}
              seed={42}
              result="weave"
            />
            <feColorMatrix in="weave" type="saturate" values="0" result="grayWeave" />
            <feComponentTransfer in="grayWeave" result="weaveContrast">
              <feFuncR type="linear" slope="0.18" intercept="0.85" />
              <feFuncG type="linear" slope="0.18" intercept="0.85" />
              <feFuncB type="linear" slope="0.18" intercept="0.85" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" in2="weaveContrast" mode="multiply" />
          </filter>

          {/* === FOLD CREASES — radial lines from the tie point === */}
          <filter id="td-creases" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.003 0.015"
              numOctaves={6}
              seed={seed + 20}
              result="creaseNoise"
            />
            <feColorMatrix in="creaseNoise" type="saturate" values="0" result="grayCrease" />
            <feComponentTransfer in="grayCrease" result="creaseLines">
              <feFuncR type="discrete" tableValues="1 1 1 0.6 0.3 0.6 1 1 1 1" />
              <feFuncG type="discrete" tableValues="1 1 1 0.6 0.3 0.6 1 1 1 1" />
              <feFuncB type="discrete" tableValues="1 1 1 0.6 0.3 0.6 1 1 1 1" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" in2="creaseLines" mode="multiply" />
          </filter>

          {/* Vignette */}
          <radialGradient id="td-vig" cx="50%" cy="50%">
            <stop offset="40%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.30)" />
          </radialGradient>
        </defs>

        {/* Base fabric: off-white */}
        <rect width={width} height={height} fill="#f5f0e8" />

        {/* ===== ALL SPIRAL WEDGES IN ONE GROUP — bleed filter on the whole group ===== */}
        <g filter="url(#td-master-bleed)">
          {hues.map((h, i) => {
            const angle = (i / hues.length) * 360;
            const nextAngle = ((i + 1) / hues.length) * 360;
            const x1 = cx + Math.cos(angle * Math.PI / 180) * r;
            const y1 = cy + Math.sin(angle * Math.PI / 180) * r;
            const x2 = cx + Math.cos(nextAngle * Math.PI / 180) * r;
            const y2 = cy + Math.sin(nextAngle * Math.PI / 180) * r;
            const largeArc = nextAngle - angle > 180 ? 1 : 0;
            // Vary saturation per wedge — some more washed out
            const sat = 70 + ((seed * (i + 1)) % 20);
            const lit = 42 + ((seed * (i + 2)) % 15);
            return (
              <path key={`spiral-${i}`}
                d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={`hsl(${h}, ${sat}%, ${lit}%)`}
              />
            );
          })}
        </g>

        {/* White undyed patches — where rubber bands blocked the dye */}
        <rect width={width} height={height} fill="#f5f0e8" filter="url(#td-white-patches)" />

        {/* Splotchy saturation — uneven dye absorption */}
        <rect width={width} height={height} fill="white" filter="url(#td-splotch)" opacity={0.25}
          style={{ mixBlendMode: "multiply" }} />

        {/* Fabric weave texture */}
        <rect width={width} height={height} fill="white" filter="url(#td-weave)" opacity={0.22}
          style={{ mixBlendMode: "multiply" }} />

        {/* Fold crease lines */}
        <rect width={width} height={height} fill="white" filter="url(#td-creases)" opacity={0.15}
          style={{ mixBlendMode: "multiply" }} />

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#td-vig)" />
      </svg>
    </div>
  );
};
