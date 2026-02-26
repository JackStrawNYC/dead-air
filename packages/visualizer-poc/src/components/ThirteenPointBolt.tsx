/**
 * ThirteenPointBolt — Standalone 13-point lightning bolt from the Steal Your Face logo.
 * ~60% viewport height, pulses with energy, rotates slowly, neon glow intensifies on beats.
 * Color shifts with chroma (same technique as BreathingStealie).
 * Accent-eligible (high energy band).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Map 0-1 hue to an RGB hex string (s=0.85, l=0.6) */
function hueToHex(h: number): string {
  const s = 0.85;
  const l = 0.6;
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

/** 13-point lightning bolt SVG — the GD bolt geometry scaled standalone */
const Bolt: React.FC<{ size: number; color: string; glowColor: string }> = ({
  size,
  color,
  glowColor,
}) => (
  <svg width={size} height={size} viewBox="0 0 200 300" fill="none">
    <defs>
      <linearGradient id="bolt-grad" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor={glowColor} />
        <stop offset="50%" stopColor={color} />
        <stop offset="100%" stopColor={glowColor} />
      </linearGradient>
    </defs>
    {/* Main bolt: 13-point zigzag polygon */}
    <polygon
      points="100,0 85,55 110,60 75,120 105,125 65,195 100,198 55,280 130,175 95,170 125,110 90,105 120,45"
      fill="url(#bolt-grad)"
      stroke={glowColor}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    {/* Inner highlight for dimensionality */}
    <polygon
      points="100,15 88,55 108,60 80,115 103,120 72,185 100,188 65,265 122,178 97,173 120,115 93,110 115,50"
      fill={color}
      opacity="0.6"
    />
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const ThirteenPointBolt: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Smooth energy (wide window — 151 frames)
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Smooth chroma hue (31-frame window)
  let chromaSum = 0;
  let chromaCount = 0;
  for (let i = Math.max(0, idx - 15); i <= Math.min(frames.length - 1, idx + 15); i++) {
    const ch = frames[i].chroma;
    let maxI = 0;
    for (let j = 1; j < 12; j++) {
      if (ch[j] > ch[maxI]) maxI = j;
    }
    chromaSum += maxI / 12;
    chromaCount++;
  }
  const chromaHue = chromaCount > 0 ? chromaSum / chromaCount : 0;

  // Beat flash: detect beat, 4-frame decay
  let beatFlash = 0;
  for (let lookback = 0; lookback < 4; lookback++) {
    const bi = idx - lookback;
    if (bi >= 0 && frames[bi].beat) {
      beatFlash = Math.max(beatFlash, 0.3 * (1 - lookback / 4));
    }
  }

  // Size: ~60% viewport height
  const baseSize = Math.min(width, height) * 0.6;
  const breathe = interpolate(energy, [0.03, 0.35], [0.9, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow rotation: ~2 deg/s
  const rotation = (frame / 30) * 2;

  // Opacity: energy-gated (fades below 0.08)
  const baseOpacity = interpolate(energy, [0.02, 0.3], [0.08, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(baseOpacity + beatFlash, 0.75);

  // Colors from chroma
  const boltColor = hueToHex(chromaHue);
  const glowColor = hueToHex(chromaHue + 0.15);

  // Glow radius: energy-driven (4-20px) + beat boost
  const baseGlow = interpolate(energy, [0.05, 0.3], [4, 20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowRadius = baseGlow + beatFlash * 30;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transform: `rotate(${rotation}deg) scale(${breathe})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${boltColor}) drop-shadow(0 0 ${glowRadius * 2}px ${glowColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <Bolt size={baseSize} color={boltColor} glowColor={glowColor} />
      </div>
    </div>
  );
};
